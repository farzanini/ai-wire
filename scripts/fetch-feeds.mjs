// Fetches the AI news feeds listed in feeds.json and writes dist/data/stories.json.
// No dependencies: Node 20+ only.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const ROOT = new URL("..", import.meta.url);
const FEEDS = JSON.parse(await readFile(new URL("feeds.json", ROOT), "utf8"));
const KEEP_DAYS = { news: 14, papers: 120, podcasts: 45 };
const PER_FEED = 40;
const SUMMARY_MAX = 700;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function text(raw) {
  if (!raw) return "";
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = decode(s);                                  // feeds often escape their HTML
  s = s.replace(/<(script|style|figure|figcaption)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decode(s);
  return s.replace(/\s+/g, " ").trim();
}

function tag(block, names) {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i"));
    if (m && m[1].trim()) return m[1];
  }
  return "";
}

function link(block) {
  const alt = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
    || block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["']/i);
  if (alt) return decode(alt[1]);
  const plain = tag(block, ["link"]);
  if (plain) return text(plain);
  const href = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
  return href ? decode(href[1]) : "";
}

function clip(s) {
  if (s.length <= SUMMARY_MAX) return s;
  const cut = s.slice(0, SUMMARY_MAX);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return (stop > 200 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, "")) + (stop > 200 ? "" : "…");
}

export function parse(xml, feed) {
  const source = feed.name, section = feed.section || "news";
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  const out = [];
  for (const b of blocks.slice(0, PER_FEED)) {
    const title = text(tag(b, ["title"]));
    const audio = decode((b.match(/<enclosure\b[^>]*\burl=["']([^"']+)["']/i) || [])[1] || "").trim().replace(/^http:/, "https:");
    const url = link(b).trim() || (section === "podcasts" ? audio : "");
    const when = new Date(text(tag(b, ["pubDate", "published", "updated", "dc:date", "prism:publicationDate"])));
    if (!title || !/^https?:\/\//.test(url) || isNaN(when)) continue;
    let summary = text(tag(b, ["description", "summary", "content:encoded", "content"]));
    summary = summary.replace(/\s*(Read more|Continue reading|The post .* appeared first on .*)\.?\s*$/i, "").trim();
    const item = {
      id: createHash("sha1").update(url).digest("hex").slice(0, 12),
      title, source, section, url: url.replace(/^http:/, "https:"),
      date: when.toISOString(), summary: clip(summary),
    };
    if (section === "papers") {
      const names = [...b.matchAll(/<(dc:creator|author)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((m) => text(tag(m[2], ["name"]) || m[2])).filter(Boolean);
      if (names.length) item.authors = names.length > 4 ? names.slice(0, 3).join(", ") + " et al." : names.join(", ");
    } else if (section === "podcasts") {
      if (!/^https:\/\//.test(audio)) continue;          // episodes without playable audio are skipped
      item.audio = audio;
      const d = text(tag(b, ["itunes:duration"]));
      const secs = /^\d+$/.test(d) ? +d : d.split(":").reduce((a, n) => a * 60 + (+n || 0), 0);
      if (secs > 0) item.duration = secs >= 3600 ? `${Math.floor(secs / 3600)} h ${Math.round((secs % 3600) / 60)} min` : `${Math.max(1, Math.round(secs / 60))} min`;
    } else item.topic = feed.topic || "AI";
    out.push(item);
  }
  return out;
}

async function load(feed) {
  const res = await fetch(feed.url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; AIWireReader/1.0)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return parse(await res.text(), feed);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const status = [];
  const seen = new Set();
  let stories = [];
  const results = await Promise.allSettled(FEEDS.map(load));
  results.forEach((r, i) => {
    const name = FEEDS[i].name;
    if (r.status === "rejected") { status.push({ name, url: FEEDS[i].url, ok: false, error: String(r.reason?.message || r.reason) }); return; }
    const fresh = r.value.filter((s) => Date.parse(s.date) >= Date.now() - KEEP_DAYS[s.section] * 864e5 && Date.parse(s.date) <= Date.now() + 864e5);
    status.push({ name, ok: true, count: fresh.length });
    for (const s of fresh) if (!seen.has(s.id)) { seen.add(s.id); stories.push(s); }
  });
  stories.sort((a, b) => (a.date < b.date ? 1 : -1));
  console.table(status);
  if (!stories.length) { console.error("No stories fetched from any feed; keeping the previous build."); process.exit(1); }
  await mkdir(new URL("dist/data/", ROOT), { recursive: true });
  await writeFile(new URL("dist/data/stories.json", ROOT), JSON.stringify({ updatedAt: new Date().toISOString(), feeds: status, stories }));
  console.log(`Wrote ${stories.length} stories.`);
}

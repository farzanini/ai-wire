// Fetches the AI news feeds listed in feeds.json and writes site/data/stories.json.
// No dependencies: Node 20+ only.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const ROOT = new URL("..", import.meta.url);
const FEEDS = JSON.parse(await readFile(new URL("feeds.json", ROOT), "utf8"));
const KEEP_DAYS = 14;
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

export function parse(xml, source) {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  const out = [];
  for (const b of blocks.slice(0, PER_FEED)) {
    const title = text(tag(b, ["title"]));
    const url = link(b).trim();
    const when = new Date(text(tag(b, ["pubDate", "published", "updated", "dc:date"])));
    if (!title || !/^https?:\/\//.test(url) || isNaN(when)) continue;
    let summary = text(tag(b, ["description", "summary", "content:encoded", "content"]));
    summary = summary.replace(/\s*(Read more|Continue reading|The post .* appeared first on .*)\.?\s*$/i, "").trim();
    out.push({
      id: createHash("sha1").update(url).digest("hex").slice(0, 12),
      title, source, url: url.replace(/^http:/, "https:"),
      date: when.toISOString(), summary: clip(summary),
    });
  }
  return out;
}

async function load(feed) {
  const res = await fetch(feed.url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; AIWireReader/1.0)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return parse(await res.text(), feed.name);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  const status = [];
  const seen = new Set();
  let stories = [];
  const results = await Promise.allSettled(FEEDS.map(load));
  results.forEach((r, i) => {
    const name = FEEDS[i].name;
    if (r.status === "rejected") { status.push({ name, ok: false, error: String(r.reason?.message || r.reason) }); return; }
    const fresh = r.value.filter((s) => Date.parse(s.date) >= cutoff && Date.parse(s.date) <= Date.now() + 864e5);
    status.push({ name, ok: true, count: fresh.length });
    for (const s of fresh) if (!seen.has(s.id)) { seen.add(s.id); stories.push(s); }
  });
  stories.sort((a, b) => (a.date < b.date ? 1 : -1));
  console.table(status);
  if (!stories.length) { console.error("No stories fetched from any feed; keeping the previous build."); process.exit(1); }
  await mkdir(new URL("site/data/", ROOT), { recursive: true });
  await writeFile(new URL("site/data/stories.json", ROOT), JSON.stringify({ updatedAt: new Date().toISOString(), feeds: status, stories }));
  console.log(`Wrote ${stories.length} stories.`);
}

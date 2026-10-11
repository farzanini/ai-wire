import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowUpRight, CheckCheck, Languages, LoaderCircle, Moon, Play, RefreshCw, Rss, Sun, X } from "lucide-react";
import { TARGET, translate, translatedPage } from "@/lib/translate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Section = "news" | "papers" | "podcasts" | "videos";
type Story = { id: string; title: string; source: string; url: string; date: string; summary: string; section?: Section; topic?: string; authors?: string; audio?: string; duration?: string; video?: string };

const TOPICS = ["AI", "Machine learning", "Big data", "Business"];
const SECTIONS: { id: Section; label: string }[] = [{ id: "news", label: "News" }, { id: "papers", label: "Papers" }, { id: "podcasts", label: "Podcasts" }, { id: "videos", label: "Videos" }];

const store = {
  get<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
  },
  set(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
};

function dayLabel(iso: string) {
  const d = new Date(iso), today = new Date(), y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function useDesktop() {
  const [wide, setWide] = useState(() => matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const mq = matchMedia("(min-width: 768px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

const ease = [0.22, 1, 0.36, 1] as const;

export default function App() {
  const [stories, setStories] = useState<Story[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState("");
  const [section, setSection] = useState<Section>(() => { const v = store.get<string>("aiwire.section", "news"); return v === "papers" || v === "podcasts" || v === "videos" ? v : "news"; });
  const [playing, setPlaying] = useState<Story | null>(null);
  const [filter, setFilter] = useState("All");
  const [current, setCurrent] = useState<string | null>(null);
  const [read, setRead] = useState<Record<string, 1>>(() => store.get("aiwire.read", {}));
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const desktop = useDesktop();
  const [trOn, setTrOn] = useState(() => store.get("aiwire.translate", false));
  const [tr, setTr] = useState<Record<string, { title: string; summary: string }>>({});
  const [trState, setTrState] = useState<"idle" | "busy" | "failed">("idle");
  const readerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setBusy(true);
    fetch("data/stories.json?t=" + Date.now())
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d) => {
        const list: Story[] = (d.stories || []).filter((s: Story) => s && s.title && /^https:\/\//.test(s.url || "") && !isNaN(+new Date(s.date)));
        setStories(list);
        const t = new Date(d.updatedAt);
        setUpdated(isNaN(+t) ? "" : t.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));
        setStatus("ready");
      })
      .catch(() => setStatus((s) => (s === "ready" ? s : "error")))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    load();
    const on = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [load]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#16181d" : "#ffffff");
  }, [dark]);

  const papers = section === "papers";
  const pods = section === "podcasts";
  const vids = section === "videos";
  const bySource = papers || pods || vids;
  const inSection = useMemo(() => stories.filter((s) => (s.section || "news") === section), [stories, section]);
  const chips = useMemo(() => {
    const groups = bySource
      ? [...new Set(inSection.map((s) => s.source))].sort()
      : TOPICS.filter((t) => inSection.some((s) => (s.topic || "AI") === t));
    return ["All", "Unread", ...groups];
  }, [inSection, bySource]);
  const visible = useMemo(
    () => inSection.filter((s) => (filter === "All" ? true : filter === "Unread" ? !read[s.id] || s.id === current : (bySource ? s.source : s.topic || "AI") === filter)),
    [inSection, filter, read, current, bySource]
  );
  const unreadBy = useMemo(() => {
    const n: Record<Section, number> = { news: 0, papers: 0, podcasts: 0, videos: 0 };
    stories.forEach((s) => { if (!read[s.id]) n[s.section || "news"]++; });
    return n;
  }, [stories, read]);
  const pick = (id: Section) => { setSection(id); setFilter("All"); store.set("aiwire.section", id); if (desktop) setCurrent(null); };
  const story = useMemo(() => stories.find((s) => s.id === current) || null, [stories, current]);

  const persist = useCallback((next: Record<string, 1>) => {
    const live: Record<string, 1> = {};
    stories.forEach((s) => { if (next[s.id]) live[s.id] = 1; });   // forget stories that have aged out
    store.set("aiwire.read", live);
  }, [stories]);

  const open = useCallback((id: string) => {
    setCurrent(id);
    setRead((r) => { if (r[id]) return r; const n = { ...r, [id]: 1 as const }; persist(n); return n; });
    if (!matchMedia("(min-width: 768px)").matches && history.state !== "story") history.pushState("story", "");
    readerRef.current?.scrollTo({ top: 0 });
  }, [persist]);

  const close = useCallback(() => { if (history.state === "story") history.back(); else setCurrent(null); }, []);

  useEffect(() => {
    const on = () => { if (!matchMedia("(min-width: 768px)").matches) setCurrent(null); };   // Android back returns to the list
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "j" || k === "k") {
        const i = visible.findIndex((s) => s.id === current);
        const n = k === "j" ? Math.min(visible.length - 1, i + 1) : Math.max(0, i - 1);
        if (visible[n]) { open(visible[n].id); document.getElementById("s-" + visible[n].id)?.scrollIntoView({ block: "nearest" }); }
      } else if (k === "o" && story) window.open(story.url, "_blank", "noopener");
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [visible, current, story, open]);

  const markAll = () => {
    const n = { ...read };
    visible.forEach((s) => { n[s.id] = 1; });
    setRead(n); persist(n);
  };
  const toggleTheme = () => { store.set("aiwire.theme", dark ? "light" : "dark"); setDark(!dark); };

  // While translation is switched on, translate each story as it is opened.
  useEffect(() => {
    if (!trOn || !story || tr[story.id]) { setTrState("idle"); return; }
    let live = true;
    setTrState("busy");
    translate(story.summary ? [story.title, story.summary] : [story.title])
      .then(([title, summary = ""]) => { if (live) { setTr((m) => ({ ...m, [story.id]: { title, summary } })); setTrState("idle"); } })
      .catch(() => { if (live) setTrState("failed"); });
    return () => { live = false; };
  }, [trOn, story, tr]);
  const toggleTr = () => { store.set("aiwire.translate", !trOn); setTrOn(!trOn); };
  const shown = trOn && story ? tr[story.id] : undefined;
  const rtl = !!shown && TARGET.rtl;

  useEffect(() => {
    if (!playing || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: playing.title, artist: playing.source, album: "AI Wire" });
  }, [playing]);

  let lastDay = "";

  const article = story && (
    <motion.article
      key={story.id}
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, ease }}
      className="mx-auto max-w-[64ch]"
    >
      <Badge variant="secondary" className="font-mono uppercase tracking-wider">{story.source}</Badge>
      <h1 dir={rtl ? "rtl" : undefined} className={cn("mt-4 text-[clamp(1.7rem,3.4vw,2.35rem)] font-semibold text-balance", rtl ? "font-fa leading-[1.5]" : "font-serif leading-[1.14]")}>{shown?.title || story.title}</h1>
      <p className="mt-3 border-b pb-5 font-mono text-xs text-muted-foreground">
        {story.authors ? story.authors + " · " : ""}{dayLabel(story.date)}{story.section === "papers" ? "" : story.section === "podcasts" ? (story.duration ? " · " + story.duration : "") : " · " + clock(story.date)}
      </p>
      {story.video && <VideoBox key={story.id} id={story.video} title={story.title} onPlay={() => setPlaying(null)} />}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant={trOn ? "secondary" : "outline"} size="sm" onClick={toggleTr} aria-pressed={trOn}>
          {trState === "busy" ? <LoaderCircle className="animate-spin" /> : <Languages />}
          {trOn ? "Show original" : "Translate to " + TARGET.name}
        </Button>
        {trState === "failed" && (
          <span className="text-[13px] text-muted-foreground">
            Translation is not available right now.{" "}
            <a className="text-primary underline underline-offset-4" href={translatedPage(story.url)} target="_blank" rel="noopener">Open the article in Google Translate</a>
          </span>
        )}
      </div>
      <motion.p
        key={shown ? "tr" : "orig"} dir={rtl ? "rtl" : undefined}
        initial={{ opacity: 0, y: shown ? 6 : 0 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: shown ? 0 : 0.12, duration: 0.4 }}
        className={cn("mt-6 text-[1.2rem]", rtl ? "font-fa leading-[2]" : "font-serif leading-[1.62]")}
      >
        {shown?.summary || story.summary || (story.section === "videos" ? "The channel gave no description for this video." : story.section === "podcasts" ? "The show's feed gave no description for this episode." : story.section === "papers" ? "The journal's feed gave no abstract for this paper." : "The publisher's feed gave no excerpt for this story.")}
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.35, ease }} className="mt-8">
        {story.video ? (
          <Button asChild size="lg" variant="outline">
            <a href={story.url} target="_blank" rel="noopener">Open on YouTube <ArrowUpRight /></a>
          </Button>
        ) : story.audio ? (
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => setPlaying(story)} disabled={playing?.id === story.id}>
              <Play className="fill-current" /> {playing?.id === story.id ? "Playing now" : "Play episode"}
            </Button>
            {story.url !== story.audio && (
              <Button asChild variant="outline" size="lg">
                <a href={story.url} target="_blank" rel="noopener">Episode page <ArrowUpRight /></a>
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg" className="group">
              <a href={story.url} target="_blank" rel="noopener">
                {story.section === "papers" ? "Read the paper at " : "Read the full story at "}{story.source}
                <ArrowUpRight className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={translatedPage(story.url)} target="_blank" rel="noopener"><Languages /> Full article in {TARGET.name}</a>
            </Button>
          </div>
        )}
        <p className="mt-4 text-[13px] text-muted-foreground">{story.section === "videos"
            ? "This is the channel's own description. The video plays from YouTube."
            : story.section === "podcasts"
            ? "This is the show's own episode description. The episode plays from the show's host and keeps playing while you browse."
            : story.section === "papers"
            ? "This is the journal's own abstract or excerpt. The button opens the published paper on the journal's site."
            : "This is the publisher's own excerpt. The button opens the complete article on their site."}</p>
      </motion.div>
      <p className="mt-10 hidden font-mono text-xs text-muted-foreground md:block">
        <Kbd>J</Kbd> next · <Kbd>K</Kbd> previous · <Kbd>O</Kbd> open full story
      </p>
    </motion.article>
  );

  return (
    <div className="flex h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
     <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2.5">
        <motion.span
          initial={{ rotate: -30, scale: 0.6, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground"
        >
          <Rss className="size-4" strokeWidth={2.6} />
        </motion.span>
        <span className="text-base font-semibold tracking-tight">AI Wire</span>
        <div role="tablist" aria-label="Section" className="order-last flex w-full rounded-lg bg-muted p-0.5 sm:order-none sm:ml-3 sm:w-auto">
          {SECTIONS.map((t) => (
            <button
              key={t.id} type="button" role="tab" aria-selected={section === t.id} onClick={() => pick(t.id)}
              className={cn("relative flex-1 rounded-md px-2 py-1 text-[13px] font-medium sm:flex-none sm:px-3 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                section === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {section === t.id && (
                <motion.span layoutId="tab" className="absolute inset-0 rounded-md bg-card shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
              )}
              <span className="relative flex items-center justify-center gap-1.5">
                {t.label}
                {status === "ready" && unreadBy[t.id] > 0 && <span className="font-mono text-[11px] text-primary tabular-nums">{unreadBy[t.id]}</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon" onClick={markAll} disabled={!visible.some((s) => !read[s.id])} aria-label="Mark all as read" title="Mark all as read">
            <CheckCheck />
          </Button>
          <Button variant="ghost" size="icon" onClick={load} disabled={busy} aria-label="Refresh headlines" title="Refresh">
            <RefreshCw className={cn(busy && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Switch theme" title="Switch theme">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={dark ? "d" : "l"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </motion.span>
            </AnimatePresence>
          </Button>
        </div>
      </header>

      <nav aria-label="Filter headlines" className="no-scrollbar flex gap-1 overflow-x-auto border-b bg-card px-4 py-2">
        {chips.map((name) => (
          <button
            key={name} type="button" aria-pressed={filter === name} onClick={() => setFilter(name)}
            className={cn("relative flex-none rounded-md px-3 py-1 text-[13px] font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              filter === name ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {filter === name && (
              <motion.span layoutId="chip" className="absolute inset-0 rounded-md bg-primary" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
            )}
            <span className="relative">{name}</span>
          </button>
        ))}
      </nav>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(320px,420px)_1fr]">
        <div className="thin-scroll min-w-0 overflow-y-auto bg-card md:border-r" aria-label="Headlines">
          {status === "loading" && (
            <div className="space-y-5 p-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-[92%]" /><Skeleton className="h-4 w-[64%]" /><Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          )}
          {status === "error" && (
            <Empty>
              The headlines could not be loaded. Check your connection and try again.
              <Button variant="outline" size="sm" className="mt-4" onClick={load}><RefreshCw /> Try again</Button>
            </Empty>
          )}
          {status === "ready" && !visible.length && (
            <Empty>{inSection.length ? "Nothing here. You have read everything in this view." : vids ? "No videos yet. Refresh in a little while." : pods ? "No episodes yet. Refresh in a little while." : papers ? "No papers yet. Refresh in a little while." : "No headlines yet. Refresh in a little while."}</Empty>
          )}
          {status === "ready" && visible.length > 0 && (
            <div key={section + filter}>
              {visible.map((s, i) => {
                const label = dayLabel(s.date);
                const head = label !== lastDay;
                lastDay = label;
                const isRead = !!read[s.id];
                return (
                  <div key={s.id}>
                    {head && (
                      <div className="sticky top-0 z-10 border-b bg-background/85 px-4 py-1.5 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase backdrop-blur">
                        {label}
                      </div>
                    )}
                    <motion.button
                      id={"s-" + s.id} type="button" onClick={() => open(s.id)} aria-current={current === s.id || undefined}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease, delay: Math.min(i, 14) * 0.028 }}
                      whileTap={{ scale: 0.985 }}
                      className={cn("relative grid w-full grid-cols-[10px_1fr] gap-2.5 border-b px-4 py-3 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent",
                        current === s.id && "bg-accent")}
                    >
                      {current === s.id && desktop && (
                        <motion.span layoutId="rail" className="absolute inset-y-0 left-0 w-[3px] bg-primary" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
                      )}
                      <span className="mt-[7px] grid size-2 place-items-center">
                        <AnimatePresence initial={false}>
                          {!isRead && <motion.span exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="size-2 rounded-full bg-primary" />}
                        </AnimatePresence>
                      </span>
                      <span className={cn("min-w-0", s.video && "flex gap-3")}>
                        {s.video && <img src={"https://i.ytimg.com/vi/" + s.video + "/mqdefault.jpg"} alt="" loading="lazy" className="aspect-video w-24 flex-none self-start rounded-md bg-muted object-cover" />}
                        <span className="min-w-0">
                        <span className={cn("block leading-snug text-pretty transition-colors duration-300", isRead ? "font-normal text-muted-foreground" : "font-semibold")}>{s.title}</span>
                        <span className="mt-1 block font-mono text-[11.5px] text-muted-foreground">{s.source} · {vids ? dayLabel(s.date) : pods ? (s.duration || "Episode") : papers ? (s.authors || "Peer-reviewed") : clock(s.date)}</span>
                      </span>
                      </span>
                    </motion.button>
                  </div>
                );
              })}
              {updated && <p className="px-4 py-6 text-center font-mono text-[11px] text-muted-foreground">Updated {updated}</p>}
            </div>
          )}
        </div>

        {desktop && (
          <div ref={readerRef} className="thin-scroll min-w-0 overflow-y-auto px-6 py-10">
            <AnimatePresence mode="wait" initial={false}>
              {article || (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Empty><Rss className="mx-auto mb-3 size-6 opacity-50" />Pick a headline to read the story.</Empty>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {!desktop && story && (
          <motion.div
            key="sheet"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0, right: 0.6 }} dragDirectionLock
            onDragEnd={(_, info) => { if (info.offset.x > 110 || info.velocity.x > 600) close(); }}
            className="absolute inset-0 z-20 flex flex-col bg-background shadow-2xl"
          >
            <div className="flex items-center border-b bg-card px-2 py-1.5">
              <Button variant="ghost" size="sm" onClick={close}><ArrowLeft /> Headlines</Button>
            </div>
            <div ref={readerRef} className="min-h-0 flex-1 overflow-y-auto px-4 pt-6 pb-12">{article}</div>
          </motion.div>
        )}
      </AnimatePresence>
     </div>

      <AnimatePresence>
        {playing && (
          <motion.div
            key="player"
            initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="relative z-30 border-t bg-card px-3 pt-2 pb-2.5"
          >
            <div className="mx-auto max-w-3xl">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setSection("podcasts"); setFilter("All"); open(playing.id); }} className="min-w-0 flex-1 text-left outline-none">
                  <span className="block truncate text-[13px] font-medium">{playing.title}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">{playing.source}</span>
                </button>
                <Button variant="ghost" size="icon" onClick={() => setPlaying(null)} aria-label="Close player" title="Close player"><X /></Button>
              </div>
              <audio key={playing.id} src={playing.audio} controls autoPlay preload="metadata" className="mt-1 h-10 w-full" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VideoBox({ id, title, onPlay }: { id: string; title: string; onPlay: () => void }) {
  const [on, setOn] = useState(false);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease }} className="mt-5 aspect-video w-full overflow-hidden rounded-lg border bg-muted">
      {on ? (
        <iframe
          className="size-full" title={title} allowFullScreen
          src={"https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        />
      ) : (
        <button type="button" onClick={() => { onPlay(); setOn(true); }} aria-label={"Play video: " + title} className="group relative block size-full outline-none">
          <img src={"https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"} alt="" className="size-full object-cover" />
          <span className="absolute inset-0 grid place-items-center bg-black/25 transition-colors group-hover:bg-black/10">
            <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-110 group-focus-visible:scale-110">
              <Play className="ml-1 size-7 fill-current" />
            </span>
          </span>
        </button>
      )}
    </motion.div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[44ch] px-4 py-14 text-center text-sm text-muted-foreground">{children}</div>;
}
function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-card px-1.5 py-0.5 font-mono">{children}</kbd>;
}

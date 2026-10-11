import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowUpRight, CheckCheck, Moon, RefreshCw, Rss, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Story = { id: string; title: string; source: string; url: string; date: string; summary: string };

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
  const [filter, setFilter] = useState("All");
  const [current, setCurrent] = useState<string | null>(null);
  const [read, setRead] = useState<Record<string, 1>>(() => store.get("aiwire.read", {}));
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const desktop = useDesktop();
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

  const sources = useMemo(() => [...new Set(stories.map((s) => s.source))].sort(), [stories]);
  const chips = useMemo(() => ["All", "Unread", ...sources], [sources]);
  const visible = useMemo(
    () => stories.filter((s) => (filter === "All" ? true : filter === "Unread" ? !read[s.id] || s.id === current : s.source === filter)),
    [stories, filter, read, current]
  );
  const unread = useMemo(() => stories.filter((s) => !read[s.id]).length, [stories, read]);
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

  let lastDay = "";

  const article = story && (
    <motion.article
      key={story.id}
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, ease }}
      className="mx-auto max-w-[64ch]"
    >
      <Badge variant="secondary" className="font-mono uppercase tracking-wider">{story.source}</Badge>
      <h1 className="mt-4 font-serif text-[clamp(1.7rem,3.4vw,2.35rem)] leading-[1.14] font-semibold text-balance">{story.title}</h1>
      <p className="mt-3 border-b pb-5 font-mono text-xs text-muted-foreground">{dayLabel(story.date)} · {clock(story.date)}</p>
      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12, duration: 0.4 }}
        className="mt-6 font-serif text-[1.2rem] leading-[1.62]"
      >
        {story.summary || "The publisher's feed gave no excerpt for this story."}
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.35, ease }} className="mt-8">
        <Button asChild size="lg" className="group">
          <a href={story.url} target="_blank" rel="noopener">
            Read the full story at {story.source}
            <ArrowUpRight className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </Button>
        <p className="mt-4 text-[13px] text-muted-foreground">This is the publisher's own excerpt. The button opens the complete article on their site.</p>
      </motion.div>
      <p className="mt-10 hidden font-mono text-xs text-muted-foreground md:block">
        <Kbd>J</Kbd> next · <Kbd>K</Kbd> previous · <Kbd>O</Kbd> open full story
      </p>
    </motion.article>
  );

  return (
    <div className="flex h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="flex items-center gap-2 border-b bg-card px-4 py-2.5">
        <motion.span
          initial={{ rotate: -30, scale: 0.6, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground"
        >
          <Rss className="size-4" strokeWidth={2.6} />
        </motion.span>
        <span className="text-base font-semibold tracking-tight">AI Wire</span>
        <div className="ml-auto flex items-center gap-1">
          <AnimatePresence mode="popLayout" initial={false}>
            {status === "ready" && (
              <motion.span
                key={unread}
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.2 }}
                className="mr-1 font-mono text-xs text-muted-foreground tabular-nums"
              >
                {unread} unread
              </motion.span>
            )}
          </AnimatePresence>
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
            <Empty>{stories.length ? "Nothing here. You have read everything in this view." : "No headlines yet. Refresh in a little while."}</Empty>
          )}
          {status === "ready" && visible.length > 0 && (
            <div key={filter}>
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
                      <span className="min-w-0">
                        <span className={cn("block leading-snug text-pretty transition-colors duration-300", isRead ? "font-normal text-muted-foreground" : "font-semibold")}>{s.title}</span>
                        <span className="mt-1 block font-mono text-[11.5px] text-muted-foreground">{s.source} · {clock(s.date)}</span>
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
            className="fixed inset-0 z-20 flex flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl"
          >
            <div className="flex items-center border-b bg-card px-2 py-1.5">
              <Button variant="ghost" size="sm" onClick={close}><ArrowLeft /> Headlines</Button>
            </div>
            <div ref={readerRef} className="min-h-0 flex-1 overflow-y-auto px-4 pt-6 pb-12">{article}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[44ch] px-4 py-14 text-center text-sm text-muted-foreground">{children}</div>;
}
function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-card px-1.5 py-0.5 font-mono">{children}</kbd>;
}

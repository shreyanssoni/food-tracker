"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

// Simple gender resolver: 'male' | 'female' | 'mix' when unknown
function useGender(): "male" | "female" | "mix" {
  const { data: session } = useSession();
  // We don't store gender on the session; rely on `/api/preferences`.
  const [gender, setGender] = useState<"male" | "female" | "mix">("mix");
  const fetched = useRef(false);
  useEffect(() => {
    if (fetched.current) return; // prevent double fetch in React StrictMode
    fetched.current = true;
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const raw = (d?.profile?.gender || "").toLowerCase();
        if (raw === "male" || raw === "female") setGender(raw);
        else setGender("mix");
      })
      .catch(() => {});
  }, [session?.user?.id]);
  return gender;
}

function HeartIcon(
  { filled = false, className = '', ...props }:
  { filled?: boolean } & React.SVGProps<SVGSVGElement>
) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor" {...props}>
        <path d="M12 21s-6.716-4.431-9.192-7.01C.936 11.1 1.12 7.9 3.343 6A5.002 5.002 0 0 1 12 6a5.002 5.002 0 0 1 8.657 0c2.223 1.9 2.407 5.1.535 7.99C18.716 16.569 12 21 12 21z"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M12 21s-6.716-4.431-9.192-7.01C.936 11.1 1.12 7.9 3.343 6A5.002 5.002 0 0 1 12 6a5.002 5.002 0 0 1 8.657 0c2.223 1.9 2.407 5.1.535 7.99C18.716 16.569 12 21 12 21z"/>
    </svg>
  );
}

function ShareIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={props.className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M15 8a3 3 0 1 0-.001-6.001A3 3 0 0 0 15 8Zm-6 10a3 3 0 1 0-.001 6.001A3 3 0 0 0 9 18Zm12 0a3 3 0 1 0-.001 6.001A3 3 0 0 0 21 18Z" stroke="none" fill="currentColor" opacity="0.2"/>
      <path d="M14 6 10 18M14 6l7 12M10 18L3 6"/>
    </svg>
  );
}

function buildImageSet(mode: "male" | "female" | "mix", count = 18) {
  const maleQueries = [
    "male gym physique",
    "male fitness body abs",
    "men workout gym strength",
    "lean athletic male body",
    "male bodybuilding aesthetic",
    "male calisthenics ripped",
  ];
  const femaleQueries = [
    "female gym physique",
    "female fitness body abs",
    "women workout gym strength",
    "lean athletic woman body",
    "female bodybuilding aesthetic",
    "yoga strong woman fit",
  ];
  const baseQueries = mode === "male" ? maleQueries : mode === "female" ? femaleQueries : [...maleQueries, ...femaleQueries];
  // Use Unsplash Source (no API key). Append signature to reduce duplicates.
  const sizes = [
    [600, 800],
    [500, 700],
    [700, 900],
    [600, 600],
    [800, 1000],
    [500, 900],
  ];
  const urls: string[] = [];
  for (let i = 0; i < count; i++) {
    // In 'mix' mode, alternate male/female focus more evenly
    const qBase = mode === 'mix'
      ? (i % 2 === 0 ? maleQueries[(i/2) % maleQueries.length | 0] : femaleQueries[(i/2) % femaleQueries.length | 0])
      : baseQueries[i % baseQueries.length];
    const q = (qBase + " fitness,physique,gym,body,discipline,motivation,aesthetic,portrait")
      .split(" ")
      .map(encodeURIComponent)
      .join(",");
    const [w, h] = sizes[i % sizes.length];
    // Use 'featured' for slightly more stable results
    urls.push(`https://source.unsplash.com/featured/${w}x${h}/?${q}&sig=${i + 17}`);
  }
  return urls;
}

export default function MePage() {
  const gender = useGender();
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const [likes, setLikes] = useState<Record<string, true>>({});
  const likesLoadedRef = useRef(false);
  const [likesReady, setLikesReady] = useState(false);
  const likedList = useMemo(() => Object.keys(likes), [likes]);
  const [motivation, setMotivation] = useState<string>("");
  const [loadingMotivation, setLoadingMotivation] = useState(false);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [topic, setTopic] = useState<string>("");
  const [pinnedTopics, setPinnedTopics] = useState<string[]>([]);
  const [pinsReady, setPinsReady] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const pillsRef = useRef<HTMLDivElement | null>(null);
  const [cycleLoads, setCycleLoads] = useState(0); // how many pages auto-loaded in this reset
  const [userScrolled, setUserScrolled] = useState(false);
  const lastUserScrollAt = useRef<number>(0);
  const didAutoSelectSaved = useRef(false);
  const didSetInitialTopic = useRef(false);
  // Fullscreen viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number>(0);
  const [viewerItems, setViewerItems] = useState<string[]>([]);
  const touchStart = useRef<{x:number;y:number}|null>(null);
  const touchDelta = useRef<{x:number;y:number}>({x:0,y:0});
  // Networking controls
  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchDebounceRef = useRef<number | null>(null);
  // Toasts
  type Toast = { id: string; message: string; tone?: 'info'|'warning'|'error' };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastNoticeRef = useRef<string>("");
  // Rate limit handling
  const rateLimitUntil = useRef<number>(0);
  const lastRateToastAt = useRef<number>(0);
  const pushToast = (message: string, tone: 'info'|'warning'|'error' = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    // auto-dismiss
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4000);
  };

  const planned = useMemo(() => buildImageSet(gender, pageSize), [gender, pageSize]);

  // Load pinned topics from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('me_pinned_topics');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setPinnedTopics(arr.filter((x) => typeof x === 'string'));
      }
    } catch {}
    finally { setPinsReady(true); }
  }, []);

  // Load likes from localStorage
  useEffect(() => {
    try {
      const keys = ['me_likes', 'motivate_me_likes', 'liked_images', 'saved_images'];
      let merged: Record<string, true> = {};
      for (const k of keys) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const obj = JSON.parse(raw);
          if (Array.isArray(obj)) {
            for (const u of obj) if (typeof u === 'string') merged[u] = true as const;
          } else if (obj && typeof obj === 'object') {
            for (const [u, v] of Object.entries(obj)) if (typeof u === 'string' && v) merged[u] = true as const;
          }
        } catch {}
      }
      if (Object.keys(merged).length > 0) {
        setLikes(merged);
        // Canonicalize into me_likes immediately so future reloads are stable
        try { localStorage.setItem('me_likes', JSON.stringify(merged)); } catch {}
      }
    } catch {}
    finally {
      // Mark that we've attempted initial load so we don't overwrite storage prematurely
      likesLoadedRef.current = true;
      setLikesReady(true);
    }
  }, []);

  // Persist likes
  useEffect(() => {
    // Avoid clobbering existing storage with empty {} on first mount (React StrictMode double-effect)
    if (!likesLoadedRef.current) return;
    try { localStorage.setItem('me_likes', JSON.stringify(likes)); } catch {}
  }, [likes]);

  // Initial topic selection after likes are ready: Saved if any likes exist, otherwise All. Also scroll pills to start.
  useEffect(() => {
    if (!likesReady) return;
    if (didSetInitialTopic.current) return;
    didSetInitialTopic.current = true;
    const hasLikes = Object.keys(likes).length > 0;
    setTopic(hasLikes ? '__saved__' : '');
    // Ensure the pills row starts at the first pill (Saved)
    setTimeout(() => {
      if (pillsRef.current) {
        try { pillsRef.current.scrollTo({ left: 0, behavior: 'smooth' }); } catch { pillsRef.current.scrollLeft = 0; }
      }
    }, 0);
  }, [likesReady, likes]);

  // Persist pinned topics
  useEffect(() => {
    if (!pinsReady) return; // don't overwrite before initial load
    try {
      localStorage.setItem('me_pinned_topics', JSON.stringify(pinnedTopics));
    } catch {}
  }, [pinnedTopics, pinsReady]);

  // Cross-tab sync for pinned topics
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'me_pinned_topics') {
        try {
          const arr = e.newValue ? JSON.parse(e.newValue) : [];
          if (Array.isArray(arr)) setPinnedTopics(arr.filter((x) => typeof x === 'string'));
        } catch {}
      }
      if (e.key === 'me_likes') {
        try {
          const obj = e.newValue ? JSON.parse(e.newValue) : {};
          if (obj && typeof obj === 'object') {
            const entries = Object.entries(obj).filter(([k, v]) => typeof k === 'string' && v);
            const mapped = Object.fromEntries(entries.map(([k]) => [k, true as const]));
            setLikes(mapped);
          }
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleLike = (url: string) => {
    setLikes((prev) => {
      const next = { ...prev } as Record<string, true>;
      if (next[url]) delete next[url]; else next[url] = true as const;
      return next;
    });
  };

  const shareImage = async (url: string) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Gym Motivation', text: 'Found this motivating!', url });
      } else {
        await navigator.clipboard.writeText(url);
        alert('Link copied to clipboard');
      }
    } catch {}
  };

  const togglePin = (key: string) => {
    if (key === '' || key === '__saved__') return; // do not allow pinning 'All' or Saved
    setPinnedTopics((prev) => {
      const set = new Set(prev);
      if (set.has(key)) set.delete(key); else set.add(key);
      return Array.from(set);
    });
  };

  // Derive page size from screen width (columns heuristic)
  useEffect(() => {
    const compute = () => {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
      const cols = w >= 1024 ? 4 : w >= 768 ? 3 : 2;
      // Target 6-10 per load: 2 cols->6, 3 cols->8, 4 cols->10
      const size = cols === 4 ? 10 : cols === 3 ? 8 : 6;
      setPageSize(size);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  // Reset when gender, pageSize, or topic changes
  useEffect(() => {
    setImages([]);
    setLoaded({});
    setPage(1);
    // Do not enter loading state for Saved; we render likedList immediately
    setLoading(topic !== '__saved__');
    setCycleLoads(0);
    setUserScrolled(false);
    setIsLoadingMore(false);
    setFetchError(null);
  }, [gender, pageSize, topic]);

  // Fetch a page with debounce and cancellation
  useEffect(() => {
    // Skip network for Saved view
    if (topic === '__saved__') {
      // Ensure no pending work
      if (fetchDebounceRef.current) {
        clearTimeout(fetchDebounceRef.current);
        fetchDebounceRef.current = null;
      }
      fetchAbortRef.current?.abort();
      setIsLoadingMore(false);
      return;
    }

    // Only load when initializing (page 1) or on load-more
    if (!(loading || isLoadingMore)) return;

    // Debounce rapid changes (topic/gender/pageSize switches)
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    fetchDebounceRef.current = window.setTimeout(() => {
      const controller = new AbortController();
      // abort any in-flight request before starting a new one
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = controller;

      void (async () => {
        try {
          const params = new URLSearchParams({
            mode: gender,
            page: String(page),
            count: String(pageSize),
          });
          if (topic) params.set('topic', topic);
          const url = `/api/images/gym?${params.toString()}`;
          const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
          if (controller.signal.aborted) return;
          if (res.ok) {
            const data = await res.json();
            const urls: string[] = Array.isArray(data?.urls) ? data.urls : [];
            const meta: { usedFallback?: boolean; reason?: string } | null = data?.meta || null;

            setImages((prev) => (page === 1 ? urls : Array.from(new Set([...prev, ...urls]))));
            if (urls.length === 0 && page === 1) {
              // Explicit empty state
              setImages([]);
            }
            // Notify if API fell back to generic/source images
            if (meta?.usedFallback) {
              const key = `${topic || 'all'}:${page}:${meta.reason || 'fallback'}`;
              if (lastNoticeRef.current !== key) {
                lastNoticeRef.current = key;
                const reasonMap: Record<string, string> = {
                  'no-key': 'Unsplash key missing, using generic images',
                  'topic-fallback': 'Not enough topic matches; using broader gym images',
                  'default-fallback': 'No results; using generic gym images',
                  'catch-fallback': 'Temporary error; using generic images',
                  'unauthorized': 'Unsplash key invalid or missing permissions',
                  'rate-limit': 'Unsplash rate limit reached; using generic images',
                  'unsplash-error': 'Unsplash error; using generic images',
                };
                const reason = meta.reason || '';
                const why = reasonMap[reason] || 'Using fallback images';
                const suppressed = reason === 'topic-fallback' || reason === 'default-fallback';
                if (suppressed) {
                  // Do not show toast for benign fallbacks
                } else if (reason === 'rate-limit') {
                  // Set a short cooldown (60s) to reduce bursts
                  rateLimitUntil.current = Date.now() + 60_000;
                  // Throttle rate-limit toasts to once per 20s
                  if (Date.now() - (lastRateToastAt.current || 0) > 20_000) {
                    lastRateToastAt.current = Date.now();
                    pushToast(why, 'warning');
                  }
                } else {
                  pushToast(why, 'warning');
                }
              }
            }
          } else {
            setFetchError('Error fetching images');
            pushToast('Error fetching images', 'error');
          }
        } catch (err) {
          if (!controller.signal.aborted) {
            setFetchError('Error fetching images');
            pushToast('Error fetching images', 'error');
          }
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
            setIsLoadingMore(false);
          }
        }
      })();
    }, 200);

    // cleanup debounce and in-flight request when deps change
    return () => {
      if (fetchDebounceRef.current) {
        clearTimeout(fetchDebounceRef.current);
        fetchDebounceRef.current = null;
      }
      fetchAbortRef.current?.abort();
    };
  }, [gender, page, pageSize, loading, isLoadingMore, topic]);

  // Detect user scroll to unlock more auto-loads
  useEffect(() => {
    const onScroll = () => { setUserScrolled(true); lastUserScrollAt.current = Date.now(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Keep pills scrolled to show pinned first on mount/visibility change (non-intrusive)
  useEffect(() => {
    const scrollPillsToPinned = () => {
      if (!pillsRef.current) return;
      if (userScrolled) return; // don't fight the user
      // Always reset to the left edge first
      try { pillsRef.current.scrollTo({ left: 0, behavior: 'instant' as ScrollBehavior }); } catch { pillsRef.current.scrollLeft = 0; }
      // If we have pins, ensure first pin is visible
      const firstPin = pinnedTopics.find(k => k !== '');
      if (firstPin !== undefined) {
        const el = pillsRef.current.querySelector<HTMLElement>(`[data-key="${firstPin || 'all'}"]`);
        el?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, inline: 'start', block: 'nearest' });
      }
    };
    // On load and when pins change
    scrollPillsToPinned();
    // On visibility/focus return
    const shouldAdjust = () => Date.now() - (lastUserScrollAt.current || 0) > 1500;
    const onVis = () => { if (document.visibilityState === 'visible' && shouldAdjust()) scrollPillsToPinned(); };
    const onFocus = () => { if (shouldAdjust()) scrollPillsToPinned(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [pinnedTopics, userScrolled]);

  // Lock body scroll when modal is open
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    if (viewerOpen) el.style.overflow = 'hidden';
    return () => { el.style.overflow = prev; };
  }, [viewerOpen]);

  // Keyboard navigation in viewer
  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewerOpen(false);
      if (e.key === 'ArrowRight') setViewerIndex((i) => Math.min(viewerItems.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setViewerIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerOpen, viewerItems.length]);

  // IntersectionObserver to auto-load next page (guarded and conservative)
  useEffect(() => {
    // Do not observe during Saved view or while first page is still loading
    if (topic === '__saved__') return;
    if (!loaderRef.current) return;
    if (loading) return; // wait for initial page to render to avoid burst
    // Pause auto-load during rate limit cooldown window
    if (Date.now() < (rateLimitUntil.current || 0)) return;
    const el = loaderRef.current;
    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      // Allow at most 1 auto-load after a reset; unlimited only after user has scrolled
      const allowAutoLoad = userScrolled || cycleLoads < 1;
      if (entry.isIntersecting && !isLoadingMore && !loading && allowAutoLoad) {
        // Skip triggering during cooldown
        if (Date.now() < (rateLimitUntil.current || 0)) return;
        setIsLoadingMore(true);
        setPage((p) => p + 1);
        setCycleLoads((c) => c + 1);
      }
    }, { root: null, rootMargin: '0px', threshold: 0.1 });
    observer.observe(el);
    return () => observer.unobserve(el);
  }, [isLoadingMore, loading, userScrolled, cycleLoads, topic]);

  const getMotivation = async () => {
    setLoadingMotivation(true);
    setMotivation("");
    try {
      const res = await fetch("/api/ai/motivate", { method: "POST" });
      const json = await res.json();
      setMotivation((json?.message?.content || json?.message || "").toString());
    } catch {
      setMotivation("You are stronger than your hardest excuse. One step today.");
    } finally {
      setLoadingMotivation(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toasts */}
      <div className="fixed top-3 right-3 z-[60] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`min-w-[240px] max-w-sm rounded-lg border px-3 py-2 text-sm shadow-md backdrop-blur bg-white/90 dark:bg-gray-900/80 ${
              t.tone === 'error' ? 'border-red-300 text-red-800 dark:text-red-200' : t.tone === 'warning' ? 'border-yellow-300 text-yellow-900 dark:text-yellow-100' : 'border-gray-200 text-gray-800 dark:text-gray-200'
            }`}
            role="status"
            aria-live="polite"
          >
            {t.message}
          </div>
        ))}
      </div>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">Motivate Me</span>
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            One step a day. One% daily.
          </p>
        </div>
        <button
          onClick={getMotivation}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-70"
          disabled={loadingMotivation}
        >
          {loadingMotivation ? (
            <span className="inline-flex items-center gap-2">
              <Spinner /> Generating...
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <BoltIcon className="h-5 w-5" /> Q.O.T.D
            </span>
          )}
        </button>
      </header>

      {/* Topic pills */}
      <section className="-mt-2">
        <div ref={pillsRef} className="flex gap-2 overflow-x-auto no-scrollbar py-1 pr-1 -mx-1 px-1 snap-x">
          {(() => {
            const all = [
              { key: '__saved__', label: 'Saved' },
              { key: '', label: 'All' },
              { key: 'strength', label: 'Strength' },
              { key: 'calisthenics', label: 'Calisthenics' },
              { key: 'cardio', label: 'Cardio' },
              { key: 'bodybuilding', label: 'Bodybuilding' },
              { key: 'yoga', label: 'Yoga' },
              { key: 'crossfit', label: 'Crossfit' },
              { key: 'abs', label: 'Abs' },
              { key: 'back', label: 'Back' },
              { key: 'legs', label: 'Legs' },
              { key: 'arms', label: 'Arms' },
              { key: 'outdoor', label: 'Outdoor' },
              { key: 'home gym', label: 'Home Gym' },
              { key: 'music', label: 'Music' },
              { key: 'gym posters', label: 'Gym Posters' },
              { key: 'gym aesthetics', label: 'Aesthetics' },
              { key: 'barbell', label: 'Barbell' },
              { key: 'dumbbell', label: 'Dumbbell' },
              { key: 'kettlebell', label: 'Kettlebell' },
              { key: 'powerlifting', label: 'Powerlifting' },
              { key: 'hiit', label: 'HIIT' },
              { key: 'boxing', label: 'Boxing' },
              { key: 'mobility', label: 'Mobility' },
              { key: 'stretching', label: 'Stretching' },
              { key: 'core', label: 'Core' },
              { key: 'chest', label: 'Chest' },
              { key: 'shoulders', label: 'Shoulders' },
              { key: 'glutes', label: 'Glutes' },
              { key: 'minimal', label: 'Minimal' },
              { key: 'black and white', label: 'B/W' },
              { key: 'neon', label: 'Neon' },
              { key: 'motivational quotes', label: 'Quotes' },
            ];
            // Order: Saved, All, then pinned topics (in original order), then the rest
            const pinSet = new Set(pinnedTopics.filter(k => k !== ''));
            const specials = all.slice(0, 2); // [Saved, All]
            const others = all.slice(2);
            const pinnedFirst = others.filter(t => pinSet.has(t.key));
            const rest = others.filter(t => !pinSet.has(t.key));
            const ordered = [...specials, ...pinnedFirst, ...rest];
            return ordered.map((t) => {
              const isPinned = pinnedTopics.includes(t.key);
              // Special style for Saved pill
              if (t.key === '__saved__') {
                const active = topic === '__saved__';
                return (
                  <button
                    key="__saved__"
                    data-key="__saved__"
                    onClick={() => setTopic('__saved__')}
                    className={`relative shrink-0 rounded-full border px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm whitespace-nowrap snap-start transition-all ring-1 ring-inset ${
                      active
                        ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white border-transparent ring-pink-400/40 shadow-md'
                        : 'bg-gradient-to-r from-pink-400/90 to-rose-400/90 text-white border-transparent ring-pink-300/30 hover:brightness-105 shadow-sm'
                    }`}
                    title="Your saved likes"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <HeartIcon className="h-3.5 w-3.5 fill-current" filled />
                      <span className="font-medium">Saved</span>
                      <span className={`ml-1 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? 'bg-white/20' : 'bg-white/15'}`}>
                        {likedList.length}
                      </span>
                    </span>
                  </button>
                );
              }
              return (
                <div
                  key={t.key || 'all'}
                  role="button"
                  tabIndex={0}
                  data-key={t.key || 'all'}
                  onClick={() => setTopic(t.key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTopic(t.key); } }}
                  onContextMenu={(e) => { e.preventDefault(); togglePin(t.key); }}
                  className={`relative shrink-0 rounded-full border pl-8 sm:pl-9 pr-3.5 sm:pr-4 py-1.5 sm:py-2 text-xs sm:text-sm whitespace-nowrap snap-start transition-colors cursor-pointer ${
                    topic === t.key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white/70 dark:bg-gray-900/60 border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  title={isPinned ? 'Pinned — click star to unpin (or right click)' : 'Click star to pin (or right click)'}
                >
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); togglePin(t.key); }}
                    className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 inline-flex items-center justify-center text-yellow-500"
                    aria-label={isPinned ? 'Unpin topic' : 'Pin topic'}
                    title={isPinned ? 'Unpin topic' : 'Pin topic'}
                  >
                    <StarIcon className={`h-3.5 w-3.5 ${isPinned ? '' : 'opacity-70'}`} filled={isPinned} />
                  </button>
                  {t.label}
                </div>
              );
            });
          })()}
        </div>
      </section>
      {/* Saved toolbar */}
      {topic === '__saved__' && (
        <div className="-mt-2 flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 px-3 py-2 text-sm">
          <div className="text-gray-700 dark:text-gray-200">Liked images: {likedList.length}</div>
          {likedList.length > 0 && (
            <button
              onClick={() => { if (confirm('Clear all liked images?')) setLikes({}); }}
              className="rounded-md bg-red-600 text-white px-2.5 py-1 hover:bg-red-700"
            >Clear all</button>
          )}
        </div>
      )}

      {motivation && (
        <div className="rounded-lg border border-blue-200/50 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/40 p-4 text-blue-900 dark:text-blue-100 shadow-sm">
          <p className="whitespace-pre-wrap leading-relaxed">{motivation}</p>
        </div>
      )}

      {/* Masonry grid */}
      <section>
        {(loading && topic !== '__saved__') ? (
          <MasonrySkeleton count={pageSize} />
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-3 [column-fill:_balance]">{/* masonry */}
            {/* Empty/Error states for non-Saved */}
            {topic !== '__saved__' && !loading && (fetchError || images.length === 0) && (
              <div className="col-span-full mb-3 break-inside-avoid">
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 p-4 text-sm text-gray-700 dark:text-gray-200">
                  {fetchError ? fetchError : 'No images found for this topic.'}
                </div>
              </div>
            )}
            {/* Empty state for Saved */}
            {topic === '__saved__' && likedList.length === 0 && (
              <div className="col-span-full mb-3 break-inside-avoid">
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 p-4 text-sm text-gray-700 dark:text-gray-200">
                  You haven’t saved any images yet. Explore topics and tap the heart to save.
                </div>
              </div>
            )}
            {(() => { const renderSource = topic === '__saved__' ? likedList : images; return renderSource; })().map((src, i) => (
              <figure key={i} className="group mb-3 break-inside-avoid rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-white/60 dark:bg-gray-950/60 shadow-sm hover:shadow-md transition-shadow">
                <div className="relative">
                  {!loaded[i] && (
                    <div className="absolute inset-0 animate-pulse bg-gray-200/70 dark:bg-gray-800/60" />
                  )}
                  <img
                    src={src}
                    alt="Fitness inspiration"
                    className="w-full h-auto block object-cover transition-transform duration-300 group-hover:scale-[1.015]"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onLoad={() => setLoaded((m) => ({ ...m, [i]: true }))}
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement;
                      try {
                        const u = new URL(el.src);
                        const dims = u.pathname.match(/\/(\d+)x(\d+)/);
                        const w = dims?.[1] || '600';
                        const h = dims?.[2] || '800';
                        const seed = `fit-${Math.random().toString(36).slice(2)}`;
                        el.src = `https://picsum.photos/seed/${seed}/${w}/${h}`;
                      } catch {
                        el.src = `https://picsum.photos/seed/fallback/600/800`;
                      }
                    }}
                    onClick={() => { const list = topic === '__saved__' ? likedList : images; setViewerItems(list); setViewerIndex(i); setViewerOpen(true); }}
                  />
                  {/* Bottom gradient and actions */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2 sm:p-2.5 z-10">
                    <div className="pointer-events-auto rounded-lg bg-gradient-to-t from-black/70 via-black/40 to-transparent px-2 py-1.5 sm:py-2 flex items-center justify-between gap-2 text-white opacity-100 transition-opacity">
                      <div className="text-[11px] sm:text-xs font-medium tracking-wide drop-shadow">Stay disciplined.</div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleLike(src); }}
                          className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-xs bg-white/10 hover:bg-white/20 transition-colors ${likes[src] ? 'text-pink-300' : 'text-white'}`}
                          aria-label={likes[src] ? 'Unlike' : 'Like'}
                          title={likes[src] ? 'Unlike' : 'Like'}
                        >
                          <HeartIcon className={`h-4 w-4 ${likes[src] ? 'fill-current' : ''}`} filled={!!likes[src]} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); shareImage(src); }}
                          className="inline-flex items-center justify-center rounded-md px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-white transition-colors"
                          aria-label="Share"
                          title="Share"
                        >
                          <ShareIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </figure>
            ))}
            {/* Infinite loader sentinel */}
            {topic !== '__saved__' && (
              <div ref={loaderRef} className="mt-4 flex justify-center py-4">
                {isLoadingMore && (
                  <span className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Spinner /> Loading more...
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </section>
      {/* Fullscreen viewer modal */}
      {viewerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setViewerOpen(false); }}
          onTouchStart={(e) => {
            const t = e.touches[0];
            touchStart.current = { x: t.clientX, y: t.clientY };
            touchDelta.current = { x: 0, y: 0 };
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            if (!touchStart.current) return;
            touchDelta.current = { x: t.clientX - touchStart.current.x, y: t.clientY - touchStart.current.y };
          }}
          onTouchEnd={() => {
            const { x, y } = touchDelta.current;
            const absX = Math.abs(x), absY = Math.abs(y);
            const swipeThresh = 60;
            if (absY > absX && absY > swipeThresh && y > 0) { setViewerOpen(false); return; }
            if (absX > absY && absX > swipeThresh) {
              if (x < 0) setViewerIndex((i) => Math.min(images.length - 1, i + 1));
              else setViewerIndex((i) => Math.max(0, i - 1));
            }
            touchStart.current = null; touchDelta.current = { x:0, y:0 };
          }}
        >
          <div className="m-auto w-[96vw] max-w-5xl h-screen sm:h-[90vh] rounded-xl border border-white/10 bg-black/40 shadow-2xl overflow-hidden relative flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between px-3 py-2 text-white">
              <button
                onClick={() => setViewerOpen(false)}
                className="rounded-md bg-white/10 hover:bg-white/20 px-2 py-1 text-sm"
              >Close</button>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleLike(viewerItems[viewerIndex]); }}
                  className={`rounded-md px-2 py-1 text-sm bg-white/10 hover:bg-white/20 ${likes[viewerItems[viewerIndex]] ? 'text-pink-300' : 'text-white'}`}
                  aria-label={likes[viewerItems[viewerIndex]] ? 'Unlike' : 'Like'}
                >
                  <HeartIcon className={`h-5 w-5 ${likes[viewerItems[viewerIndex]] ? 'fill-current' : ''}`} filled={!!likes[viewerItems[viewerIndex]]} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); shareImage(viewerItems[viewerIndex]); }}
                  className="rounded-md px-2 py-1 text-sm bg-white/10 hover:bg-white/20 text-white"
                  aria-label="Share"
                >
                  <ShareIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
            {/* Image stage */}
            <div
              className="relative flex-1 min-h-0 flex items-center justify-center select-none p-2 sm:p-4 overflow-hidden"
              onClick={(e) => {
                // Close if clicking on the stage background (outside the image)
                if (e.target === e.currentTarget) setViewerOpen(false);
              }}
            >
              <img
                src={viewerItems[viewerIndex]}
                alt="Motivation"
                className="h-full w-full object-contain"
                draggable={false}
                onClick={(e) => e.stopPropagation()}
              />
              {viewerIndex > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setViewerIndex((i) => Math.max(0, i - 1)); }}
                  className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-2 text-white"
                  aria-label="Previous"
                >
                  ‹
                </button>
              )}
              {viewerIndex < viewerItems.length - 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setViewerIndex((i) => Math.min(viewerItems.length - 1, i + 1)); }}
                  className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-2 text-white"
                  aria-label="Next"
                >
                  ›
                </button>
              )}
            </div>
            <div className="px-3 py-2 text-center text-white/80 text-xs">Swipe left/right to navigate • Swipe down to close</div>
          </div>
        </div>
      )}
    </div>
  );
}

function MasonrySkeleton({ count = 12 }: { count?: number }) {
  const boxes = Array.from({ length: count }).map((_, i) => (
    <div key={i} className="mb-3 break-inside-avoid">
      <div className="h-[160px] rounded-xl bg-gray-200/70 dark:bg-gray-800/60 animate-pulse" />
    </div>
  ));
  return (
    <div className="columns-2 md:columns-3 lg:columns-4 gap-3">
      {boxes}
    </div>
  );
}

function BoltIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

function StarIcon(
  { filled = false, className = '', ...props }:
  { filled?: boolean } & React.SVGProps<SVGSVGElement>
) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor" {...props}>
        <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

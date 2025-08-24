"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

// Simple gender resolver: 'male' | 'female' | 'mix' when unknown
function useGender(): "male" | "female" | "mix" {
  const { data: session } = useSession();
  // We don't store gender on the session; rely on `/api/preferences`.
  const [gender, setGender] = useState<"male" | "female" | "mix">("mix");
  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const raw = (d?.profile?.gender || "").toLowerCase();
        if (raw === "male" || raw === "female") setGender(raw);
        else setGender("mix");
      })
      .catch(() => {});
  }, [session?.user?.id]);
  return gender;
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
  const [motivation, setMotivation] = useState<string>("");
  const [loadingMotivation, setLoadingMotivation] = useState(false);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  const planned = useMemo(() => buildImageSet(gender, pageSize), [gender, pageSize]);

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

  // Reset when gender or pageSize changes
  useEffect(() => {
    setImages([]);
    setLoaded({});
    setPage(1);
    setLoading(true);
  }, [gender, pageSize]);

  // Fetch a page
  useEffect(() => {
    let cancelled = false;
    const fetchPage = async () => {
      try {
        const u = new URL(window.location.origin + '/api/images/gym');
        u.searchParams.set('mode', gender);
        u.searchParams.set('count', String(pageSize));
        u.searchParams.set('page', String(page));
        const res = await fetch(u.toString());
        if (res.ok) {
          const data = await res.json();
          const urls: string[] = Array.isArray(data?.urls) ? data.urls : [];
          if (!cancelled && urls.length) {
            setImages((prev) => [...prev, ...urls]);
          }
        } else if (!cancelled) {
          // Fallback to client generator for this page
          const start = 0;
          setImages((prev) => [...prev, ...planned.slice(start, start + pageSize)]);
        }
      } catch {
        if (!cancelled) {
          const start = 0;
          setImages((prev) => [...prev, ...planned.slice(start, start + pageSize)]);
        }
      } finally {
        if (!cancelled) setLoading(false);
        if (!cancelled) setIsLoadingMore(false);
      }
    };
    // Only load when initializing (page 1) or on load-more
    if (loading || isLoadingMore) fetchPage();
    return () => { cancelled = true; };
  }, [gender, page, pageSize, loading, isLoadingMore, planned]);

  // IntersectionObserver to auto-load next page
  useEffect(() => {
    if (!loaderRef.current) return;
    const el = loaderRef.current;
    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && !isLoadingMore && !loading) {
        setIsLoadingMore(true);
        setPage((p) => p + 1);
      }
    }, { root: null, rootMargin: '200px', threshold: 0.01 });
    observer.observe(el);
    return () => observer.unobserve(el);
  }, [isLoadingMore, loading]);

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
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Me</h1>
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
              <BoltIcon className="h-5 w-5" /> Most Motivation
            </span>
          )}
        </button>
      </header>

      {motivation && (
        <div className="rounded-lg border border-blue-200/50 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/40 p-4 text-blue-900 dark:text-blue-100 shadow-sm">
          <p className="whitespace-pre-wrap leading-relaxed">{motivation}</p>
        </div>
      )}

      {/* Masonry grid */}
      <section>
        {loading ? (
          <MasonrySkeleton count={pageSize} />
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-3 [column-fill:_balance]">{/* masonry */}
            {images.map((src, i) => (
              <figure key={i} className="mb-3 break-inside-avoid rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-white/60 dark:bg-gray-950/60">
                <div className="relative">
                  {!loaded[i] && (
                    <div className="absolute inset-0 animate-pulse bg-gray-200/70 dark:bg-gray-800/60" />
                  )}
                  <img
                    src={src}
                    alt="Fitness inspiration"
                    className="w-full h-auto block object-cover"
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
                  />
                </div>
              </figure>
            ))}
            {/* Infinite loader sentinel */}
            <div ref={loaderRef} className="mt-4 flex justify-center py-4">
              {isLoadingMore && (
                <span className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <Spinner /> Loading more...
                </span>
              )}
            </div>
          </div>
        )}
      </section>
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

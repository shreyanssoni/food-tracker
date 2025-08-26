"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';

export default function CollectibleDetailPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug || '');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Share modal state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [shareItem, setShareItem] = useState<{ slug?: string; name?: string; rarity?: string } | null>(null);
  const confettiRef = useRef<HTMLDivElement | null>(null);
  const burstRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/collectibles/${encodeURIComponent(slug)}`);
        const j = await res.json();
        if (!alive) return;
        if (res.ok) setData(j.collectible);
        else setError(j.error || 'Failed to load');
      } catch (e: any) {
        if (alive) setError(e?.message || 'Failed to load');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  const iconHref = data?.icon && (data.icon.startsWith('http') || data.icon.startsWith('/')) ? data.icon : (data?.icon ? `/images/collectibles/${data.icon}.svg` : '/images/collectibles/default.svg');
  const rarity = (data?.rarity || 'common').toLowerCase();
  const rarityClass = rarity === 'epic' ? 'from-fuchsia-500 to-amber-400' : rarity === 'rare' ? 'from-blue-500 to-emerald-400' : 'from-gray-400 to-gray-300';
  const rarityToClass = (r?: string) => {
    const rar = (r || 'common').toLowerCase();
    return rar === 'epic' ? 'from-fuchsia-500 to-amber-400' : rar === 'rare' ? 'from-blue-500 to-emerald-400' : 'from-gray-400 to-gray-300';
  };

  const openShare = () => {
    setShareItem({ slug, name: data?.name, rarity: data?.rarity });
    setShareOpen(true);
    requestAnimationFrame(() => setShareVisible(true));
  };
  const closeShare = () => {
    setShareVisible(false);
    setTimeout(() => setShareOpen(false), 200);
  };
  const copyLink = async () => {
    try {
      const url = `${window.location.origin}/collectibles/${encodeURIComponent(slug)}`;
      await navigator.clipboard.writeText(url);
      toast.success('Copied');
    } catch {}
  };
  const downloadImage = async () => {
    try {
      const origin = window.location.origin;
      const url = `${origin}/api/collectibles/share/${encodeURIComponent(slug)}`;
      const ogUrl = `${origin}/api/collectibles/og/${encodeURIComponent(slug)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        window.open(ogUrl, '_blank');
        toast.success('Opened image');
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success('Downloaded');
    } catch {}
  };
  const shareNow = async () => {
    try {
      const origin = window.location.origin;
      const imgUrl = `${origin}/api/collectibles/share/${encodeURIComponent(slug)}`;
      const ogUrl = `${origin}/api/collectibles/og/${encodeURIComponent(slug)}`;
      const pageUrl = `${origin}/collectibles/${encodeURIComponent(slug)}`;
      const title = data?.name || 'Collectible';
      const text = `I just unlocked ${data?.name || 'a collectible'}!`;
      try {
        const res = await fetch(imgUrl, { credentials: 'include' });
        if (res.ok) {
          const blob = await res.blob();
          const file = new File([blob], `${slug}.svg`, { type: 'image/svg+xml' });
          const navAny = navigator as any;
          if (navAny?.canShare?.({ files: [file] })) {
            await navAny.share({ title, text, files: [file] });
            return;
          }
        } else if (res.status === 401 || res.status === 403) {
          if (navigator.share) return await navigator.share({ title, text, url: pageUrl });
          return window.open(pageUrl, '_blank');
        }
      } catch {}
      if (navigator.share) await navigator.share({ title, text, url: imgUrl });
      else window.open(imgUrl, '_blank');
    } catch {}
  };

  // Tilt state for parallax effect
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const resetTilt = () => setTilt({ x: 0, y: 0 });

  return (
    <div className="min-h-[70vh] p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{data?.name || 'Collectible'}</h1>
          {/* Rarity under title
          <div className="mt-1 flex items-center gap-2">
            <span className={`text-[11px] px-2 py-0.5 rounded-full bg-gradient-to-r ${rarityClass} text-white shadow-sm capitalize`}>
              {data?.rarity || 'Common'}
            </span>
          </div> */}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/collectibles" className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-800 hover:bg-white/60 dark:hover:bg-gray-900/60">Back</Link>
          {data?.public_slug && (
            <button onClick={openShare} className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-700 dark:text-blue-300 dark:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-950/30">Share</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="mt-6 h-72 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/50 animate-pulse" />
      ) : error ? (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Relic Showcase */}
          <div className="lg:sticky lg:top-20">
            <div className={`relative overflow-hidden rounded-3xl border border-gray-200/70 dark:border-gray-800/70 bg-gradient-to-b ${rarityClass} p-[1px] shadow-xl`}> 
              <div className="relative rounded-3xl bg-gradient-to-b from-gray-900 via-gray-900 to-black dark:from-gray-950 dark:via-gray-950 dark:to-black">
                {/* Ambient flares */}
                <div className="pointer-events-none absolute -top-20 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
                {/* Rotating light ring */}
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="h-[72%] w-[72%] rounded-full border border-transparent" style={{
                    background: 'conic-gradient(from 0deg, rgba(255,255,255,0.0), rgba(255,255,255,0.25), rgba(255,255,255,0.0) 60%)'
                  }}>
                  </div>
                  <div className="absolute h-[72%] w-[72%] rounded-full animate-[spin_12s_linear_infinite]">
                    <div className="absolute inset-0 rounded-full" style={{
                      background: 'conic-gradient(from 0deg, rgba(255,255,255,0.0), rgba(255,255,255,0.35), rgba(255,255,255,0.0) 60%)'
                    }} />
                  </div>
                </div>
                {/* Floating particles */}
                <div className="pointer-events-none">
                  <span className="absolute left-10 top-10 h-2 w-2 rounded-full bg-white/40 animate-ping" />
                  <span className="absolute right-12 top-20 h-1.5 w-1.5 rounded-full bg-white/30 animate-ping" />
                  <span className="absolute left-14 bottom-14 h-1.5 w-1.5 rounded-full bg-white/30 animate-ping" />
                </div>
                {/* Rarity badge on card */}
                <div className={`absolute left-4 top-4 z-10 text-[11px] px-2 py-0.5 rounded-full bg-gradient-to-r ${rarityClass} text-white shadow-sm capitalize`}>{data.rarity || 'Common'}</div>
                {/* Relic image with tilt */}
                <div
                  className="relative aspect-square w-full grid place-items-center p-6 sm:p-8 will-change-transform"
                  onMouseMove={(e) => {
                    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const px = (e.clientX - r.left) / r.width - 0.5; // -0.5 to 0.5
                    const py = (e.clientY - r.top) / r.height - 0.5;
                    setTilt({ x: py * -6, y: px * 6 });
                  }}
                  onMouseLeave={resetTilt}
                  style={{
                    transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                    transition: 'transform 200ms ease-out',
                  }}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_60%)]" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={iconHref}
                    alt={data?.name}
                    className="relative z-10 max-h-[58%] sm:max-h-[60%] max-w-[76%] object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out hover:scale-[1.04]"
                    onError={(e) => {
                      const fallback = '/images/collectibles/default.svg';
                      // @ts-ignore
                      if (!e.currentTarget.src.endsWith(fallback)) {
                        // @ts-ignore
                        e.currentTarget.src = fallback;
                      }
                    }}
                  />
                  {/* Glow ring */}
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 h-10 w-36 sm:w-52 bg-white/25 blur-2xl rounded-full opacity-70" />
                </div>
              </div>
            </div>
          </div>

          {/* Story Panel */}
          <div className="relative rounded-3xl border border-gray-200/70 dark:border-gray-800/70 bg-white/80 dark:bg-gray-950/60 shadow-sm p-5 sm:p-6 overflow-hidden">
            {/* soft top gradient */}
            <div className="pointer-events-none absolute -top-16 right-0 h-32 w-40 bg-fuchsia-400/20 blur-3xl rounded-full" />
            <div className="pointer-events-none absolute -bottom-16 -left-8 h-32 w-40 bg-blue-400/20 blur-3xl rounded-full" />
            {data.lore && (
              <p className="text-[13px] sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {data.lore}
              </p>
            )}
            {(data.story_title || data.story_md) && (
              <div className="mt-4 sm:mt-5">
                {data.story_title && (
                  <h2 className="text-lg sm:text-xl font-semibold mb-2 tracking-tight">{data.story_title}</h2>
                )}
                {data.story_md && (
                  <div className="prose prose-sm sm:prose dark:prose-invert max-w-none leading-relaxed">
                    {data.story_md}
                  </div>
                )}
              </div>
            )}
            {data.acquired_at && (
              <p className="mt-4 text-xs text-gray-500">Unlocked on {new Date(data.acquired_at).toLocaleDateString()}</p>
            )}
            {/* CTA Row */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link href="/collectibles" className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-800 hover:bg-white/60 dark:hover:bg-gray-900/60">Back</Link>
              {data?.public_slug && (
                <button onClick={openShare} className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-700 dark:text-blue-300 dark:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-950/30">Share</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareOpen && shareItem && createPortal(
        <div className="fixed inset-0 z-50">
          <div className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${shareVisible ? 'opacity-100' : 'opacity-0'}`} onClick={closeShare} />
          <div className="absolute inset-0 grid place-items-center p-4">
            <div className={`w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-2xl transition-all duration-200 ${shareVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95'}`}>
              <div className="p-4 border-b border-gray-200/70 dark:border-gray-800/70">
                <div className="text-base font-semibold">You unlocked {shareItem.name || 'a collectible'}!</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Share your new collectible with friends</div>
              </div>
              <div className="p-4 space-y-3">
                <div ref={confettiRef} className="relative">
                  <div className={`rounded-xl p-[1px] bg-gradient-to-r ${rarityToClass(shareItem.rarity)} shadow-lg`}>
                    <div ref={burstRef} className="relative rounded-xl overflow-hidden border border-white/20 bg-white dark:bg-gray-950">
                      <span className="pointer-events-none absolute -top-6 left-3 h-16 w-16 rounded-full bg-white/20 blur-2xl" />
                      <span className="pointer-events-none absolute -bottom-8 right-5 h-16 w-16 rounded-full bg-white/10 blur-2xl" />
                      <span className={`absolute left-2 top-2 text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r ${rarityToClass(shareItem.rarity)} text-white shadow-sm capitalize`}>{shareItem.rarity || 'Common'}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/collectibles/share/${encodeURIComponent(shareItem.slug || '')}`}
                        alt={shareItem.name || 'Collectible'}
                        className="w-full h-48 object-cover"
                        onError={(e) => {
                          const og = `/api/collectibles/og/${encodeURIComponent(shareItem.slug || '')}`;
                          // @ts-ignore
                          if (!e.currentTarget.src.endsWith(og)) {
                            // @ts-ignore
                            e.currentTarget.src = og;
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">“I just unlocked {shareItem.name}! 🎉”</div>
              </div>
              <div className="p-4 pt-0 flex flex-wrap items-center justify-between gap-3">
                <div className="hidden sm:flex items-center gap-2">
                  {typeof navigator !== 'undefined' && !(navigator as any).share && shareItem?.slug && (
                    <>
                      {(() => {
                        const text = encodeURIComponent(`I just unlocked ${shareItem.name}!`);
                        const page = encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : ''}/collectibles/${encodeURIComponent(shareItem.slug || '')}`);
                        const xUrl = `https://twitter.com/intent/tweet?text=${text}&url=${page}`;
                        const waUrl = `https://wa.me/?text=${text}%20${page}`;
                        const igUrl = `https://www.instagram.com/`;
                        return (
                          <>
                            <a href={xUrl} target="_blank" className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60">Share to X</a>
                            <a href={waUrl} target="_blank" className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60">WhatsApp</a>
                            <a href={igUrl} target="_blank" className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60">Instagram</a>
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60" onClick={copyLink}>Copy Link</button>
                  <button className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60" onClick={downloadImage}>Download</button>
                  <button className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-700 dark:text-blue-300 dark:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-950/30" onClick={shareNow}>Share</button>
                  <button className="text-xs px-3 py-1.5 rounded-full border border-emerald-200 text-emerald-700 dark:text-emerald-300 dark:border-emerald-800 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30" onClick={() => {
                    if (shareItem?.slug) window.location.href = `/collectibles/${encodeURIComponent(shareItem.slug)}`;
                    else closeShare();
                  }}>View Story</button>
                  <button className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60" onClick={closeShare}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

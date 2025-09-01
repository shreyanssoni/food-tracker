"use client";
import { useEffect, useRef, useState } from 'react';
import { Gift } from 'lucide-react';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';
import { allowedSlotsForCollectible } from '@/utils/collectibleSlots';

export default function MyCollectiblesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState<{ weapon?: string | null; armor?: string | null; cosmetic?: string | null; pet?: string | null } | null>(null);
  const [eqBusy, setEqBusy] = useState<string | null>(null); // key: slot|collectibleId
  // Share modal state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [shareItem, setShareItem] = useState<{ slug?: string; name?: string; rarity?: string } | null>(null);
  const confettiRef = useRef<HTMLDivElement | null>(null);
  const burstRef = useRef<HTMLDivElement | null>(null);
  // Profile spotlight for goal-linked collectibles (persisted locally for now)
  const [spotlight, setSpotlight] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [res, aRes] = await Promise.all([
          fetch('/api/collectibles/mine'),
          fetch('/api/avatar'),
        ]);
        const [j, aj] = await Promise.all([res.json(), aRes.json()]);
        if (!alive) return;
        if (res.ok) setItems(j.items || []);
        if (aRes.ok) setEquipment(aj?.equipment || null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load spotlight preferences from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('profile_spotlight_collectibles');
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') setSpotlight(obj as Record<string, boolean>);
      }
    } catch {}
  }, []);

  // Persist spotlight changes
  useEffect(() => {
    try {
      localStorage.setItem('profile_spotlight_collectibles', JSON.stringify(spotlight));
      // notify other routes/tabs to refresh spotlight UIs immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('profile_spotlight_collectibles_updated'));
      }
    } catch {}
  }, [spotlight]);

  const rarityToClass = (r?: string) => {
    const rar = (r || 'common').toLowerCase();
    return rar === 'epic' ? 'from-fuchsia-500 to-amber-400' : rar === 'rare' ? 'from-blue-500 to-emerald-400' : 'from-gray-400 to-gray-300';
  };

  const refreshEquipment = async () => {
    try {
      const res = await fetch('/api/avatar');
      const j = await res.json();
      if (res.ok) setEquipment(j?.equipment || null);
    } catch {}
  };

  const equip = async (slot: 'weapon'|'armor'|'cosmetic'|'pet', collectible_id: string) => {
    try {
      setEqBusy(`${slot}|${collectible_id}`);
      const res = await fetch('/api/avatar/equip-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, collectible_id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Equip failed');
      toast.success('Equipped');
      await refreshEquipment();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEqBusy(null);
    }
  };

  const unequip = async (slot: 'weapon'|'armor'|'cosmetic'|'pet') => {
    try {
      setEqBusy(`${slot}|none`);
      const res = await fetch('/api/avatar/unequip-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Unequip failed');
      toast.success('Unequipped');
      await refreshEquipment();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEqBusy(null);
    }
  };

  const openShare = (slug: string, name: string, rarity?: string) => {
    setShareItem({ slug, name, rarity });
    setShareOpen(true);
    requestAnimationFrame(() => setShareVisible(true));
  };

  const closeShare = () => {
    setShareVisible(false);
    setTimeout(() => setShareOpen(false), 200);
  };

  const copyLink = async () => {
    try {
      if (!shareItem?.slug) return;
      const url = `${window.location.origin}/collectibles/${encodeURIComponent(shareItem.slug)}`;
      await navigator.clipboard.writeText(url);
      toast.success('Copied');
    } catch {}
  };

  const downloadImage = async () => {
    try {
      if (!shareItem?.slug) return;
      const origin = window.location.origin;
      const url = `${origin}/api/collectibles/share/${encodeURIComponent(shareItem.slug)}`;
      const ogUrl = `${origin}/api/collectibles/og/${encodeURIComponent(shareItem.slug)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        window.open(ogUrl, '_blank');
        toast.success('Opened image');
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${shareItem.slug}.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success('Downloaded');
    } catch {}
  };

  const shareNow = async () => {
    try {
      if (!shareItem?.slug) return;
      const origin = window.location.origin;
      const imgUrl = `${origin}/api/collectibles/share/${encodeURIComponent(shareItem.slug)}`;
      const ogUrl = `${origin}/api/collectibles/og/${encodeURIComponent(shareItem.slug)}`;
      const pageUrl = `${origin}/collectibles/${encodeURIComponent(shareItem.slug)}`;
      const title = shareItem.name || 'Collectible';
      const text = `I just unlocked ${shareItem.name || 'a collectible'}!`;
      try {
        const res = await fetch(imgUrl, { credentials: 'include' });
        if (res.ok) {
          const blob = await res.blob();
          const file = new File([blob], `${shareItem.slug}.svg`, { type: 'image/svg+xml' });
          const navAny = navigator as any;
          if (navAny?.canShare?.({ files: [file] })) {
            await navAny.share({ title, text, files: [file] });
            return;
          }
        } else if (res.status === 401 || res.status === 403) {
          if (navigator.share) return await navigator.share({ title, text, url: ogUrl });
          return window.open(ogUrl, '_blank');
        }
      } catch {}
      if (navigator.share) await navigator.share({ title, text, url: imgUrl });
      else window.open(imgUrl, '_blank');
    } catch {}
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">My Collectibles</h1>
      {loading ? (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/50 p-4 animate-pulse h-36" />
          ))}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.length === 0 ? (
            <p className="text-sm text-gray-500">You don't own any collectibles yet.</p>
          ) : items.map((c) => {
            const icon = c.icon && (c.icon.startsWith('http') || c.icon.startsWith('/')) ? c.icon : (c.icon ? `/images/collectibles/${c.icon}.svg` : null);
            const rarity = (c.rarity || 'common').toLowerCase();
            const rarityClass =
              rarity === 'epic' ? 'from-fuchsia-500 to-amber-400' :
              rarity === 'rare' ? 'from-blue-500 to-emerald-400' :
              'from-gray-400 to-gray-300';
            const eq = equipment || {} as any;
            const equippedSlots: Array<'weapon'|'armor'|'cosmetic'|'pet'> = [];
            if (eq.weapon === c.id) equippedSlots.push('weapon');
            if (eq.armor === c.id) equippedSlots.push('armor');
            if (eq.cosmetic === c.id) equippedSlots.push('cosmetic');
            if (eq.pet === c.id) equippedSlots.push('pet');
            const isGoalLinked = !!c?.is_goal_collectible && !!c?.is_user_created;
            const isSpotlit = !!spotlight[c.id as string];
            return (
              <div
                key={c.id}
                className={`relative rounded-2xl p-4 border bg-white/70 dark:bg-gray-950/60 shadow-sm ${
                  isGoalLinked
                    ? 'border-pink-200/70 dark:border-pink-900/50 ring-1 ring-inset ring-pink-300/40 dark:ring-pink-800/40'
                    : 'border-gray-200/70 dark:border-gray-800/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <a href={c.public_slug ? `/collectibles/${encodeURIComponent(c.public_slug)}` : '#'} className="text-sm font-semibold truncate hover:underline" title={c.name}>{c.name}</a>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r ${rarityClass} text-white shadow-sm`}>{(c.rarity || 'Common')}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{c.lore || c.description || 'Collectible'}</div>
                <a href={c.public_slug ? `/collectibles/${encodeURIComponent(c.public_slug)}` : '#'}
                   className={`mt-3 h-32 rounded-xl grid place-items-center overflow-hidden border ${
                     isGoalLinked ? 'border-pink-200/70 dark:border-pink-900/50 bg-pink-50/60 dark:bg-pink-950/20' : 'border-gray-200/60 dark:border-gray-800/60 bg-gray-50 dark:bg-gray-900'
                   } ${isGoalLinked ? 'shadow-[0_0_0_3px_rgba(236,72,153,0.12),0_10px_25px_-10px_rgba(236,72,153,0.45)]' : ''}`}
                >
                  {/* Always render an image and fallback to default placeholder if missing or load fails */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={icon || '/images/collectibles/default.svg'}
                    alt={c.name}
                    className={`h-full w-full object-cover ${isGoalLinked ? 'saturate-110' : ''}`}
                    onError={(e) => {
                      const fallback = '/images/collectibles/default.svg';
                      // @ts-ignore
                      if (!e.currentTarget.src.endsWith(fallback)) {
                        // @ts-ignore
                        e.currentTarget.src = fallback;
                      }
                    }}
                  />
                </a>
                {/* Controls */}
                {isGoalLinked ? (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-pink-700 dark:text-pink-300 inline-flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-pink-500" />
                      Goal Reward
                    </div>
                    <button
                      onClick={() => setSpotlight((m) => ({ ...m, [c.id]: !m[c.id] }))}
                      className={`text-[11px] px-2.5 py-1.5 rounded-full border ${isSpotlit
                        ? 'border-pink-300 text-pink-700 dark:text-pink-300 dark:border-pink-700 bg-pink-500/10'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60'}`}
                      title={isSpotlit ? 'Hide from profile' : 'Show on profile'}
                    >
                      {isSpotlit ? 'Shown on profile' : 'Show on profile'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      {allowedSlotsForCollectible(c).map((slot) => {
                        const currentInSlot = (equipment as any)?.[slot] as string | null | undefined;
                        const isEquippedHere = currentInSlot === c.id;
                        const isBusy = eqBusy === `${slot}|${isEquippedHere ? 'none' : c.id}`;
                        const disabled = !!eqBusy;
                        const title = isEquippedHere ? `Unequip from ${slot}` : `Equip to ${slot}`;
                        const label = isEquippedHere ? `Unequip ${slot}` : `Equip ${slot}`;
                        return (
                          <button
                            key={slot}
                            className={`text-[10px] px-2 py-1 rounded-full border ${isEquippedHere
                              ? 'border-emerald-300 text-emerald-700 dark:text-emerald-300 dark:border-emerald-700 bg-emerald-500/10'
                              : 'border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60'}`}
                            onClick={() => (isEquippedHere ? unequip(slot) : equip(slot, c.id))}
                            disabled={disabled}
                            title={title}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      {c.public_slug && (
                        <button onClick={() => openShare(c.public_slug, c.name, c.rarity)} className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60">Share</button>
                      )}
                      {c.public_slug && (
                        <a className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-700 dark:text-blue-300 dark:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-950/30" href={`/collectibles/${encodeURIComponent(c.public_slug)}`}>View</a>
                      )}
                    </div>
                  </div>
                )}
                {c.is_badge && (
                  <div className="absolute -top-2 -right-2 text-[10px] px-2 py-0.5 rounded-full border border-amber-400/50 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-900/30 dark:text-amber-200 shadow-sm">Badge</div>
                )}
                {isGoalLinked && (
                  <div className="absolute -top-2 -left-2 text-[10px] px-2 py-0.5 rounded-full border border-pink-300/60 bg-pink-50 text-pink-700 dark:border-pink-700/50 dark:bg-pink-900/30 dark:text-pink-200 shadow-sm">Goal Reward</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Share Modal (same as Shop) */}
      {shareOpen && shareItem && createPortal(
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
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

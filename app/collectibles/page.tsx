"use client";
import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';

export default function MyCollectiblesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/collectibles/mine');
        const j = await res.json();
        if (!alive) return;
        if (res.ok) setItems(j.items || []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

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
            return (
              <div key={c.id} className="relative rounded-2xl p-4 border border-gray-200/70 dark:border-gray-800/70 bg-white/70 dark:bg-gray-950/60 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold truncate" title={c.name}>{c.name}</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r ${rarityClass} text-white shadow-sm`}>{(c.rarity || 'Common')}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{c.description || 'Collectible'}</div>
                <div className="mt-3 h-32 rounded-xl border border-gray-200/60 dark:border-gray-800/60 grid place-items-center bg-gray-50 dark:bg-gray-900 overflow-hidden">
                  {/* Always render an image and fallback to default placeholder if missing or load fails */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={icon || '/images/collectibles/default.svg'}
                    alt={c.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      const fallback = '/images/collectibles/default.svg';
                      // @ts-ignore
                      if (!e.currentTarget.src.endsWith(fallback)) {
                        // @ts-ignore
                        e.currentTarget.src = fallback;
                      }
                    }}
                  />
                </div>
                {c.is_badge && (
                  <div className="absolute -top-2 -right-2 text-[10px] px-2 py-0.5 rounded-full border border-amber-400/50 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-900/30 dark:text-amber-200 shadow-sm">Badge</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

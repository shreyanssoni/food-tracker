"use client";
import { useEffect, useState } from 'react';
import { Gem } from 'lucide-react';
import { toast } from 'sonner';

export default function CollectiblesShopPage() {
  const [items, setItems] = useState<any[]>([]);
  const [diamonds, setDiamonds] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch('/api/collectibles/store');
    const j = await res.json();
    if (res.ok) {
      setItems(j.items || []);
      setDiamonds(j.diamonds || 0);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await load();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const purchase = async (store_id: string) => {
    try {
      setBusy(store_id);
      const res = await fetch('/api/collectibles/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id })
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.code === 'ALREADY_OWNED') {
          toast.info('Already owned. Redirecting to My Collectibles');
          window.location.href = '/collectibles';
          return;
        }
        toast.error(j.error || 'Purchase failed');
        return;
      }
      toast.success('Purchased!');
      setDiamonds(j.diamonds);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Collectibles Shop</h1>
        <div className="text-sm px-3 py-1.5 rounded-full border border-gray-200/70 dark:border-gray-800/70 bg-white/70 dark:bg-gray-900/70 shadow-sm">
          Diamonds: {diamonds}
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200/70 dark:border-gray-800/70 bg-white/60 dark:bg-gray-950/50 p-4 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.length === 0 && (
            <div className="col-span-full text-center text-sm text-gray-600 dark:text-gray-400">
              No items available yet. Progress your level or unlock requirements to see more.
            </div>
          )}
          {items.map((i: any) => {
            const c = i.collectible || {};
            const icon = c.icon && (c.icon.startsWith('http') || c.icon.startsWith('/')) ? c.icon : (c.icon ? `/images/collectibles/${c.icon}.svg` : null);
            const rarity = (c.rarity || 'common').toLowerCase();
            const rarityClass =
              rarity === 'epic' ? 'from-fuchsia-500 to-amber-400' :
              rarity === 'rare' ? 'from-blue-500 to-emerald-400' :
              'from-gray-400 to-gray-300';
            return (
              <div
                key={i.id}
                className="group relative h-full flex flex-col rounded-xl p-4 border border-gray-200/70 dark:border-gray-800/70 bg-white/70 dark:bg-gray-950/60 shadow-sm transition-all md:hover:shadow-md md:hover:-translate-y-0.5"
              >
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 md:gap-2">
                  <div className="min-w-0">
                    <div
                      className="text-[15px] sm:text-base font-semibold leading-tight text-gray-900 dark:text-gray-100 whitespace-normal break-words max-h-[2.6rem] overflow-hidden"
                      title={c.name || 'Collectible'}
                    >
                      {c.name || 'Collectible'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0 mt-0.5 md:mt-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r ${rarityClass} text-white shadow-sm capitalize`}>{(c.rarity || 'Common')}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-gray-200/70 dark:border-gray-800/70 bg-white/80 dark:bg-gray-900/80 text-gray-800 dark:text-gray-200">
                      <Gem className="h-3.5 w-3.5" /> {i.price}
                    </span>
                  </div>
                </div>

                {/* Badge gate banner slot (fixed height for alignment) */}
                <div className="mt-2 min-h-[38px]">
                  {!i.owned && !i.can_purchase && i.unavailable_reason === 'badge_required' && (
                    <div className="text-[11px] px-2 py-1.5 rounded-lg border border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-900/30 dark:text-amber-200">
                      Requires {i.requirements?.required_badge_name || 'a badge'} badge to unlock
                    </div>
                  )}
                </div>

                {/* Image */}
                <div className="mt-1 h-32 sm:h-36 rounded-lg border border-gray-200/60 dark:border-gray-800/60 grid place-items-center bg-gray-50 dark:bg-gray-900 overflow-hidden">
                  {/* Always render an image and fallback to default placeholder if missing or load fails */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={icon || '/images/collectibles/default.svg'}
                    alt={c.name}
                    className="h-full w-full object-contain scale-100 md:group-hover:scale-[1.02] transition-transform"
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
                <div className="mt-3 flex items-center justify-between gap-2">
                  {i.owned ? (
                    i.owned_source === 'admin_grant' ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" title="Awarded for free by admin">FREE</span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">Owned</span>
                    )
                  ) : (
                    <button
                      className="text-[12px] px-3 py-1.5 rounded-full border border-transparent bg-gradient-to-r from-blue-600 to-emerald-500 text-white w-full sm:w-auto disabled:opacity-60 disabled:grayscale"
                      onClick={() => purchase(i.id)}
                      disabled={busy === i.id || !i.can_purchase}
                    >
                      {busy === i.id ? 'Buying...' : (i.can_purchase ? 'Purchase' : 'Locked')}
                    </button>
                  )}
                </div>
                {/* Description slot with fixed height for alignment */}
                <div className="mt-2 min-h-[36px] text-xs text-gray-600 dark:text-gray-400">
                  {!i.owned && !i.can_purchase ? (
                    <>
                      {i.unavailable_reason === 'badge_required' && `Reach the ${i.requirements?.required_badge_name || 'required'} badge to access this item.`}
                      {i.unavailable_reason === 'level_required' && `Reach level ${i.requirements?.min_level ?? 1} to access this item.`}
                      {i.unavailable_reason === 'not_available_yet' && 'Keep progressing on your goal to unlock this reward!'}
                      {i.unavailable_reason === 'inactive' && 'This item is not currently available.'}
                    </>
                  ) : (
                    <span className="opacity-0">.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Gem, Sparkles, Gift, Lock, CheckCircle2, Crown, Star } from 'lucide-react';

type Reward = {
  id: string;
  kind: 'diamond' | 'collectible';
  amount: number | null;
  collectible_id: string | null;
  unlock_level: number;
  unlocked: boolean;
  claimed?: boolean;
  owned?: boolean;
  collectible?: {
    id: string;
    name: string;
    description?: string | null;
    icon?: string | null;
  } | null;
};

type GroupItem = {
  reward_id: string;
  kind: 'diamond' | 'collectible';
  amount: number | null;
  collectible_id?: string | null;
  collectible?: Reward['collectible'] | null;
  owned?: boolean;
  claimed?: boolean;
};

type RewardGroup = {
  group_id: string | null;
  unlock_rule: 'level' | 'total_ep';
  unlock_level: number | null;
  unlock_ep: number | null;
  unlocked: boolean;
  all_claimed: boolean;
  items: GroupItem[];
};

export default function RewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [groups, setGroups] = useState<RewardGroup[]>([]);
  const [level, setLevel] = useState<number>(1);
  const [progress, setProgress] = useState<{ level: number; ep_in_level: number; ep_required: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevLevelRef = useRef<number>(1);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const [rRes, pRes] = await Promise.all([fetch('/api/rewards'), fetch('/api/progress')]);
        const [rData, pData] = await Promise.all([rRes.json(), pRes.json().catch(()=>({}))]);
        if (!mounted) return;
        if (!rRes.ok) throw new Error(rData.error || 'Failed to load rewards');
        setRewards(rData.rewards || []);
        setGroups(rData.groups || []);
        setLevel(rData.level || pData?.progress?.level || 1);
        if (pData?.progress) {
          setProgress({ level: pData.progress.level, ep_in_level: pData.progress.ep_in_level ?? 0, ep_required: pData.progress.ep_required });
        }
        setError(null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load rewards');
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  // Track previous level for unlock animation
  useEffect(() => {
    if (level !== prevLevelRef.current) {
      prevLevelRef.current = level;
    }
  }, [level]);

  // helper to resolve collectible image; supports absolute URLs, root paths, or slug -> local fallback
  const resolveIcon = (icon?: string | null) => {
    if (!icon) return null;
    if (icon.startsWith('http') || icon.startsWith('/')) return icon;
    // treat as slug e.g. "badge-bronze"
    return `/images/collectibles/${icon}.svg`;
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Crown className="h-6 w-6 text-amber-400" /> Rewards
        </h1>
        <div className="text-xs sm:text-sm px-2 py-1 rounded-full bg-gradient-to-r from-blue-500/15 to-emerald-500/15 border border-white/10 text-gray-700 dark:text-gray-200 inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5 text-amber-400" /> Level {level}
        </div>
      </div>

      {/* Level card */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/60 to-white/30 dark:from-gray-950/70 dark:to-gray-900/50 backdrop-blur p-4 sm:p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white flex items-center justify-center shadow-sm ring-1 ring-white/20">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="font-semibold">Your Level</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Keep completing tasks to earn EP and unlock rewards.</div>
            {progress ? (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span>Level {progress.level}</span>
                  <span>{progress.ep_in_level} / {progress.ep_required} EP</span>
                </div>
                <div className="mt-2 h-3 w-full rounded-full bg-gray-100/60 dark:bg-gray-900/60 overflow-hidden ring-1 ring-inset ring-white/10">
                  <div
                    className="h-3 rounded-full bg-[conic-gradient(at_0%_50%,#2563eb,#10b981,#2563eb)] animate-[pulse_2s_ease-in-out_infinite] [animation-play-state:paused] group-hover:[animation-play-state:running] transition-all"
                    style={{ width: `${Math.min(100, Math.round(((progress.ep_in_level || 0) / Math.max(progress.ep_required || 1, 1)) * 100))}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-3 h-2 w-full rounded-full bg-gray-100 dark:bg-gray-900 overflow-hidden">
                <div className="h-2 w-1/3 rounded-full bg-gradient-to-r from-blue-600/50 to-emerald-500/50 animate-pulse" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {error && (
        <div className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/50 p-4 animate-pulse">
              <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="mt-2 h-3 w-1/2 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="mt-4 h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(groups && groups.length ? groups : [...rewards].sort((a,b)=>a.unlock_level - b.unlock_level)).map((item: any) => {
            // If groups present, item is RewardGroup; else it's Reward
            const isGroup = Array.isArray((item as RewardGroup).items);
            if (isGroup) {
              const g = item as RewardGroup;
              const isUnlocked = g.unlocked;
              const justUnlocked = false; // keep simple for grouped
              const levelLabel = g.unlock_rule === 'level' ? g.unlock_level : undefined;
              const anyCollectibleUnlocked = g.items.some(it => it.kind==='collectible' && isUnlocked && !it.owned && !it.claimed);
              const onClick = () => {
                if (!anyCollectibleUnlocked) return;
                router.push('/collectibles/shop');
              };
              // Summaries
              const diamonds = g.items.filter(it=>it.kind==='diamond' && (it.amount ?? 0) > 0) as GroupItem[];
              const collectibles = g.items.filter(it=>it.kind==='collectible') as GroupItem[];
              const iconUrl = collectibles[0]?.collectible?.icon ? resolveIcon(collectibles[0]?.collectible?.icon || null) : null;
              const rarity = (collectibles[0]?.collectible as any)?.rarity as ('common'|'rare'|'epic'|string) | undefined;
              const rarityStyle = (() => {
                switch ((rarity || '').toLowerCase()) {
                  case 'epic': return { label: 'Epic', cls: 'bg-purple-600 text-white', ring: 'ring-purple-500/30' };
                  case 'rare': return { label: 'Rare', cls: 'bg-blue-600 text-white', ring: 'ring-blue-500/30' };
                  case 'common':
                  default: return { label: 'Common', cls: 'bg-gray-600 text-white', ring: 'ring-gray-500/30' };
                }
              })();
              return (
                <div
                  key={`${g.group_id ?? g.unlock_rule+':'+(g.unlock_level ?? g.unlock_ep ?? '')}`}
                  className={`group relative rounded-2xl p-4 shadow-sm transition overflow-hidden border bg-white/70 dark:bg-gray-950/60 h-full flex flex-col ${isUnlocked ? 'border-emerald-500/30 hover:shadow-emerald-500/20' : 'border-gray-200 dark:border-gray-800'} ${anyCollectibleUnlocked ? 'cursor-pointer' : ''}`}
                  onClick={onClick}
                  role={anyCollectibleUnlocked ? 'button' : undefined}
                  aria-disabled={!isUnlocked}
                >
                  <div className={`pointer-events-none absolute inset-0 rounded-2xl ${isUnlocked ? 'bg-gradient-to-br from-emerald-500/10 via-blue-500/10 to-transparent' : ''}`} />
                  <div className="pointer-events-none absolute -right-4 -bottom-4 opacity-[0.07] text-gray-500 dark:text-gray-300">
                    <Gift className="h-24 w-24"/>
                  </div>
                  <div className="relative flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{g.unlock_rule==='level' ? `Level ${levelLabel}` : `Total EP ${g.unlock_ep}`}</div>
                      <div className="mt-1 font-semibold flex items-center gap-3 flex-wrap">
                        {diamonds.map((d, idx)=> (
                          <span key={`d-${idx}`} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 truncate">
                            <Gem className="h-4 w-4" /> {d.amount}
                          </span>
                        ))}
                        {collectibles.map((c, idx)=> (
                          <span key={`c-${idx}`} className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 truncate">
                            <Gift className="h-4 w-4" /> <span className="truncate">{c.collectible?.name || 'Collectible'}</span>
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                        {collectibles.length ? (collectibles[0]?.collectible?.description || 'Collectible reward') : 'Currency reward'}
                      </div>
                    </div>
                    <div className={`shrink-0 text-xs px-2 py-1 rounded-full border font-medium inline-flex items-center gap-1 ${isUnlocked
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                      : 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-100 border-gray-500/30'}
                    `}>
                      {!isUnlocked && <Lock className="h-3.5 w-3.5"/>}
                      {isUnlocked ? 'Unlocked' : 'Locked'}
                    </div>
                  </div>
                  <div className="mt-4 grow flex flex-col">
                    {collectibles.length ? (
                      <div className="relative">
                        <div className={`relative h-32 w-full rounded-xl overflow-hidden border border-white/10 bg-gradient-to-br from-gray-100/50 to-gray-200/30 dark:from-gray-900/60 dark:to-gray-800/40 ${justUnlocked ? 'ring-2 ' + rarityStyle.ring : ''}`}>
                          <div className={`absolute left-0 top-0 m-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${rarityStyle.cls} shadow`}>{rarityStyle.label}</div>
                          {iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={iconUrl} alt={collectibles[0]?.collectible?.name || 'Collectible'} className={`h-full w-full object-cover ${isUnlocked ? '' : 'opacity-40'}`}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <div className="h-full w-full grid place-items-center">
                              <Gift className={`${isUnlocked ? 'text-emerald-500' : 'text-gray-400'} h-10 w-10`} />
                            </div>
                          )}
                          {(diamonds[0]?.amount ?? 0) > 0 && (
                            <div className="absolute right-2 top-2 text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 shadow-sm">
                              <Gem className="h-3.5 w-3.5"/> +{diamonds[0]?.amount}
                            </div>
                          )}
                        </div>
                        {collectibles.some(c=>c.owned) ? (
                          <div className="absolute -bottom-3 left-3 text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 shadow-sm">
                            <CheckCircle2 className="h-3.5 w-3.5"/> Owned
                          </div>
                        ) : null}
                        {(!collectibles.some(c=>c.owned) && isUnlocked) ? (
                          <div className="absolute -bottom-3 right-3 text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full border bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 shadow-sm">
                            <Gift className="h-3.5 w-3.5"/> Unlocked
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-1 h-32 w-full rounded-xl border border-white/10 bg-gradient-to-br from-blue-500/10 to-emerald-500/10 grid place-items-center">
                        {(diamonds[0]?.amount ?? 0) > 0 ? (
                          <Gem className="h-10 w-10 text-blue-500/70" />
                        ) : (
                          <div className="text-xs text-gray-600 dark:text-gray-400">Currency</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            const r = item as Reward;
            const isUnlocked = r.unlocked;
            const isOwned = r.kind === 'collectible' ? r.owned : undefined;
            const iconUrl = resolveIcon(r.collectible?.icon || null);
            const rarity = (r.collectible as any)?.rarity as ('common'|'rare'|'epic'|string) | undefined;
            const justUnlocked = !loading && isUnlocked && (prevLevelRef.current >= r.unlock_level ? false : true);
            const rarityStyle = (() => {
              switch ((rarity || '').toLowerCase()) {
                case 'epic':
                  return { label: 'Epic', cls: 'bg-purple-600 text-white', ring: 'ring-purple-500/30' };
                case 'rare':
                  return { label: 'Rare', cls: 'bg-blue-600 text-white', ring: 'ring-blue-500/30' };
                case 'common':
                default:
                  return { label: 'Common', cls: 'bg-gray-600 text-white', ring: 'ring-gray-500/30' };
              }
            })();
            const onClick = () => {
              if (r.kind !== 'collectible') return;
              if (!isUnlocked) return;
              if (isOwned || r.claimed) {
                toast.info('Already claimed. Redirecting to My Collectibles');
                router.push('/collectibles');
                return;
              }
              router.push('/collectibles/shop');
            };
            return (
              <div
                key={r.id}
                className={`group relative rounded-2xl p-4 shadow-sm transition overflow-hidden border bg-white/70 dark:bg-gray-950/60 h-full flex flex-col ${isUnlocked ? 'border-emerald-500/30 hover:shadow-emerald-500/20' : 'border-gray-200 dark:border-gray-800'} ${justUnlocked ? 'ring-2 ring-emerald-400/40 animate-pulse' : ''} ${r.kind==='collectible' && isUnlocked ? 'cursor-pointer' : ''}`}
                onClick={onClick}
                role={r.kind==='collectible' ? 'button' : undefined}
                aria-disabled={!isUnlocked}
              >
                {/* glowing gradient border */}
                <div className={`pointer-events-none absolute inset-0 rounded-2xl ${isUnlocked ? 'bg-gradient-to-br from-emerald-500/10 via-blue-500/10 to-transparent' : ''}`} />

                {/* decorative background icon */}
                <div className="pointer-events-none absolute -right-4 -bottom-4 opacity-[0.07] text-gray-500 dark:text-gray-300">
                  {r.kind === 'diamond' ? <Gem className="h-24 w-24"/> : <Gift className="h-24 w-24"/>}
                </div>

                {/* Header */}
                <div className="relative flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Level {r.unlock_level}</div>
                    <div className="mt-1 font-semibold flex items-center gap-2 truncate">
                      {r.kind === 'diamond' ? (
                        (r.amount ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 truncate">
                            <Gem className="h-4 w-4" /> {r.amount}
                          </span>
                        ) : (
                          <span className="text-gray-600 dark:text-gray-400 text-sm">Currency reward</span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 truncate">
                          <Gift className="h-4 w-4" /> <span className="truncate">{r.collectible?.name || 'Collectible'}</span>
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                      {r.kind === 'collectible' ? (r.collectible?.description || 'Collectible reward') : 'Currency reward'}
                    </div>
                  </div>
                  <div className={`shrink-0 text-xs px-2 py-1 rounded-full border font-medium inline-flex items-center gap-1 ${isUnlocked
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                    : 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-100 border-gray-500/30'}
                  `}>
                    {!isUnlocked && <Lock className="h-3.5 w-3.5"/>}
                    {isUnlocked ? 'Unlocked' : 'Locked'}
                  </div>
                </div>

                {/* Media / Footer */}
                <div className="mt-4 grow flex flex-col">
                  {r.kind === 'collectible' ? (
                    <div className="relative">
                      <div className={`relative h-32 w-full rounded-xl overflow-hidden border border-white/10 bg-gradient-to-br from-gray-100/50 to-gray-200/30 dark:from-gray-900/60 dark:to-gray-800/40 ${justUnlocked ? 'ring-2 ' + rarityStyle.ring : ''}`}>
                        {/* rarity ribbon */}
                        <div className={`absolute left-0 top-0 m-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${rarityStyle.cls} shadow`}>{rarityStyle.label}</div>
                        {iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={iconUrl}
                            alt={r.collectible?.name || 'Collectible'}
                            className={`h-full w-full object-cover ${isUnlocked ? '' : 'opacity-40'}`}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="h-full w-full grid place-items-center">
                            <Gift className={`${isUnlocked ? 'text-emerald-500' : 'text-gray-400'} h-10 w-10`} />
                          </div>
                        )}
                        {/* lock overlay with smooth fade/scale */}
                        <div className={`absolute inset-0 ${isUnlocked ? 'opacity-0 scale-95' : 'opacity-100 scale-100'} transition-all duration-500 bg-black/35 backdrop-blur-[1px] grid place-items-center`}>
                            <div className="h-10 w-10 rounded-full bg-black/40 border border-white/10 grid place-items-center text-white">
                              <Lock className="h-5 w-5" />
                            </div>
                        </div>
                        {(r.amount ?? 0) > 0 && (
                          <div className="absolute right-2 top-2 text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 shadow-sm">
                            <Gem className="h-3.5 w-3.5"/> +{r.amount}
                          </div>
                        )}
                      </div>
                      {isOwned ? (
                        <div className="absolute -bottom-3 left-3 text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 shadow-sm">
                          <CheckCircle2 className="h-3.5 w-3.5"/> Owned
                        </div>
                      ) : null}
                      {(!isOwned && isUnlocked) ? (
                        <div className="absolute -bottom-3 right-3 text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full border bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 shadow-sm">
                          <Gift className="h-3.5 w-3.5"/> Unlocked
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    // Diamond reward: add spacer to align heights
                    <div className="mt-1 h-32 w-full rounded-xl border border-white/10 bg-gradient-to-br from-blue-500/10 to-emerald-500/10 grid place-items-center">
                      {(r.amount ?? 0) > 0 ? (
                        <Gem className="h-10 w-10 text-blue-500/70" />
                      ) : (
                        <div className="text-xs text-gray-600 dark:text-gray-400">Currency</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && (groups?.length ? false : !rewards.length) && (
        <p className="mt-6 text-sm text-gray-500">No rewards configured.</p>
      )}
    </div>
  );
}

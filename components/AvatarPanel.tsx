"use client";
import React, { useEffect, useState } from "react";
import AvatarCanvas from "./AvatarCanvas";
import EpBar from "./EpBar";
import { toast } from "sonner";

type Progress = { level: number; ep_in_level: number; ep_required: number; diamonds?: number; total_ep?: number };
type LifeStreak = {
  current: number;
  longest: number;
  canRevive: boolean;
  reviveCost: number;
  week?: Array<{ day: string; status: 'counted' | 'revived' | 'missed' | 'none' }>;
  weekly?: { consecutive: number; longest: number; currentWeekDays?: number };
};

export default function AvatarPanel({
  progress: progressProp,
  lifeStreak: lifeStreakProp,
}: {
  progress?: Progress | null;
  lifeStreak?: LifeStreak | null;
}) {
  const [loading, setLoading] = useState(true);
  const [avatarPayload, setAvatarPayload] = useState<null | {
    avatar: { appearance_stage: string } | null;
    equipment: { weapon?: string | null; armor?: string | null; cosmetic?: string | null; pet?: string | null } | null;
    equippedMeta: Record<string, any>;
    imageUrl?: string | null;
  }>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [lifeStreak, setLifeStreak] = useState<LifeStreak | null>(null);
  const [reviving, setReviving] = useState(false);
  // Spotlighted goal-linked collectibles (from localStorage + API)
  const [spotlightMap, setSpotlightMap] = useState<Record<string, boolean>>({});
  const [spotlightItems, setSpotlightItems] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [aRes, pRes, lsRes] = await Promise.all([
          fetch("/api/avatar", { cache: 'no-store' }),
          fetch("/api/progress", { cache: 'no-store' }),
          fetch("/api/life-streak", { cache: 'no-store' }),
        ]);
        const [aJson, pJson, lsJson] = await Promise.all([aRes.json(), pRes.json(), lsRes.json()]);
        if (aRes.ok && alive) setAvatarPayload(aJson);
        if (!progressProp && pRes.ok && pJson?.progress && alive) setProgress(pJson.progress);
        if (!lifeStreakProp && lsRes.ok && lsJson?.lifeStreak && alive) setLifeStreak(lsJson.lifeStreak);
      } catch {} finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Sync props from parent (dashboard) for instant updates
  useEffect(() => {
    if (progressProp) setProgress(progressProp);
  }, [progressProp]);
  useEffect(() => {
    if (lifeStreakProp) setLifeStreak(lifeStreakProp);
  }, [lifeStreakProp]);

  // Load spotlight map and items
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('profile_spotlight_collectibles') : null;
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') setSpotlightMap(obj as Record<string, boolean>);
      }
    } catch {}
    (async () => {
      try {
        const res = await fetch('/api/collectibles/mine');
        const j = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(j.items)) {
          setSpotlightItems(j.items as any[]);
        }
      } catch {}
    })();
    const onLocal = () => {
      try {
        const r = localStorage.getItem('profile_spotlight_collectibles');
        if (!r) return setSpotlightMap({});
        const obj = JSON.parse(r);
        if (obj && typeof obj === 'object') setSpotlightMap(obj as Record<string, boolean>);
      } catch {}
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'profile_spotlight_collectibles') onLocal();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('profile_spotlight_collectibles_updated', onLocal as any);
      window.addEventListener('storage', onStorage);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('profile_spotlight_collectibles_updated', onLocal as any);
        window.removeEventListener('storage', onStorage);
      }
    };
  }, []);

  // Track previous values to trigger flare animations on increases
  const [levelFlare, setLevelFlare] = useState(false);
  const [streakFlare, setStreakFlare] = useState(false);
  const prevLevel = React.useRef<number | null>(null);
  const prevStreak = React.useRef<number | null>(null);

  useEffect(() => {
    if (progress?.level != null) {
      if (prevLevel.current != null && progress.level > prevLevel.current) {
        setLevelFlare(true);
        const t = setTimeout(() => setLevelFlare(false), 900);
        return () => clearTimeout(t);
      }
      prevLevel.current = progress.level;
    }
  }, [progress?.level]);

  useEffect(() => {
    if (lifeStreak?.current != null) {
      if (prevStreak.current != null && lifeStreak.current > prevStreak.current) {
        setStreakFlare(true);
        const t = setTimeout(() => setStreakFlare(false), 900);
        return () => clearTimeout(t);
      }
      prevStreak.current = lifeStreak.current;
    }
  }, [lifeStreak?.current]);

  if (loading) {
    return (
      <section className="rounded-2xl bg-surface p-4 sm:p-5">
        <div className="animate-pulse h-40 rounded-xl bg-surface2" />
      </section>
    );
  }

  if (!avatarPayload?.avatar) {
    return (
      <section className="rounded-2xl bg-surface p-3 sm:p-5">
        <div className="flex flex-col md:flex-row items-center md:items-stretch gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your Avatar</div>
            <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">Start earning EP and equipping collectibles to bring your avatar to life.</div>
          </div>
          <div className="w-full md:w-64 lg:w-72">
            <div className="aspect-square rounded-xl bg-surface2 grid place-items-center">
              <div className="text-xs text-slate-500 dark:text-slate-400">No avatar yet</div>
            </div>
          </div>

          {/* Additional info kept minimal when no avatar */}
        </div>
      </section>
    );
  }

  const a = avatarPayload.avatar;

  // Shared small tab style to keep diamond and streak pills same size
  const smallTabBase =
    "inline-flex items-center justify-center gap-1 rounded-full bg-surface2 px-1.5 py-0.5 w-16 h-6 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow";
  const smallIconCls = "h-3 w-3";

  return (
    <section className="rounded-2xl bg-surface p-3 sm:p-5">
      <div className="flex flex-col md:flex-row items-start md:items-stretch gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          {progress && (
            <EpBar level={progress.level} currentEp={progress.ep_in_level} requiredEp={progress.ep_required} />
          )}
          <div className="mt-1.5 sm:mt-2 text-[11px] text-slate-600 dark:text-slate-400">Earn EP by completing tasks. Level up to unlock rare collectibles.</div>
          {/* Gamified quick stats inside avatar panel */}
          <div className="mt-2.5 sm:mt-3 flex flex-wrap items-center gap-1.5">
            {/* Diamonds */}
            <span className={`${smallTabBase}`}>
              <span aria-hidden className="text-blue-600 text-[12px] leading-none">💎</span>
              <span className="font-semibold text-[11px]">{progress?.diamonds ?? 0}</span>
            </span>
            {/* Total EP */}
            <span className="inline-flex items-center gap-1 rounded-full bg-surface2 px-1.5 py-0.5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow">
              <svg viewBox="0 0 24 24" className="h-3 w-3 text-indigo-600" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/>
              </svg>
              <span className="font-semibold text-[11px]">{progress?.total_ep ?? 0}</span>
            </span>
            {/* Life Streak current/longest */}
            <span className={`${smallTabBase}`}>
              <span aria-hidden className="text-[12px] leading-none">🔥</span>
              <span className="font-semibold text-[11px]">{lifeStreak ? `${lifeStreak.current}` : '—'}</span>
            </span>
            {/* Weekly consistency (consecutive/longest) */}
            <span className={`${smallTabBase}`}>
              <svg viewBox="0 0 24 24" className={`${smallIconCls} text-emerald-600`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="2"/>
                <path d="M3 10h18"/>
              </svg>
              <span className="font-semibold text-[11px]">
                {lifeStreak?.weekly ? `${lifeStreak.weekly.currentWeekDays}` : '—'}
              </span>
            </span>
          </div>

          {/* Weekly consistency mini-meter */}
          <div className="mt-3 sm:mt-4">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Weekly consistency</div>
              <div className="text-[11px] text-slate-500">
                Current {lifeStreak?.weekly?.currentWeekDays ?? 0} • Longest {lifeStreak?.weekly?.longest ?? 0}
              </div>
            </div>
            <div className="flex gap-1.5">
              {Array.isArray(lifeStreak?.week) && (lifeStreak!.week as any[]).length === 7 ? (
                (lifeStreak!.week as Array<{ day: string; status: 'counted'|'revived'|'missed'|'none' }>).map((d, i) => {
                  const cls = d.status === 'counted'
                    ? 'bg-amber-400'
                    : d.status === 'revived'
                      ? 'bg-blue-500'
                      : d.status === 'missed'
                        ? 'bg-red-500'
                        : 'bg-slate-300 dark:bg-slate-700';
                  return <span key={i} className={`h-2 sm:h-2.5 w-6 sm:w-8 rounded-full ${cls}`} aria-hidden />;
                })
              ) : (
                Array.from({ length: 7 }).map((_, i) => (
                  <span key={i} className="h-2 sm:h-2.5 w-6 sm:w-8 rounded-full bg-slate-300 dark:bg-slate-700" aria-hidden />
                ))
              )}
            </div>
          </div>

          {/* Spotlight chips now render inside the avatar box pills row */}
          {/* Life Streak (compact card-style) */}
          <div className="mt-3 sm:mt-4 rounded-lg sm:rounded-xl bg-surface2 p-2.5 sm:p-3">
            <div className="flex items-start justify-between">
              <div className="text-sm font-semibold flex items-center gap-2 text-orange-900 dark:text-orange-100">
                <span aria-hidden>🔥</span>
                <span>Life Streak</span>
              </div>
              {lifeStreak?.canRevive ? (
                <button
                  disabled={reviving}
                  onClick={async () => {
                    if (reviving) return;
                    try {
                      setReviving(true);
                      const res = await fetch("/api/life-streak/revive", { method: "POST" });
                      const j = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(j.error || "Revive failed");
                      // refresh life streak + progress
                      const [lsRes, pRes] = await Promise.all([
                        fetch("/api/life-streak", { cache: 'no-store' }),
                        fetch("/api/progress", { cache: 'no-store' }),
                      ]);
                      const [lsJson, pJson] = await Promise.all([lsRes.json().catch(()=>({})), pRes.json().catch(()=>({}))]);
                      if (lsRes.ok && lsJson?.lifeStreak) setLifeStreak(lsJson.lifeStreak);
                      if (pRes.ok && pJson?.progress) setProgress(pJson.progress);
                      toast.success("Streak revived 🔥");
                    } catch (e: any) {
                      toast.error(e?.message || "Revive failed");
                    } finally {
                      setReviving(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] sm:text-xs bg-blue-600 text-white disabled:opacity-60"
                >
                  💎 Revive
                </button>
              ) : null}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <div className="text-2xl font-extrabold text-orange-700 dark:text-orange-300">
                {lifeStreak?.current ?? 0}
              </div>
              <div className="text-xs text-orange-700/80 dark:text-orange-200/80">Longest: {lifeStreak?.longest ?? 0}</div>
            </div>
            <div className="mt-1 text-[11px] text-orange-800/80 dark:text-orange-200/70">
              Complete all tasks today to keep your flame alive.
            </div>
          </div>
        </div>
        <div className="w-full md:w-64 lg:w-72 relative">
          {/* Flare overlay on level-up or streak increase */}
          {(levelFlare || streakFlare) && (
            <div className="pointer-events-none absolute -inset-1 rounded-[20px]">
              <div className={`absolute inset-0 rounded-[24px] ${levelFlare ? 'bg-[conic-gradient(at_20%_-10%,#22d3ee,#6366f1,#a855f7,#22d3ee)]' : 'bg-[conic-gradient(at_80%_110%,#fb923c,#f59e0b,#ef4444,#fb923c)]'} opacity-40 animate-ping`} />
            </div>
          )}
          <AvatarCanvas
            appearanceStage={a.appearance_stage}
            imageUrl={avatarPayload.imageUrl || undefined}
            equipment={avatarPayload.equipment}
            equippedMeta={avatarPayload.equippedMeta}
            spotlighted={(spotlightItems || [])
              .filter((c: any) => spotlightMap[c.id] && c?.is_goal_collectible && c?.is_user_created)
              .map((c: any) => ({ icon: c.icon, name: c.name, rarity: c.rarity }))}
          />
        </div>
      </div>
    </section>
  );
}

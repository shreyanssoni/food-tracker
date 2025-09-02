"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Swords,
  Trophy,
  History,
  Eye,
  Gauge,
  Ghost,
  CheckCircle2,
  Loader2,
  Timer,
  Crown,
  Settings,
} from "lucide-react";
import { createClient as createSupabaseClient } from "@/utils/supabase/client";
import ShadowFigure from "../../components/ShadowFigure";

type ChallengeItem = {
  id: string;
  state: string;
  created_at: string;
  due_time: string | null;
  linked_user_task_id: string | null;
  linked_shadow_task_id: string | null;
  task_template?: { title?: string; description?: string } | null;
};

export default function ShadowPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hero, setHero] = useState<{ userEP: number; shadowEP: number } | null>(
    null
  );
  const [active, setActive] = useState<ChallengeItem[]>([]);
  const [history, setHistory] = useState<ChallengeItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // Shadow race dashboard state
  const [stateLoading, setStateLoading] = useState<boolean>(true);
  const [shadowState, setShadowState] = useState<any>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = useState<boolean>(false);
  const [toast, setToast] = useState<{ title: string; body?: string } | null>(
    null
  );
  // UI controls
  const [showDev, setShowDev] = useState<boolean>(false);
  // Shadow character pops
  const [ghostPop, setGhostPop] = useState<boolean>(false);
  const [confettiBurst, setConfettiBurst] = useState<boolean>(false);
  // 7-day race history for compact panel
  const [raceHistory, setRaceHistory] = useState<any>(null);
  const shadowDoneCountRef = useRef<number>(0);
  // Setup state
  const [activated, setActivated] = useState<boolean>(false);
  const [showSetupModal, setShowSetupModal] = useState<boolean>(false);
  const [confirmHardWarning, setConfirmHardWarning] = useState<boolean>(false);
  const [prefs, setPrefs] = useState<{
    difficulty: "easy" | "medium" | "hard";
    wake_time?: string;
    sleep_time?: string;
    focus_areas?: string;
  }>({ difficulty: "medium", wake_time: "", sleep_time: "", focus_areas: "" });
  const [activating, setActivating] = useState<boolean>(false);
  // Shadow daily challenge UI
  const [todayShadow, setTodayShadow] = useState<{
    id: string;
    challenge_text: string;
    deadline: string;
    status: "pending" | "won" | "lost";
    ep_awarded?: number | null;
  } | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const supabase = createSupabaseClient();

  // Animated delta chip (counts up/down on change)
  const deltaNow: number | null =
    typeof shadowState?.metrics?.progress_delta_now === "number"
      ? shadowState.metrics.progress_delta_now
      : null;
  const [deltaAnim, setDeltaAnim] = useState<number | null>(null);
  const deltaPrevRef = useRef<number | null>(null);
  const deltaRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (deltaNow == null) {
      setDeltaAnim(null);
      deltaPrevRef.current = null;
      return;
    }
    const start =
      deltaPrevRef.current == null ? deltaNow : deltaPrevRef.current;
    const end = deltaNow;
    const diff = end - start;
    const dur = 600; // ms
    const t0 = performance.now();
    if (deltaRafRef.current) cancelAnimationFrame(deltaRafRef.current as any);
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const val = start + diff * p;
      setDeltaAnim(Math.round(val));
      if (p < 1) {
        deltaRafRef.current = requestAnimationFrame(tick);
      } else {
        deltaPrevRef.current = end;
        deltaRafRef.current = null;
      }
    };
    deltaRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (deltaRafRef.current) cancelAnimationFrame(deltaRafRef.current as any);
    };
  }, [deltaNow]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        // Setup status first — keep modal open by default until confirmed activated
        try {
          const setupRes = await fetch("/api/shadow/setup", {
            cache: "no-store",
          });
          if (setupRes.ok) {
            const setup = await setupRes.json();
            if (!cancelled) {
              setActivated(!!setup.activated);
              setShowSetupModal(!setup.activated);
              setHero({
                userEP: setup.user_ep || 0,
                shadowEP: setup.shadow_ep || 0,
              });
            }
          } else {
            // Keep modal open on setup failure
            if (!cancelled) setShowSetupModal(true);
          }
        } catch {
          if (!cancelled) setShowSetupModal(true);
        }

        // Load classic challenges lists (do not override EP from setup)
        const [actRes, histRes] = await Promise.all([
          fetch("/api/shadow/challenges?view=active", { cache: "no-store" }),
          fetch("/api/shadow/challenges?view=history", { cache: "no-store" }),
        ]);
        if (!actRes.ok) throw new Error("active failed");
        if (!histRes.ok) throw new Error("history failed");
        const act = await actRes.json();
        const hist = await histRes.json();
        if (!cancelled) {
          setActive(act.challenges || []);
          setHistory(hist.challenges || []);
        }

        // Load today's shadow daily challenge
        try {
          const tRes = await fetch("/api/shadow/challenges/today", {
            cache: "no-store",
          });
          if (tRes.ok) {
            const t = await tRes.json();
            if (!cancelled) setTodayShadow(t.challenge || null);
          }
        } catch {}
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Taunt feed: poll latest taunt and surface as toast
  useEffect(() => {
    let stop = false;
    let lastId: string | null = null;
    let timer: any;
    const loadTaunt = async () => {
      try {
        const r = await fetch("/api/shadow/taunts?limit=1", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const item = (j?.items || [])[0];
        if (item && item.id && item.id !== lastId) {
          lastId = item.id;
          if (!stop) {
            setToast({ title: "Shadow taunt", body: String(item.message || "") });
            setTimeout(() => setToast(null), 3000);
          }
        }
      } catch {}
    };
    loadTaunt();
    timer = setInterval(loadTaunt, 20000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  // Poll shadow state for live pacing
  useEffect(() => {
    let stop = false;
    let timer: any;
    const load = async () => {
      try {
        if (stop) return;
        setStateLoading(true);
        const res = await fetch("/api/shadow/state/today", {
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        if (!stop) {
          setShadowState(j || null);
          if (!initialLoaded) setInitialLoaded(true);
        }
      } catch (e) {
        if (!stop) console.error(e);
      } finally {
        if (!stop) setStateLoading(false);
      }
    };
    load();
    // poll every 60s to reduce churn; realtime hooks still push fast updates
    timer = setInterval(load, 60000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  // Realtime: subscribe to task completions and shadow commits to refresh state
  useEffect(() => {
    const ch = supabase.channel("rt-shadow");
    const debounced = () => {
      if ((debounced as any)._t) clearTimeout((debounced as any)._t);
      (debounced as any)._t = setTimeout(() => {
        fetch("/api/shadow/state/today", { cache: "no-store" })
          .then((r) => r.json())
          .then((j) => setShadowState(j || null))
          .catch(() => {});
      }, 250);
    };
    const tables = ["task_completions", "shadow_progress_commits", "shadow_passes"];
    for (const tbl of tables) {
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: tbl },
        debounced
      );
    }
    ch.subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [supabase]);

  // Compact 7-day race history
  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const r = await fetch('/api/shadow/history?days=7', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (!stopped) setRaceHistory(j || null);
      } catch {}
    })();
    return () => { stopped = true; };
  }, []);

  // Per-item row with ghost glide-in on shadow completion
  const TaskRow = ({
    t,
    completingId,
    onComplete,
  }: {
    t: any;
    completingId: string | null;
    onComplete: (id: string) => void;
  }) => {
    const [entering, setEntering] = useState(false);
    const [shimmer, setShimmer] = useState(false);
    const wasShadowDone = useRef<boolean>(!!t.is_shadow_done);
    useEffect(() => {
      if (t.is_shadow_done && !wasShadowDone.current) {
        // Trigger slide-in animation from left for the ghost
        setEntering(true);
        setShimmer(true);
        const id = setTimeout(() => setEntering(false), 16); // next frame
        const sid = setTimeout(() => setShimmer(false), 600);
        wasShadowDone.current = true;
        return () => { clearTimeout(id); clearTimeout(sid); };
      }
    }, [t.is_shadow_done]);
    return (
      <li className={`py-2 flex items-center justify-between gap-3 transition-colors ${shimmer ? 'bg-purple-500/10' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          {t.is_user_done ? (
            <CheckCircle2 className="w-4 h-4 text-blue-600 transition-transform duration-300" />
          ) : t.is_shadow_done ? (
            <span
              className={`inline-flex items-center justify-center w-4 h-4 transition-all duration-500 ${entering ? "-translate-x-2 opacity-0" : "translate-x-0 opacity-100"}`}
            >
              <ShadowFigure size={16} pose="run" />
            </span>
          ) : (
            <span className="w-4 h-4 inline-block rounded-full border border-gray-300 dark:border-gray-700" />
          )}
          <div className="truncate">
            <div className="text-sm font-medium truncate">
              {t.title || "Task"}
            </div>
            <div className="text-xs text-gray-500">
              {(() => {
                if (t.is_user_done) return "You completed";
                if (typeof t.shadow_eta_minutes === "number") {
                  if (t.shadow_eta_minutes > 0)
                    return `ETA ${t.shadow_eta_minutes}m`;
                  // Only show "Shadow passed" when exactly due-or-past and API marks passed
                  if (t.shadow_eta_minutes === 0 && t.is_shadow_done)
                    return "Shadow passed";
                  return "ETA 0m";
                }
                return "—";
              })()}
            </div>
          </div>
        </div>
        {!t.is_user_done && (
          <button
            className="shrink-0 px-2.5 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 transition-colors"
            disabled={!!completingId}
            onClick={() => onComplete(t.id)}
          >
            {completingId === t.id ? "Saving…" : "Complete"}
          </button>
        )}
      </li>
    );
  };

  // Countdown timer for today's shadow challenge
  useEffect(() => {
    if (!todayShadow?.deadline) return;
    const tick = () => {
      const ms = new Date(todayShadow.deadline).getTime() - Date.now();
      setTimeLeft(ms);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [todayShadow?.deadline]);

  function fmt(ms: number) {
    if (ms <= 0) return "Expired";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(ss)}`;
  }

  const epAtStake = Math.max(1, todayShadow?.ep_awarded ?? 10);

  // Prefer today's EP from shadow state if available
  const todayUserEP = shadowState?.ep_today?.user ?? hero?.userEP ?? 0;
  const todayShadowEP = shadowState?.ep_today?.shadow ?? hero?.shadowEP ?? 0;
  const total = Math.max(1, todayUserEP + todayShadowEP);
  const userPct = Math.min(
    100,
    Math.max(0, Math.round((todayUserEP / total) * 100))
  );
  const shadowPct = 100 - userPct;

  const groupedFlow = useMemo(() => {
    const rf = shadowState?.routineFlow || [];
    const tasksById: Record<string, any> = Object.fromEntries(
      (shadowState?.tasks || []).map((t: any) => [t.id, t])
    );

    // Determine current local time anchor
    const hour = new Date().getHours();
    const toAnchor = (h: number) => {
      if (h >= 5 && h < 11) return "MORNING";
      if (h >= 11 && h < 15) return "MIDDAY";
      if (h >= 15 && h < 20) return "EVENING";
      if (h >= 20 || h < 5) return "NIGHT";
      return "ANYTIME";
    };
    const currentAnchor = toAnchor(hour);
    const order = ["MORNING", "MIDDAY", "EVENING", "NIGHT", "ANYTIME"];
    const idx = (a: string) => {
      const i = order.indexOf((a || "").toUpperCase());
      return i === -1 ? order.length - 1 : i;
    };

    // Build groups, exclude past anchors and completed tasks
    const groups = rf
      .map((g: any) => ({
        anchor: g.anchor,
        items: (g.items || [])
          .map(
            (i: any) =>
              tasksById[i.id] || {
                id: i.id,
                title: i.title,
                time_anchor: g.anchor,
              }
          )
          .filter((t: any) => !t.is_user_done),
      }))
      .filter((g: any) => idx(g.anchor) >= idx(currentAnchor));

    // Also drop empty groups to avoid showing empty headers
    return groups.filter((g: any) => (g.items || []).length > 0);
  }, [shadowState]);

  const completeTask = async (taskId: string) => {
    try {
      setCompletingId(taskId);
      const hadShadowPassed = (() => {
        try {
          const t = (shadowState?.tasks || []).find((x: any) => x.id === taskId);
          return !!t?.is_shadow_done && !t?.is_user_done;
        } catch { return false; }
      })();
      const res = await fetch(`/api/tasks/${taskId}/complete`, {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to complete");
      // Optimistic update: mark as done
      const epAwarded =
        typeof j?.completion?.ep_awarded === "number"
          ? j.completion.ep_awarded
          : 0;
      setShadowState((prev: any) => {
        if (!prev) return prev;
        const tasks = (prev.tasks || []).map((t: any) =>
          t.id === taskId
            ? {
                ...t,
                is_user_done: true,
                user_completed_at: new Date().toISOString(),
              }
            : t
        );
        // Optimistically bump EP and delta so UI reflects progress instantly
        const ep_today = {
          ...(prev.ep_today || {}),
          user: (prev.ep_today?.user ?? 0) + epAwarded,
          shadow: prev.ep_today?.shadow ?? 0,
          shadow_total:
            prev.ep_today?.shadow_total ?? (prev.tasks?.length || 0),
        };
        const metrics = {
          ...(prev.metrics || {}),
          progress_delta_now:
            typeof prev.metrics?.progress_delta_now === "number"
              ? prev.metrics.progress_delta_now + 1
              : 1,
          progress_delta_projected:
            typeof prev.metrics?.progress_delta_projected === "number"
              ? prev.metrics.progress_delta_projected + 1
              : 1,
        };
        return { ...prev, tasks, ep_today, metrics };
      });
      // Lightweight toast
      try {
        const ep = j?.completion?.ep_awarded;
        const catchUp = hadShadowPassed;
        setToast({
          title: catchUp ? "Caught up!" : "Completed",
          body: catchUp ? "You matched the Shadow" : (typeof ep === "number" ? `+${ep} EP` : undefined),
        });
        if (catchUp) {
          setGhostPop(true);
          setConfettiBurst(true);
          setTimeout(() => { setGhostPop(false); setConfettiBurst(false); }, 1200);
        }
        setTimeout(() => setToast(null), 2200);
      } catch {}
      // Inform race engine to recompute pacing nudges (best-effort)
      try {
        await fetch("/api/shadow/progress/run-today", { method: "POST" });
      } catch {}
      // Hard refresh state so EP and pacing update immediately
      try {
        const sRes = await fetch("/api/shadow/state/today", {
          cache: "no-store",
        });
        if (sRes.ok) {
          const s = await sRes.json();
          setShadowState(s || null);
          if (s?.ep_today) {
            setHero((prev) => ({
              userEP: s.ep_today.user ?? (prev?.userEP || 0),
              shadowEP: s.ep_today.shadow ?? (prev?.shadowEP || 0),
            }));
          }
        }
      } catch {}
    } catch (e) {
      console.error(e);
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-semibold flex items-center gap-2 mb-4">
        <Swords className="w-5 h-5 text-purple-600" /> Shadow
      </h1>

      {/* Hero */}
      <section className="rounded-2xl border border-purple-200 dark:border-purple-900/40 bg-gray-900 md:bg-gradient-to-br md:from-gray-900 md:to-gray-950 p-3 pr-16 md:p-4 md:pr-28 mb-4 relative overflow-hidden">
        {/* Compact mobile header */}
        <div className="mb-2 md:hidden">
          <div className="flex items-end justify-between text-gray-200">
            <div>
              <div className="text-[11px] text-gray-400">You</div>
              <div className="text-lg font-semibold text-blue-300">{todayUserEP}</div>
            </div>
            <div className="text-[11px] text-gray-500">vs</div>
            <div className="text-right">
              <div className="text-[11px] text-gray-400">Shadow</div>
              <div className="text-lg font-semibold text-purple-300">{todayShadowEP}</div>
            </div>
          </div>
        </div>
        {/* Detailed header for md+ */}
        <div className="hidden md:flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-300 border border-blue-600/30">
              Your EP (today)
            </span>
            <span className="text-blue-300 font-medium">{todayUserEP}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-600/20 text-purple-300 border border-purple-600/30">
              Shadow EP (today)
            </span>
            <span className="text-purple-300 font-medium">{todayShadowEP}</span>
            {/* <button
              className="ml-2 inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-700/60 hover:bg-gray-800 text-gray-300"
              title={showDev ? "Hide developer tools" : "Show developer tools"}
              onClick={() => setShowDev((v) => !v)}
            >
              <Settings className="w-4 h-4" />
            </button> */}
          </div>
        </div>
        <div className="h-3 w-full bg-gray-800 rounded-full overflow-hidden border border-gray-700 relative">
          <div className="h-full bg-blue-600" style={{ width: `${userPct}%` }} />
          {/* Leader indicator */}
          {todayUserEP !== todayShadowEP && (
            <div className="hidden md:flex absolute -top-4 right-2 items-center gap-1 text-xs">
              {todayUserEP > todayShadowEP ? (
                <span className="inline-flex items-center gap-1 text-blue-300">
                  <Crown className="w-3.5 h-3.5" /> You lead
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-purple-300">
                  <ShadowFigure size={14} pose="run" /> Shadow leads
                </span>
              )}
            </div>
          )}
        </div>
        <div className="mt-1 text-[10px] text-gray-500">You {userPct}% • Shadow {shadowPct}%</div>
        {/* Floating shadow avatar pop */}
        <div
          className={`pointer-events-none absolute -top-2 right-3 transition-all duration-500 hidden md:block ${
            ghostPop ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
          }`}
        >
          <div className="inline-flex items-center gap-1 text-purple-300/90 bg-purple-900/30 border border-purple-800/50 rounded-full px-2 py-1 text-xs">
            <ShadowFigure size={14} pose="taunt" />
            <span>boo</span>
          </div>
        </div>

        {/* Compact decorative Shadow on mobile */}
        <div className="pointer-events-none absolute bottom-1 right-2 opacity-60 md:hidden">
          <ShadowFigure
            size={56}
            pose={todayUserEP < todayShadowEP ? "run" : "idle"}
            className="drop-shadow-[0_2px_8px_rgba(124,58,237,0.18)]"
          />
        </div>

        {/* Large decorative Shadow on the right (hidden on small screens) */}
        <div className="pointer-events-none absolute bottom-0 right-2 opacity-70 hidden md:block">
          <ShadowFigure
            size={96}
            pose={todayUserEP < todayShadowEP ? "run" : "idle"}
            className="drop-shadow-[0_4px_12px_rgba(124,58,237,0.25)]"
          />
        </div>
      </section>

      {/* Developer Tools: trigger backend phases (hidden behind settings) */}
      {/* {showDev && (
      <section className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
            <History className="w-4 h-4" /> Developer Tools
          </div>
          <div className="text-[11px] text-amber-700/80 dark:text-amber-300/80">6A/6B/7/9 triggers</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            className="px-2.5 py-1 rounded-md border border-amber-300 dark:border-amber-800 bg-white dark:bg-transparent hover:bg-amber-100"
            onClick={async () => {
              try {
                const r = await fetch('/api/shadow/pace/adjust', { method: 'POST' });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(j.error || 'adjust failed');
                setToast({ title: 'Adjusted pace', body: `Target ${j.shadow_speed_target ?? ''}` });
              } catch (e) { console.error(e); setToast({ title: 'Adjust failed' }); }
              finally {
                setTimeout(() => setToast(null), 2000);
                try { const s = await fetch('/api/shadow/state/today', { cache: 'no-store' }); if (s.ok) setShadowState(await s.json()); } catch {}
              }
            }}
          >6A: Adjust pace</button>

          <button
            className="px-2.5 py-1 rounded-md border border-amber-300 dark:border-amber-800 bg-white dark:bg-transparent hover:bg-amber-100"
            onClick={async () => {
              try {
                const r = await fetch('/api/shadow/pace/smooth/nightly', { method: 'POST' });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(j.error || 'smooth failed');
                setToast({ title: 'Smoothed pace', body: `Target ${j.smoothed_target ?? ''}` });
              } catch (e) { console.error(e); setToast({ title: 'Smooth failed' }); }
              finally {
                setTimeout(() => setToast(null), 2000);
                try { const s = await fetch('/api/shadow/state/today', { cache: 'no-store' }); if (s.ok) setShadowState(await s.json()); } catch {}
              }
            }}
          >6B: Nightly smooth</button>

          <button
            className="px-2.5 py-1 rounded-md border border-amber-300 dark:border-amber-800 bg-white dark:bg-transparent hover:bg-amber-100"
            onClick={async () => {
              try {
                const r = await fetch('/api/shadow/weekly/summary/generate', { method: 'POST' });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(j.error || 'weekly failed');
                setToast({ title: 'Weekly summary', body: `${j?.summary?.week_start ?? ''}` });
              } catch (e) { console.error(e); setToast({ title: 'Weekly failed' }); }
              finally { setTimeout(() => setToast(null), 2000); }
            }}
          >7: Weekly summarize</button>

          <button
            className="px-2.5 py-1 rounded-md border border-amber-300 dark:border-amber-800 bg-white dark:bg-transparent hover:bg-amber-100"
            onClick={async () => {
              try {
                const r = await fetch('/api/shadow/history?days=30', { method: 'GET', cache: 'no-store' });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(j.error || 'history failed');
                console.log('shadow history (30d)', j);
                setToast({ title: 'History loaded', body: `${(j?.daily?.length ?? 0)} days` });
              } catch (e) { console.error(e); setToast({ title: 'History failed' }); }
              finally { setTimeout(() => setToast(null), 2000); }
            }}
          >9: Fetch history</button>
        </div>
      </section>
      )} */}

      {/* Race Dashboard (dark panel) */}
      <section className="rounded-2xl border border-purple-900/30 bg-slate-900 md:bg-gradient-to-br md:from-slate-900 md:to-black p-3 md:p-4 mb-4 shadow-[0_8px_32px_rgba(124,58,237,0.15)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] md:text-[13px] font-semibold text-gray-200">
            {(() => {
              const leadVal = typeof shadowState?.lead === 'number' ? shadowState.lead : (todayUserEP - todayShadowEP);
              const ahead = leadVal > 0; const tight = Math.abs(leadVal) < 0.5;
              const chip = tight ? 'bg-slate-700/60 border-slate-600' : ahead ? 'bg-blue-600/20 border-blue-500/40' : 'bg-purple-600/20 border-purple-500/40';
              const icon = tight ? 'text-slate-300' : ahead ? 'text-blue-300' : 'text-purple-300';
              return (
                <span className={`inline-flex items-center justify-center w-4.5 h-4.5 rounded-full border ${chip}`}>
                  <Gauge className={`w-3 h-3 ${icon}`} />
                </span>
              );
            })()}
            Live Pace
          </div>
          <div className="text-[10px] md:text-[11px] text-gray-500">
            {stateLoading ? "Refreshing…" : "Live"}
          </div>
        </div>

        {/* Narrative KPIs */}
        <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-2.5 text-[12px] md:text-[13px]">
          {/* Lead Status */}
          <div className={(() => {
            const leadVal = typeof shadowState?.lead === 'number' ? shadowState.lead : (todayUserEP - todayShadowEP);
            const ahead = leadVal > 0;
            const tight = Math.abs(leadVal) < 0.5;
            const accent = tight ? 'border-slate-700' : ahead ? 'border-blue-500/30 ring-1 ring-blue-500/10' : 'border-purple-500/30 ring-1 ring-purple-500/10';
            return `rounded-xl p-2.5 md:p-3 bg-gradient-to-br from-slate-800/60 to-slate-900/60 border ${accent} backdrop-blur-sm transition-colors`;
          })()}>
            <div className="flex items-center justify-between">
              <div className="text-[10px] md:text-[11px] text-gray-400 inline-flex items-center gap-1">
                <span>🏁</span> Lead
              </div>
              {(() => {
                const leadVal = typeof shadowState?.lead === 'number' ? shadowState.lead : (todayUserEP - todayShadowEP);
                const tight = Math.abs(leadVal) < 0.5;
                const ahead = leadVal > 0;
                const label = tight ? 'Tight' : ahead ? 'You' : 'Shadow';
                const pill = tight ? 'bg-slate-700/60 text-slate-200' : ahead ? 'bg-blue-600/20 text-blue-200 border border-blue-400/30' : 'bg-purple-600/20 text-purple-200 border border-purple-400/30';
                const pulse = tight ? '' : 'animate-pulse';
                return <span className={`px-1.5 py-0.5 rounded-full text-[9px] md:text-[10px] ${pill} ${pulse}`}>{label}</span>;
              })()}
            </div>
            <div className="mt-0.5 text-[12px] md:text-[14px] font-medium text-gray-100 leading-snug">
              {(() => {
                const leadVal = typeof shadowState?.lead === 'number' ? shadowState.lead : (todayUserEP - todayShadowEP);
                const tight = Math.abs(leadVal) < 0.5;
                if (tight) return 'Neck and neck with Shadow';
                return leadVal > 0 ? 'You\'ve pulled ahead!' : 'Shadow is 1 step ahead';
              })()}
            </div>
            {/* Inline mini tug-of-war bar for quick glance */}
            <div className="mt-1.5 h-1 w-full bg-slate-800/80 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${userPct}%` }} />
              <div className="-mt-1 h-1 bg-purple-600/80 transition-all duration-500 float-right" style={{ width: `${shadowPct}%` }} />
            </div>
          </div>

          {/* Projection */}
          <div className="rounded-xl p-2 md:p-2.5 bg-gradient-to-br from-slate-800/60 to-slate-900/60 border border-gray-900/50 backdrop-blur-sm">
            <div className="text-[10px] md:text-[11px] text-gray-400 inline-flex items-center gap-1">
              <span>📅</span> Today's projection
            </div>
            <div className="mt-0.5 text-[12px] md:text-[14px] font-medium space-y-0.5 text-gray-100 leading-snug">
              {(() => {
                const tasks = (shadowState?.tasks || []) as any[];
                const userDone = tasks.filter((t: any) => t.is_user_done).length;
                const shadowDone = tasks.filter((t: any) => t.is_shadow_done).length;
                const us = typeof shadowState?.metrics?.user_speed_now === 'number' ? shadowState.metrics.user_speed_now : 0;
                const ss = typeof shadowState?.metrics?.shadow_speed_now === 'number' ? shadowState.metrics.shadow_speed_now : 0;
                const end = new Date(); end.setHours(23,59,59,999);
                const remainingH = Math.max(0, (end.getTime() - Date.now()) / 3600000);
                const projUser = Math.max(userDone, Math.round(userDone + us * remainingH));
                const projShadow = Math.max(shadowDone, Math.round(shadowDone + ss * remainingH));
                return (
                  <>
                    <div>At this pace: {projUser} tasks done today</div>
                    <div className="text-[11px] md:text-[12px] text-gray-400">Shadow predicts: {projShadow} tasks by end of day</div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Time Saved (hide when 0) */}
          {(() => {
            const ts = typeof shadowState?.metrics?.time_saved_minutes === 'number' ? shadowState.metrics.time_saved_minutes : 0;
            if (!ts || ts <= 0) return null;
            return (
              <div className="rounded-xl p-2 md:p-2.5 bg-gradient-to-br from-slate-800/60 to-slate-900/60 border border-emerald-500/30 ring-1 ring-emerald-500/10 backdrop-blur-sm">
                <div className="text-[10px] md:text-[11px] text-gray-300 inline-flex items-center gap-1">
                  <span>⏳</span> Time saved
                </div>
                <div className="mt-0.5 text-[12px] md:text-[14px] font-medium text-emerald-200">
                  {`You\'ve saved ${Math.round(ts)}m so far`}
                </div>
              </div>
            );
          })()}

          {/* Pace Consistency */}
          <div className="rounded-xl p-2 md:p-2.5 bg-gradient-to-br from-slate-800/60 to-slate-900/60 border border-gray-900/50 backdrop-blur-sm">
            <div className="text-[10px] md:text-[11px] text-gray-400 inline-flex items-center gap-1">
              <span>📊</span> Consistency
            </div>
            <div className="mt-0.5 text-[12px] md:text-[14px] font-medium text-gray-100 flex items-center gap-2">
              {(() => {
                const pc = typeof shadowState?.metrics?.pace_consistency === 'number' ? shadowState.metrics.pace_consistency : null;
                const tasks = (shadowState?.tasks || []) as any[];
                const anyStarted = tasks.some((t: any) => t.is_user_done || t.is_shadow_done);
                if (!pc || !anyStarted) return 'Not started yet';
                if (pc >= 0.8) return <><span className="text-amber-300">🔥</span> Steady pace <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/20">On a streak</span></>;
                if (pc >= 0.5) return <>Strong start</>;
                return <>Wobbly pace</>;
              })()}
            </div>
          </div>

          {/* Speed comparison */}
          <div className={(() => {
            const us = typeof shadowState?.metrics?.user_speed_now === 'number' ? shadowState.metrics.user_speed_now : 0;
            const ss = typeof shadowState?.metrics?.shadow_speed_now === 'number' ? shadowState.metrics.shadow_speed_now : 0;
            const ratio = ss > 0 ? us / ss : 1;
            const ahead = (us > ss);
            const state = (us === 0 && ss === 0) ? 'idle' : (ahead ? 'ahead' : (us === 0 ? 'shadow-moving' : (ss === 0 ? 'you-moving' : 'even')));
            const accent = state === 'ahead' ? 'border-emerald-500/30 ring-1 ring-emerald-500/10' : state === 'idle' ? 'border-slate-700' : 'border-amber-500/30 ring-1 ring-amber-500/10';
            return `rounded-xl p-2 md:p-2.5 bg-gradient-to-br from-slate-800/60 to-slate-900/60 border ${accent} backdrop-blur-sm md:col-span-2`;
          })()}>
            <div className="flex items-center justify-between">
              <div className="text-[10px] md:text-[11px] text-gray-400 inline-flex items-center gap-1">
                <span>⚡</span> Pace
              </div>
              {(() => {
                const us = typeof shadowState?.metrics?.user_speed_now === 'number' ? shadowState.metrics.user_speed_now : 0;
                const ss = typeof shadowState?.metrics?.shadow_speed_now === 'number' ? shadowState.metrics.shadow_speed_now : 0;
                const ratio = ss > 0 ? us / ss : 1;
                let badge = 'Keeping pace';
                let cls = 'bg-slate-700/60 text-slate-200';
                if (ratio >= 1.8) { badge = 'Blazing'; cls = 'bg-emerald-600/20 text-emerald-200 border border-emerald-400/30'; }
                else if (ratio <= 0.55) { badge = 'Falling behind'; cls = 'bg-amber-600/20 text-amber-200 border border-amber-400/30'; }
                const pulse = (badge === 'Blazing' || badge === 'Falling behind') ? 'animate-pulse' : '';
                return <span className={`px-1.5 py-0.5 rounded-full text-[9px] md:text-[10px] ${cls} ${pulse}`}>{badge}</span>;
              })()}
            </div>
            <div className="mt-0.5 text-[12px] md:text-[14px] font-medium text-gray-100">
              {(() => {
                const us = typeof shadowState?.metrics?.user_speed_now === 'number' ? shadowState.metrics.user_speed_now : 0;
                const ss = typeof shadowState?.metrics?.shadow_speed_now === 'number' ? shadowState.metrics.shadow_speed_now : 0;
                if (us === 0 && ss === 0) return 'Shadow waits while you idle';
                if (us === 0 && ss > 0) return 'Shadow is moving while you idle';
                if (ss === 0 && us > 0) return 'Shadow waits while you move';
                const ratio = ss > 0 ? us / ss : 1;
                if (ratio >= 1.8) return 'You\'re moving twice as fast';
                if (ratio <= 0.55) return 'Shadow is moving twice as fast';
                return 'You\'re keeping pace';
              })()}
            </div>
            {(() => {
              const us = typeof shadowState?.metrics?.user_speed_now === 'number' ? shadowState.metrics.user_speed_now : 0;
              const ss = typeof shadowState?.metrics?.shadow_speed_now === 'number' ? shadowState.metrics.shadow_speed_now : 0;
              const ratio = ss > 0 ? us / ss : 1;
              if (ratio <= 0.55 || (us === 0 && ss > 0)) {
                return <div className="mt-1 text-[11px] text-amber-300/90">Tip: try a 5‑min sprint to catch up ⚡</div>;
              }
              return null;
            })()}
            {/* Tiny avatars for sides */}
            <div className="mt-1.5 flex items-center gap-3 text-[10px] md:text-[11px] text-gray-400">
              <div className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-blue-500" /> You</div>
              <div className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-purple-500" /> Shadow</div>
            </div>
          </div>
        </div>

        {/* Tug-of-war Lead Meter */}
        {/* <div className="mt-3 md:mt-4">
          <div className="text-[11px] md:text-xs text-gray-500 mb-1">Lead meter</div>
          <div className="h-2.5 md:h-3 w-full bg-gray-800 rounded-full overflow-hidden relative border border-gray-700">
            <div
              className="absolute left-0 top-0 h-full bg-blue-600 transition-all duration-500 ease-out shadow-[0_0_12px_rgba(59,130,246,0.35)]"
              style={{ width: `${userPct}%` }}
            />
            <div
              className="absolute right-0 top-0 h-full bg-purple-600/90 transition-all duration-500 ease-out shadow-[0_0_12px_rgba(147,51,234,0.35)]"
              style={{ width: `${shadowPct}%` }}
            />
          </div>
        </div> */}
      </section>

      {/* Challenges (highlighted) */}
      <section className="rounded-2xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-950/30 p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <Trophy className="w-4 h-4 text-indigo-600" /> Challenges
          </div>
          <div className="text-xs text-indigo-700/80 dark:text-indigo-300/80">{active.length || 0} active</div>
        </div>
        {active.length === 0 ? (
          <div className="text-sm text-indigo-800/80 dark:text-indigo-200/80">No active challenges. New mini-races will appear here.</div>
        ) : (
          <ul className="mt-2 divide-y divide-indigo-200/50 dark:divide-indigo-900/50">
            {active.slice(0, 3).map((c) => (
              <li key={c.id} className="py-2 flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.task_template?.title || "Mini-race"}</div>
                  <div className="text-xs text-indigo-700/80 dark:text-indigo-300/80">Due {c.due_time ? new Date(c.due_time).toLocaleString() : "soon"}</div>
                </div>
                <span className="text-[11px] uppercase text-indigo-700/80 dark:text-indigo-300/80">{c.state}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Task Timeline (lighter panel) */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 mb-4">
        <div className="flex items-center gap-2 font-semibold mb-2">
          <Timer className="w-4 h-4" /> Today
        </div>
        {!initialLoaded && stateLoading && (
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        )}
        {!stateLoading && (!groupedFlow || groupedFlow.length === 0) && (
          <div className="text-sm text-gray-500">No tasks for today.</div>
        )}
        <div className="space-y-3">
          {groupedFlow.map((g: any) => (
            <div key={g.anchor}>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                {g.anchor}
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-900">
                {g.items.map((t: any) => (
                  <TaskRow
                    key={t.id}
                    t={t}
                    completingId={completingId}
                    onComplete={completeTask}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Compact History (7 days) */}
      {raceHistory?.daily && Array.isArray(raceHistory.daily) && raceHistory.daily.length > 0 && (
        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 font-semibold">
              <History className="w-4 h-4" /> History (7d)
            </div>
            <div className="text-xs text-gray-500">Lead by day</div>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-900">
            {raceHistory.daily.slice(-7).map((d: any) => {
              const lead = Number(d.lead ?? 0);
              const userD = Number(d.user_distance ?? 0);
              const shadowD = Number(d.shadow_distance ?? 0);
              const total = Math.max(1, userD + shadowD);
              const userW = Math.round((userD / total) * 100);
              const shadowW = 100 - userW;
              return (
                <li key={d.date} className="py-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="text-gray-500">{d.date}</div>
                    <div className={`inline-flex items-center px-2 py-0.5 rounded-md border ${lead >= 0 ? 'bg-blue-500/10 text-blue-600 border-blue-500/30' : 'bg-purple-500/10 text-purple-600 border-purple-500/30'}`}>
                      {lead >= 0 ? 'You' : 'Shadow'} {Math.abs(lead)}
                    </div>
                  </div>
                  <div className="h-2 w-full bg-gray-100 dark:bg-gray-900 rounded-full overflow-hidden relative">
                    <div className="absolute left-0 top-0 h-full bg-blue-500/80" style={{ width: `${userW}%` }} />
                    <div className="absolute right-0 top-0 h-full bg-purple-500/70" style={{ width: `${shadowW}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-gray-500">You {userD} • Shadow {shadowD}</div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* First-time Setup Modal */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-4">
            {!confirmHardWarning ? (
              <div className="space-y-3">
                <div className="text-lg font-semibold">
                  Shadow is not for the weak.
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  It’s scary, requires crazy discipline, and will push you. Are
                  you sure?
                </p>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700"
                    onClick={() => {
                      setShowSetupModal(false);
                      router.push("/");
                    }}
                  >
                    No, take me back
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm rounded-lg bg-purple-600 text-white"
                    onClick={() => setConfirmHardWarning(true)}
                  >
                    Yes, continue setup
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-lg font-semibold">Shadow Setup</div>
                <div className="grid grid-cols-1 gap-3">
                  <label className="text-sm">
                    <div className="mb-1">Difficulty</div>
                    <select
                      value={prefs.difficulty}
                      onChange={(e) =>
                        setPrefs((p) => ({
                          ...p,
                          difficulty: e.target.value as any,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <div className="mb-1">Wake time</div>
                    <input
                      type="time"
                      value={prefs.wake_time || ""}
                      onChange={(e) =>
                        setPrefs((p) => ({ ...p, wake_time: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="mb-1">Sleep time</div>
                    <input
                      type="time"
                      value={prefs.sleep_time || ""}
                      onChange={(e) =>
                        setPrefs((p) => ({ ...p, sleep_time: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="mb-1">Focus areas (comma separated)</div>
                    <input
                      type="text"
                      value={prefs.focus_areas || ""}
                      onChange={(e) =>
                        setPrefs((p) => ({ ...p, focus_areas: e.target.value }))
                      }
                      placeholder="sleep, water, diet, fitness"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700"
                    onClick={() => {
                      setShowSetupModal(false);
                      router.push("/");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm rounded-lg bg-purple-600 text-white disabled:opacity-50"
                    disabled={activating}
                    onClick={async () => {
                      try {
                        setActivating(true);
                        const res = await fetch("/api/shadow/setup", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          cache: "no-store",
                          credentials: "same-origin",
                          body: JSON.stringify({ preferences: prefs }),
                        });
                        const j = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(j?.error || "Failed to setup");
                        setActivated(true);
                        setShowSetupModal(false);
                        // Confirm and refresh hero EPs
                        try {
                          const setupRes = await fetch("/api/shadow/setup", { cache: "no-store" });
                          if (setupRes.ok) {
                            const setup = await setupRes.json();
                            setHero({
                              userEP: setup.user_ep || 0,
                              shadowEP: setup.shadow_ep || 0,
                            });
                          }
                        } catch {}
                        setToast({ title: "Shadow activated" });
                        setTimeout(() => setToast(null), 2000);
                      } catch (e: any) {
                        console.error(e);
                        setToast({ title: "Activation failed", body: e?.message || "" });
                        setTimeout(() => setToast(null), 2500);
                      } finally {
                        setActivating(false);
                      }
                    }}
                  >
                    {activating ? "Saving…" : "Save & Activate"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Today's Shadow Challenge */}
      {todayShadow && (
        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Today's Shadow Challenge</div>
            <div className="text-xs text-gray-500">
              Deadline: {new Date(todayShadow.deadline).toLocaleTimeString()}
            </div>
          </div>
          <div className="text-sm mb-2">{todayShadow.challenge_text}</div>
          <div className="flex items-center justify-between text-sm">
            <div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                EP at stake: +{epAtStake}
              </span>
            </div>
            <div className="font-mono text-gray-700 dark:text-gray-300">
              {fmt(timeLeft)}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end">
            <button
              className="px-3 py-1.5 text-sm rounded-lg bg-purple-600 text-white disabled:opacity-50"
              disabled={todayShadow.status !== "pending" || timeLeft <= 0}
              onClick={async () => {
                try {
                  const res = await fetch(
                    `/api/shadow/challenges/${todayShadow.id}/complete`,
                    { method: "POST" }
                  );
                  const j = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(j.error || "Failed to settle");
                  // refresh EP and today shadow challenge
                  try {
                    const setupRes = await fetch("/api/shadow/setup", {
                      cache: "no-store",
                    });
                    if (setupRes.ok) {
                      const setup = await setupRes.json();
                      setHero({
                        userEP: setup.user_ep || 0,
                        shadowEP: setup.shadow_ep || 0,
                      });
                    }
                  } catch {}
                  try {
                    const tRes = await fetch("/api/shadow/challenges/today", {
                      cache: "no-store",
                    });
                    if (tRes.ok) {
                      const t = await tRes.json();
                      setTodayShadow(t.challenge || null);
                    }
                  } catch {}
                } catch (e) {
                  console.error(e);
                }
              }}
            >
              Complete
            </button>
          </div>
        </section>
      )}

      {/* Active Challenges */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 mb-4">
        <div className="px-4 py-3 flex items-center gap-2 font-semibold">
          <Trophy className="w-4 h-4" /> Active Challenges
        </div>
        {loading ? (
          <div className="px-4 pb-4 text-sm text-gray-500">Loading…</div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-900">
            {active.map((c) => (
              <li
                key={c.id}
                className="px-4 py-3 text-sm flex items-center justify-between"
              >
                <div className="flex flex-col">
                  <div className="font-medium">
                    {c.task_template?.title || "Challenge"}
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">
                    {c.state}
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">
                    Due:{" "}
                    {c.due_time ? new Date(c.due_time).toLocaleString() : "—"}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(c.created_at).toLocaleString()}
                </div>
              </li>
            ))}
            {!active.length && (
              <li className="px-4 py-3 text-sm text-gray-500">
                No active challenges
              </li>
            )}
          </ul>
        )}
      </section>

      {/* History */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 mb-4">
        <div className="px-4 py-3 flex items-center gap-2 font-semibold">
          <History className="w-4 h-4" /> History
        </div>
        {loading ? (
          <div className="px-4 pb-4 text-sm text-gray-500">Loading…</div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-900">
            {history.map((c) => (
              <li
                key={c.id}
                className="px-4 py-3 text-sm flex items-center justify-between"
              >
                <div className="flex flex-col">
                  <div className="font-medium">
                    {c.task_template?.title || "Challenge"}
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">
                    {c.state}
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">
                    Ended:{" "}
                    {c.due_time ? new Date(c.due_time).toLocaleString() : "—"}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(c.created_at).toLocaleString()}
                </div>
              </li>
            ))}
            {!history.length && (
              <li className="px-4 py-3 text-sm text-gray-500">
                No past challenges
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Transparency (optional) */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="px-4 py-3 flex items-center gap-2 font-semibold">
          <Eye className="w-4 h-4" /> Transparency
        </div>
        <div className="px-4 pb-4 text-sm text-gray-500">
          Shadow-only tasks will be shown here in a future iteration.
        </div>
      </section>

      {err && <div className="mt-4 text-sm text-red-600">{err}</div>}
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 px-3 py-2 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm">
          <div className="font-medium">{toast.title}</div>
          {toast.body && (
            <div className="text-gray-600 dark:text-gray-400">{toast.body}</div>
          )}
        </div>
      )}
    </div>
  );
}

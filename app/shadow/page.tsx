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
} from "lucide-react";
import { createClient as createSupabaseClient } from "@/utils/supabase/client";
import ShadowFigure from "../../components/ShadowFigure";
import ChallengeActions from "./challenges/[id]/parts/ChallengeActions";

type ChallengeItem = {
  id: string;
  state: string;
  created_at: string;
  updated_at?: string | null;
  completed_at?: string | null;
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
  // Walkthrough state for Shadow story
  const [explainSlide, setExplainSlide] = useState<number>(0);
  const [initialLoaded, setInitialLoaded] = useState<boolean>(false);
  const [toast, setToast] = useState<{ title: string; body?: string } | null>(
    null
  );
  // UI controls
  const [showDev, setShowDev] = useState<boolean>(false);
  // Shadow character pops
  const [ghostPop, setGhostPop] = useState<boolean>(false);
  const [confettiBurst, setConfettiBurst] = useState<boolean>(false);
  const confettiRef = useRef<HTMLDivElement | null>(null);
  // Track day changes in local timezone to reset history view
  const [todayKey, setTodayKey] = useState<string>(() =>
    new Date().toLocaleDateString()
  );
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

  // Shadow explanation modal post-onboarding
  const [showShadowExplain, setShowShadowExplain] = useState<boolean>(false);

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

  // Tick local date key so memoed history re-evaluates across day boundaries
  useEffect(() => {
    const id = setInterval(() => {
      setTodayKey(new Date().toLocaleDateString());
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const filteredHistory = useMemo(() => {
    const todayStr = new Date().toLocaleDateString();
    return (history || []).filter((c: any) => {
      // Prefer completion or last update; fall back to due_time then created_at
      const raw = c.completed_at || c.updated_at || c.created_at || null;
      const d = raw ? new Date(raw) : null;
      return d ? d.toLocaleDateString() === todayStr : false;
    });
  }, [history, todayKey]);

  // Lightweight confetti when confettiBurst toggles on
  useEffect(() => {
    if (!confettiBurst) return;
    const container = confettiRef.current;
    if (!container) return;
    const pieces: HTMLElement[] = [];
    const colors = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444"];
    for (let i = 0; i < 28; i++) {
      const el = document.createElement("span");
      el.style.position = "absolute";
      el.style.left = "50%";
      el.style.top = "15%";
      el.style.width = "6px";
      el.style.height = "10px";
      el.style.background = colors[i % colors.length];
      el.style.borderRadius = "1px";
      el.style.transform = `translate(-50%, -50%) rotate(${Math.random() * 360}deg)`;
      container.appendChild(el);
      pieces.push(el);
      const angle = Math.random() * Math.PI * 2;
      const distance = 180 + Math.random() * 180;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance + 240; // fall
      el.animate(
        [
          {
            transform: `translate(-50%, -50%) translate(0px,0px) rotate(0deg)`,
            opacity: 1,
          },
          {
            transform: `translate(-50%, -50%) translate(${x}px,${y}px) rotate(${720 + Math.random() * 360}deg)`,
            opacity: 0,
          },
        ],
        {
          duration: 1100 + Math.random() * 600,
          easing: "cubic-bezier(.2,.8,.2,1)",
          fill: "forwards",
        }
      );
    }
    const t = setTimeout(() => {
      pieces.forEach((p) => p.remove());
    }, 2200);
    return () => {
      clearTimeout(t);
      pieces.forEach((p) => p.remove());
    };
  }, [confettiBurst]);

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

  // Pop shadow explanation if coming from tasks onboarding intro
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const pending = window.sessionStorage.getItem(
        "nourish:shadowExplainPending"
      );
      const already = window.sessionStorage.getItem(
        "nourish:onboardingComplete"
      );
      if (pending === "1" && !already) {
        // small delay to let page settle
        const id = setTimeout(() => setShowShadowExplain(true), 400);
        return () => clearTimeout(id);
      }
    } catch {}
  }, []);

  // Taunt feed: poll latest taunt and surface as toast
  useEffect(() => {
    let stop = false;
    let lastId: string | null = null;
    let timer: any;
    const loadTaunt = async () => {
      try {
        const r = await fetch("/api/shadow/taunts?limit=1", {
          cache: "no-store",
        });
        if (!r.ok) return;
        const j = await r.json();
        const item = (j?.items || [])[0];
        if (item && item.id && item.id !== lastId) {
          lastId = item.id;
          if (!stop) {
            setToast({
              title: "Shadow taunt",
              body: String(item.message || ""),
            });
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
    const tables = [
      "task_completions",
      "shadow_progress_commits",
      "shadow_passes",
    ];
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
        const r = await fetch("/api/shadow/history?days=7", {
          cache: "no-store",
        });
        if (!r.ok) return;
        const j = await r.json();
        if (!stopped) setRaceHistory(j || null);
      } catch {}
    })();
    return () => {
      stopped = true;
    };
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
        return () => {
          clearTimeout(id);
          clearTimeout(sid);
        };
      }
    }, [t.is_shadow_done]);
    // Winner glow: green if user first, purple if shadow first
    const userMin =
      typeof t.user_completed_minute === "number"
        ? t.user_completed_minute
        : null;
    const shadowMin =
      typeof t.shadow_scheduled_minute === "number"
        ? t.shadow_scheduled_minute
        : null;
    let winnerGlow = "";
    if (t.is_user_done || t.is_shadow_done) {
      let userFirst = false;
      if (t.is_user_done && !t.is_shadow_done) userFirst = true;
      else if (!t.is_user_done && t.is_shadow_done) userFirst = false;
      else if (
        t.is_user_done &&
        t.is_shadow_done &&
        userMin != null &&
        shadowMin != null
      )
        userFirst = userMin <= shadowMin;
      winnerGlow = userFirst
        ? "ring-1 ring-emerald-500/25 shadow-[0_0_10px_rgba(16,185,129,0.20)]"
        : "ring-1 ring-purple-500/25 shadow-[0_0_10px_rgba(168,85,247,0.20)]";
    }
    return (
      <li
        className={`px-3 py-2 flex items-center justify-between gap-3 rounded-xl border transition-all duration-200 shadow-sm
        ${
          t.is_user_done
            ? "bg-surface/70 border-blue-500/15"
            : "bg-surface2 border-transparent hover:border-purple-500/20 hover:bg-surface/80 hover:shadow"
        }
        ${winnerGlow}
        ${shimmer ? " bg-purple-500/10" : ""}`}
      >
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
            <div
              className={`text-sm font-medium truncate ${t.is_user_done ? "text-foreground/80" : ""}`}
            >
              {t.title || "Task"}
              {t.is_user_done && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-md bg-blue-600/15 text-blue-300 align-middle">
                  Completed
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              {(() => {
                const userLabel = t.user_time_label as string | undefined;
                const shadowLabel = t.shadow_time_label as string | undefined;
                const eta =
                  typeof t.shadow_eta_minutes === "number"
                    ? t.shadow_eta_minutes
                    : null;

                // Compose user part
                const youPart = userLabel ? `You ${userLabel}` : "You -";

                // Compose shadow part with ETA semantics
                let shadowPart: string;
                if (eta != null && eta > 0) {
                  // Shadow not yet done
                  shadowPart = `Shadow ETA ${shadowLabel || `${eta}m`}`;
                } else if (eta === 0 && !t.is_shadow_done) {
                  // edge: eta 0 but not passed yet
                  shadowPart = `Shadow ETA 0m`;
                } else if (t.is_shadow_done) {
                  shadowPart = `Shadow ${shadowLabel || "—"}`;
                } else if (shadowLabel) {
                  // scheduled later today but eta unknown
                  shadowPart = `Shadow ${shadowLabel}`;
                } else {
                  shadowPart = `Shadow —`;
                }

                return `${youPart} • ${shadowPart}`;
              })()}
            </div>
          </div>
        </div>
        {!t.is_user_done && (
          <button
            className={`shrink-0 px-3 py-1.5 text-xs rounded-lg text-white bg-gradient-to-r from-blue-600 to-purple-600 shadow hover:opacity-95 active:opacity-90 disabled:opacity-50 transition-all ${completingId === t.id ? "pointer-events-none" : ""}`}
            disabled={completingId === t.id}
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

    // Build groups including completed tasks and past anchors
    const groups = rf.map((g: any) => ({
      anchor: g.anchor,
      items: (g.items || []).map(
        (i: any) =>
          tasksById[i.id] || {
            id: i.id,
            title: i.title,
            time_anchor: g.anchor,
          }
      ),
    }));

    // Drop empty groups only
    return groups.filter((g: any) => (g.items || []).length > 0);
  }, [shadowState]);

  const completeTask = async (taskId: string) => {
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    try {
      setCompletingId(taskId);
      // Safety: auto-clear disabled state if something hangs
      watchdog = setTimeout(() => {
        setCompletingId((cur) => (cur === taskId ? null : cur));
      }, 8000);
      const hadShadowPassed = (() => {
        try {
          const t = (shadowState?.tasks || []).find(
            (x: any) => x.id === taskId
          );
          return !!t?.is_shadow_done && !t?.is_user_done;
        } catch {
          return false;
        }
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
      // Clear disabled state immediately so other rows remain clickable
      setCompletingId(null);
      // Lightweight toast
      try {
        const ep = j?.completion?.ep_awarded;
        const catchUp = hadShadowPassed;
        setToast({
          title: catchUp ? "Caught up!" : "Completed",
          body: catchUp
            ? "You matched the Shadow"
            : typeof ep === "number"
              ? `+${ep} EP`
              : undefined,
        });
        const shouldConfetti = typeof ep === "number" && ep > 0;
        if (catchUp) {
          setGhostPop(true);
        }
        if (shouldConfetti) {
          setConfettiBurst(true);
          setTimeout(() => {
            if (catchUp) setGhostPop(false);
            setConfettiBurst(false);
          }, 1200);
        } else if (catchUp) {
          // If for some reason EP is 0 but we caught up, still clear the pop
          setTimeout(() => {
            setGhostPop(false);
          }, 1200);
        }
        setTimeout(() => setToast(null), 2200);
      } catch {}
      // Inform race engine (fire-and-forget)
      try {
        fetch("/api/shadow/progress/run-today", { method: "POST" }).catch(
          () => {}
        );
      } catch {}
      // Refresh state (fire-and-forget) so EP and pacing update
      try {
        fetch("/api/shadow/state/today", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((s) => {
            if (!s) return;
            setShadowState(s || null);
            if (s?.ep_today) {
              setHero((prev) => ({
                userEP: s.ep_today.user ?? (prev?.userEP || 0),
                shadowEP: s.ep_today.shadow ?? (prev?.shadowEP || 0),
              }));
            }
          })
          .catch(() => {});
      } catch {}
    } catch (e) {
      console.error(e);
      try {
        const msg = e instanceof Error ? e.message : "Failed to complete";
        setToast({ title: "Error", body: msg });
        setTimeout(() => setToast(null), 2200);
      } catch {}
    } finally {
      // already cleared above; ensure not stuck
      // Clear watchdog if still pending
      try {
        if (watchdog) clearTimeout(watchdog as any);
      } catch {}
      setCompletingId(null);
    }
  };

  // Gamified loader component
  const GamifiedLoader = ({
    label,
    icon,
  }: {
    label: string;
    icon?: React.ReactNode;
  }) => (
    <div className="relative rounded-xl border border-white/5 bg-surface p-3">
      <div className="flex items-center gap-2 text-sm text-muted">
        {icon ? (
          <span className="inline-grid place-items-center h-6 w-6 rounded-lg bg-surface2/80 text-foreground/80 ring-1 ring-white/10">
            {icon}
          </span>
        ) : (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground/70" />
        )}
        <span className="font-medium">Loading {label}…</span>
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface2">
        <div className="h-full w-1/4 rounded-full bg-gradient-to-r from-foreground/30 to-foreground/10 animate-[pulse_1.6s_ease-in-out_infinite]" />
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-4">
      {/* Confetti overlay */}
      <div
        ref={confettiRef}
        className="pointer-events-none fixed inset-0 z-[200]"
      />
      {/* Shadow Explanation Walkthrough */}
      {showShadowExplain && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            onClick={() => setShowShadowExplain(false)}
            aria-hidden
          />
          <div className="relative w-[92%] max-w-md rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl shadow-2xl p-5">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-grid place-items-center h-8 w-8 rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white">
                <Ghost className="w-4 h-4" />
              </span>
              <div className="text-[15px] sm:text-[16px] font-semibold leading-tight">
                The Shadow Rivalry
              </div>
            </div>
            {/* Slides */}
            <div className="text-[13px] leading-relaxed text-gray-700 dark:text-gray-300">
              {(() => {
                if (explainSlide === 0) {
                  return (
                    <div>
                      <div className="my-3 h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-700/60 to-transparent" />
                      <div className="text-[14px] font-medium mb-1">
                        Meet Your Shadow
                      </div>
                      <ul className="space-y-1.5">
                        <li className="flex items-start gap-2">
                          <Swords className="mt-0.5 w-4 h-4 text-rose-500" />
                          <span>
                            The moment you set your first goal, a rival is born:
                            your Shadow.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Eye className="mt-0.5 w-4 h-4 text-indigo-500" />
                          <span>
                            It’s your mirror — fast, relentless, and always
                            chasing you.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 w-4 h-4 text-emerald-500" />
                          <span>
                            Every task you take on, your Shadow takes on too.
                          </span>
                        </li>
                      </ul>
                    </div>
                  );
                }
                if (explainSlide === 1) {
                  return (
                    <div>
                      <div className="my-3 h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-700/60 to-transparent" />
                      <div className="text-[14px] font-medium mb-1">
                        The Daily Race
                      </div>
                      <ul className="space-y-1.5">
                        <li className="flex items-start gap-2">
                          <Timer className="mt-0.5 w-4 h-4 text-blue-500" />
                          <span>Every day is a race.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Gauge className="mt-0.5 w-4 h-4 text-violet-500" />
                          <span>
                            If your Shadow finishes a task before you, it takes
                            the lead.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Crown className="mt-0.5 w-4 h-4 text-amber-500" />
                          <span>
                            Stay consistent and keep pace — and you’ll stay
                            ahead.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Trophy className="mt-0.5 w-4 h-4 text-emerald-500" />
                          <span>
                            The more momentum you build, the harder it becomes
                            for your Shadow to catch you.
                          </span>
                        </li>
                      </ul>
                    </div>
                  );
                }
                if (explainSlide === 2) {
                  return (
                    <div>
                      <div className="my-3 h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-700/60 to-transparent" />
                      <div className="text-[14px] font-medium mb-1">
                        The Bigger Battles: Challenges
                      </div>
                      <p className="mb-2">
                        But the daily race is only the beginning. Your Shadow
                        will throw Challenges your way:
                      </p>
                      <ul className="space-y-1.5">
                        <li className="flex items-start gap-2">
                          <Crown className="mt-0.5 w-4 h-4 text-amber-500" />
                          <span>
                            Streak challenges (stay on fire for days in a row)
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Timer className="mt-0.5 w-4 h-4 text-blue-500" />
                          <span>
                            Speed challenges (finish faster than your Shadow)
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 w-4 h-4 text-emerald-500" />
                          <span>
                            Consistency challenges (show up no matter what)
                          </span>
                        </li>
                      </ul>
                      <p className="mt-2">
                        These battles test not just your speed — but your
                        discipline, endurance, and grit.
                      </p>
                    </div>
                  );
                }
                if (explainSlide === 3) {
                  return (
                    <div>
                      <div className="my-3 h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-700/60 to-transparent" />
                      <div className="text-[14px] font-medium mb-1">
                        Why It Matters
                      </div>
                      <ul className="space-y-1.5">
                        <li className="flex items-start gap-2">
                          <Eye className="mt-0.5 w-4 h-4 text-indigo-500" />
                          <span>
                            This isn’t just a productivity app. It’s you versus
                            the version of yourself that never stops grinding.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Trophy className="mt-0.5 w-4 h-4 text-emerald-500" />
                          <span>
                            Beat the Shadow → earn rewards, streaks, and
                            momentum.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Gauge className="mt-0.5 w-4 h-4 text-violet-500" />
                          <span>Fall behind → your Shadow grows stronger.</span>
                        </li>
                      </ul>
                    </div>
                  );
                }
                // slide 4
                return (
                  <div>
                    <div className="my-3 h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-700/60 to-transparent" />
                    <div className="text-[14px] font-medium mb-1">
                      The Choice
                    </div>
                    <p className="mb-2">
                      The Shadow has already started running. The question is —
                      will you rise, stay consistent, and stay ahead? Or will
                      your Shadow outrun you?
                    </p>
                    <p>👉 The race begins now.</p>
                  </div>
                );
              })()}
            </div>
            {/* Progress */}
            <div className="mt-4 flex items-center justify-center gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${explainSlide === i ? "w-6 bg-purple-500" : "w-2.5 bg-gray-300 dark:bg-gray-700"}`}
                />
              ))}
            </div>
            {/* Controls */}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                onClick={() => setExplainSlide((s) => Math.max(0, s - 1))}
                disabled={explainSlide === 0}
                className="text-[13px] px-3 py-1.5 rounded-lg border border-gray-200/70 dark:border-gray-800/70 hover:bg-gray-100/70 dark:hover:bg-white/5 disabled:opacity-50"
              >
                Back
              </button>
              {explainSlide < 4 ? (
                <div className="flex-1 flex justify-end">
                  <button
                    onClick={() => setExplainSlide((s) => Math.min(4, s + 1))}
                    className="text-[13px] px-3 py-1.5 rounded-lg border border-transparent bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow hover:opacity-[0.98]"
                  >
                    Next
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex justify-end">
                  <button
                    onClick={async () => {
                      setShowShadowExplain(false);
                      try {
                        await fetch("/api/preferences", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                        });
                      } catch {}
                      try {
                        window.sessionStorage.removeItem(
                          "nourish:shadowExplainPending"
                        );
                        window.sessionStorage.removeItem(
                          "nourish:onboarding:suspended"
                        );
                        window.sessionStorage.setItem(
                          "nourish:onboardingComplete",
                          "1"
                        );
                      } catch {}
                    }}
                    className="text-[13px] px-3 py-1.5 rounded-lg border border-transparent bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow hover:opacity-[0.98]"
                  >
                    🚀 Start the Race
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <h1 className="text-xl font-semibold flex items-center gap-2 mb-4">
        <Swords className="w-5 h-5 text-purple-600" /> Shadow
      </h1>

      {/* Hero */}
      <section className="rounded-2xl bg-surface p-3 pr-16 md:p-4 md:pr-28 mb-4 relative overflow-hidden">
        {/* Compact mobile header */}
        <div className="mb-2 md:hidden">
          <div className="flex items-end justify-between text-gray-200">
            <div>
              <div className="text-[11px] text-gray-400">You</div>
              <div className="text-lg font-semibold text-blue-300">
                {todayUserEP}
              </div>
            </div>
            <div className="text-[11px] text-gray-500">vs</div>
            <div className="text-right">
              <div className="text-[11px] text-gray-400">Shadow</div>
              <div className="text-lg font-semibold text-purple-300">
                {todayShadowEP}
              </div>
            </div>
          </div>
        </div>
        {/* Detailed header for md+ */}
        <div className="hidden md:flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs md:text-sm text-gray-300">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface2 text-blue-300">
              Your EP (today)
            </span>
            <span className="text-blue-300 font-medium">{todayUserEP}</span>
          </div>
          <div className="flex items-center gap-2 text-xs md:text-sm text-gray-300">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface2 text-purple-300">
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
        <div className="h-3 w-full bg-surface2 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-blue-600"
            style={{ width: `${userPct}%` }}
          />
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
        <div className="mt-1 text-[10px] text-gray-500">
          You {userPct}% • Shadow {shadowPct}%
        </div>
        {/* Floating shadow avatar pop */}
        <div
          className={`pointer-events-none absolute -top-2 right-3 transition-all duration-500 hidden md:block ${
            ghostPop ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
          }`}
        >
          <div className="inline-flex items-center gap-1 text-purple-300/90 bg-surface2 rounded-full px-2 py-1 text-xs">
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
      )} */}
      {/* Race Dashboard (dark panel) */}
      <section className="rounded-2xl bg-surface p-3 md:p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] md:text-[12px] font-semibold text-gray-200">
            {(() => {
              const leadVal =
                typeof shadowState?.lead === "number"
                  ? shadowState.lead
                  : todayUserEP - todayShadowEP;
              const ahead = leadVal > 0;
              const tight = Math.abs(leadVal) < 0.5;
              const chip = "bg-surface2";
              const icon = tight
                ? "text-slate-300"
                : ahead
                  ? "text-blue-300"
                  : "text-purple-300";
              return (
                <span
                  className={`inline-flex items-center justify-center w-4.5 h-4.5 rounded-full ${chip}`}
                >
                  <Gauge className={`w-3 h-3 ${icon}`} />
                </span>
              );
            })()}
            Live Pace
          </div>
          <div className="text-[10px] md:text-[11px] text-muted">
            {stateLoading ? "Refreshing…" : "Live"}
          </div>
        </div>

        {/* Narrative KPIs */}
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-2.5 text-[11px] md:text-[12px]">
          {/* Lead Status */}
          <div
            className={(() => {
              const leadVal =
                typeof shadowState?.lead === "number"
                  ? shadowState.lead
                  : todayUserEP - todayShadowEP;
              const ahead = leadVal > 0;
              const tight = Math.abs(leadVal) < 0.5;
              return `rounded-xl p-2 md:p-2.5 bg-surface2 transition-colors`;
            })()}
          >
            <div className="flex items-center justify-between">
              <div className="text-[10px] md:text-[11px] text-muted inline-flex items-center gap-1">
                <span>🏁</span> Lead
              </div>
              {(() => {
                const leadVal =
                  typeof shadowState?.lead === "number"
                    ? shadowState.lead
                    : todayUserEP - todayShadowEP;
                const tight = Math.abs(leadVal) < 0.5;
                const ahead = leadVal > 0;
                const label = tight ? "Tight" : ahead ? "You" : "Shadow";
                const pill =
                  "bg-surface px-1.5 py-0.5 rounded-full text-[9px] md:text-[10px]";
                const tone = ahead
                  ? "text-blue-200"
                  : tight
                    ? "text-slate-200"
                    : "text-purple-200";
                return <span className={`${pill} ${tone}`}>{label}</span>;
              })()}
            </div>
            <div className="mt-0.5 text-[12px] md:text-[13px] font-medium text-foreground leading-snug">
              {(() => {
                const leadVal =
                  typeof shadowState?.lead === "number"
                    ? shadowState.lead
                    : todayUserEP - todayShadowEP;
                const tight = Math.abs(leadVal) < 0.4;
                if (tight) return "Neck and neck with Shadow";
                return leadVal > 0
                  ? "You've pulled ahead!"
                  : "Shadow is 1 step ahead";
              })()}
            </div>
            {/* Inline mini tug-of-war bar for quick glance */}
            <div className="mt-1.5 h-1 w-full bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${userPct}%` }}
              />
              <div
                className="-mt-1 h-1 bg-purple-600 transition-all duration-500 float-right"
                style={{ width: `${shadowPct}%` }}
              />
            </div>
          </div>

          {/* Projection */}
          <div className="rounded-xl p-2 md:p-2.5 bg-surface2">
            <div className="text-[10px] md:text-[11px] text-muted inline-flex items-center gap-1">
              <span>📅</span> Today's projection
            </div>
            <div className="mt-0.5 text-[12px] md:text-[13px] font-medium space-y-0.5 text-foreground leading-snug">
              {(() => {
                const tasks = (shadowState?.tasks || []) as any[];
                const userDone = tasks.filter(
                  (t: any) => t.is_user_done
                ).length;
                const shadowDone = tasks.filter(
                  (t: any) => t.is_shadow_done
                ).length;
                const us =
                  typeof shadowState?.metrics?.user_speed_now === "number"
                    ? shadowState.metrics.user_speed_now
                    : 0;
                const ss =
                  typeof shadowState?.metrics?.shadow_speed_now === "number"
                    ? shadowState.metrics.shadow_speed_now
                    : 0;
                const end = new Date();
                end.setHours(23, 59, 59, 999);
                const remainingH = Math.max(
                  0,
                  (end.getTime() - Date.now()) / 3600000
                );
                const projUser = Math.max(
                  userDone,
                  Math.round(userDone + us * remainingH)
                );
                const projShadow = Math.max(
                  shadowDone,
                  Math.round(shadowDone + ss * remainingH)
                );
                return (
                  <>
                    <div>At this pace: {projUser} tasks done today</div>
                    <div className="text-[11px] md:text-[12px] text-muted">
                      Shadow predicts: {projShadow} tasks by end of day
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Time Saved (hide when 0) */}
          {(() => {
            const ts =
              typeof shadowState?.metrics?.time_saved_minutes === "number"
                ? shadowState.metrics.time_saved_minutes
                : 0;
            if (!ts || ts <= 0) return null;
            return (
              <div className="rounded-xl p-2 md:p-2.5 bg-surface2">
                <div className="text-[10px] md:text-[11px] text-muted inline-flex items-center gap-1">
                  <span>⏳</span> Time saved
                </div>
                <div className="mt-0.5 text-[12px] md:text-[13px] font-medium text-emerald-200">
                  {`You\'ve saved ${Math.round(ts)}m so far`}
                </div>
              </div>
            );
          })()}
          {/* Momentum / Consistency */}
          <div className="rounded-xl p-2 md:p-2.5 bg-surface2">
            <div className="text-[10px] md:text-[11px] text-muted inline-flex items-center gap-1">
              <span role="img" aria-label="fire">
                🔥
              </span>{" "}
              Momentum
            </div>
            <div className="mt-0.5 text-[12px] md:text-[13px] font-medium text-foreground flex items-center gap-2">
              {(() => {
                const pc =
                  typeof shadowState?.metrics?.pace_consistency === "number"
                    ? shadowState.metrics.pace_consistency
                    : null;
                const tasks = (shadowState?.tasks || []) as any[];
                const anyStarted = tasks.some(
                  (t: any) => t.is_user_done || t.is_shadow_done
                );
                if (!pc || !anyStarted)
                  return (
                    <span className="text-muted">
                      Build momentum by starting tasks
                    </span>
                  );
                if (pc >= 0.8)
                  return (
                    <>
                      <span>Steady pace</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/20">
                        On a streak
                      </span>
                    </>
                  );
                if (pc >= 0.5) return <>Strong start</>;
                return <>Wobbly pace</>;
              })()}
            </div>
          </div>

          {/* Speed comparison */}
          <div
            className={(() => {
              // Solid card with theme tokens
              return `rounded-xl p-2 md:p-2.5 bg-surface2 md:col-span-2`;
            })()}
          >
            <div className="flex items-center justify-between">
              <div className="text-[10px] md:text-[11px] text-muted inline-flex items-center gap-1">
                <span>⚡</span> Pace
              </div>
              {(() => {
                const us =
                  typeof shadowState?.metrics?.user_speed_now === "number"
                    ? shadowState.metrics.user_speed_now
                    : 0;
                const ss =
                  typeof shadowState?.metrics?.shadow_speed_now === "number"
                    ? shadowState.metrics.shadow_speed_now
                    : 0;
                const ratio = ss > 0 ? us / ss : 1;
                let badge = "Keeping pace";
                let cls = "bg-surface text-foreground";
                if (ratio >= 1.8) {
                  badge = "Blazing";
                  cls = "bg-surface text-emerald-200";
                } else if (ratio <= 0.55) {
                  badge = "Falling behind";
                  cls = "bg-surface text-amber-200";
                }
                const pulse =
                  badge === "Blazing" || badge === "Falling behind"
                    ? "animate-pulse"
                    : "";
                return (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[9px] md:text-[10px] ${cls} ${pulse}`}
                  >
                    {badge}
                  </span>
                );
              })()}
            </div>
            <div className="mt-0.5 text-[12px] md:text-[14px] font-medium text-foreground">
              {(() => {
                const us =
                  typeof shadowState?.metrics?.user_speed_now === "number"
                    ? shadowState.metrics.user_speed_now
                    : 0;
                const ss =
                  typeof shadowState?.metrics?.shadow_speed_now === "number"
                    ? shadowState.metrics.shadow_speed_now
                    : 0;
                if (us === 0 && ss === 0) return "Shadow waits while you idle";
                if (us === 0 && ss > 0)
                  return "Shadow is moving while you idle";
                if (ss === 0 && us > 0) return "Shadow waits while you move";
                const ratio = ss > 0 ? us / ss : 1;
                if (ratio >= 1.8) return "You're moving twice as fast";
                if (ratio <= 0.55) return "Shadow is moving twice as fast";
                return "You're keeping pace";
              })()}
            </div>
            {(() => {
              const us =
                typeof shadowState?.metrics?.user_speed_now === "number"
                  ? shadowState.metrics.user_speed_now
                  : 0;
              const ss =
                typeof shadowState?.metrics?.shadow_speed_now === "number"
                  ? shadowState.metrics.shadow_speed_now
                  : 0;
              const ratio = ss > 0 ? us / ss : 1;
              if (ratio <= 0.55 || (us === 0 && ss > 0)) {
                return (
                  <div className="mt-1 text-[11px] text-amber-300">
                    Tip: try a 5‑min sprint to catch up ⚡
                  </div>
                );
              }
              return null;
            })()}
            {/* Tiny avatars for sides */}
            <div className="mt-1.5 flex items-center gap-3 text-[10px] md:text-[11px] text-muted">
              <div className="inline-flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />{" "}
                You
              </div>
              <div className="inline-flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-purple-500" />{" "}
                Shadow
              </div>
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

      {/* Challenges */}
      <section className="rounded-2xl bg-surface p-4 mb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-grid place-items-center h-6 w-6 rounded-lg bg-gradient-to-br from-amber-500 to-pink-500 text-white">
              <Trophy className="w-3.5 h-3.5" />
            </span>
            <span>Challenges</span>
          </div>
          <div className="text-xs text-muted">{active.length || 0} active</div>
        </div>
        {active.length === 0 ? (
          <div className="mt-2 rounded-xl border border-dashed border-surface2 p-4 text-center text-sm text-muted">
            <div className="mb-1">No active challenges</div>
            <div className="text-[12px]">
              Mini‑races will appear here as you progress.
            </div>
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {active.slice(0, 3).map((c) => (
              <li
                key={c.id}
                className="px-3 py-2 rounded-xl bg-surface2 flex items-center justify-between text-sm border border-transparent hover:border-amber-500/25 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate text-foreground">
                    {c.task_template?.title || "Mini‑race"}
                  </div>
                  <div className="text-xs text-muted">
                    Due{" "}
                    {c.due_time
                      ? new Date(c.due_time).toLocaleString()
                      : "soon"}
                  </div>
                </div>
                {c.state === "offered" ? (
                  <div className="shrink-0">
                    <ChallengeActions challengeId={c.id} />
                  </div>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-muted uppercase">
                    {c.state}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Task Timeline */}
      <section className="rounded-2xl bg-surface p-4 mb-4">
        <div className="flex items-center gap-2 font-semibold mb-2">
          <Timer className="w-4 h-4" /> Today
        </div>
        {!initialLoaded && stateLoading && (
          <div aria-live="polite">
            <GamifiedLoader
              label="Tasks"
              icon={<Timer className="w-3.5 h-3.5" />}
            />
          </div>
        )}
        {!stateLoading && (!groupedFlow || groupedFlow.length === 0) && (
          <div className="text-sm text-muted">No tasks for today.</div>
        )}
        <div className="space-y-3">
          {groupedFlow.map((g: any) => (
            <div key={g.anchor}>
              <div className="text-xs uppercase tracking-wide text-muted mb-1">
                {g.anchor}
              </div>
              <ul className="space-y-2">
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
      {raceHistory?.daily &&
        Array.isArray(raceHistory.daily) &&
        raceHistory.daily.length > 0 && (
          <section className="rounded-2xl bg-surface p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-semibold">
                <History className="w-4 h-4" /> History (7d)
              </div>
              <div className="text-xs text-muted">Lead by day</div>
            </div>
            <ul className="divide-y divide-surface2">
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
                      <div className="text-muted">{d.date}</div>
                      <div
                        className={`inline-flex items-center px-2 py-0.5 rounded-md ${lead >= 0 ? "bg-surface2 text-blue-300" : "bg-surface2 text-purple-300"}`}
                      >
                        {lead >= 0 ? "You" : "Shadow"} {Math.abs(lead)}
                      </div>
                    </div>
                    <div className="h-2 w-full bg-surface2 rounded-full overflow-hidden relative">
                      <div
                        className="absolute left-0 top-0 h-full bg-blue-500/80"
                        style={{ width: `${userW}%` }}
                      />
                      <div
                        className="absolute right-0 top-0 h-full bg-purple-500/70"
                        style={{ width: `${shadowW}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-muted">
                      You {userD} • Shadow {shadowD}
                    </div>
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
                        if (!res.ok)
                          throw new Error(j?.error || "Failed to setup");
                        setActivated(true);
                        setShowSetupModal(false);
                        // Confirm and refresh hero EPs
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
                        setToast({ title: "Shadow activated" });
                        setTimeout(() => setToast(null), 2000);
                      } catch (e: any) {
                        console.error(e);
                        setToast({
                          title: "Activation failed",
                          body: e?.message || "",
                        });
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
        <section className="rounded-2xl bg-surface p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Today&apos;s Shadow Challenge</div>
            <div className="text-xs text-muted">
              Deadline: {new Date(todayShadow.deadline).toLocaleTimeString()}
            </div>
          </div>
          <div className="text-sm mb-2">{todayShadow.challenge_text}</div>
          <div className="flex items-center justify-between text-sm">
            <div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface2 text-amber-200">
                EP at stake: +{epAtStake}
              </span>
            </div>
            <div className="font-mono text-foreground">{fmt(timeLeft)}</div>
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
                  // Celebrate
                  setConfettiBurst(true);
                  setTimeout(() => setConfettiBurst(false), 1200);
                  // Optimistically hide today's box
                  setTodayShadow(null);
                  // Optimistically append to history so it's visible under today's history
                  try {
                    setHistory((prev: any[]) => [
                      {
                        id: `shadow-${todayShadow.id}`,
                        state: "completed_win",
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        completed_at: new Date().toISOString(),
                        due_time: todayShadow.deadline,
                        task_template: { title: "Today's Shadow Challenge" },
                      },
                      ...(Array.isArray(prev) ? prev : []),
                    ]);
                  } catch {}
                  // Update toast
                  try {
                    setToast({
                      title: "Completed",
                      body:
                        typeof j?.ep_awarded === "number"
                          ? `+${j.ep_awarded} EP`
                          : undefined,
                    });
                    setTimeout(() => setToast(null), 2200);
                  } catch {}
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
                  // Refresh active/history lists so the item moves to history
                  try {
                    const [actRes2, histRes2] = await Promise.all([
                      fetch("/api/shadow/challenges?view=active", {
                        cache: "no-store",
                      }),
                      fetch("/api/shadow/challenges?view=history", {
                        cache: "no-store",
                      }),
                    ]);
                    if (actRes2.ok) {
                      const a = await actRes2.json();
                      setActive(
                        Array.isArray(a?.challenges) ? a.challenges : []
                      );
                    }
                    if (histRes2.ok) {
                      const h = await histRes2.json();
                      setHistory(
                        Array.isArray(h?.challenges) ? h.challenges : []
                      );
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
      {/* <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 mb-4">
        <div className="px-4 py-3 flex items-center gap-2 font-semibold">
          <Trophy className="w-4 h-4" /> Active Challenges
        </div>
        {loading ? (
          <div aria-live="polite">
            <GamifiedLoader label="Active Challenges" icon={<Trophy className="w-3.5 h-3.5" />} />
          </div>
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
      </section> */}

      {/* Today's History (local timezone) */}
      <section className="rounded-2xl bg-surface p-4 mb-4">
        <div className="flex items-center gap-2 font-semibold mb-1">
          <span className="inline-grid place-items-center h-6 w-6 rounded-lg bg-gradient-to-br from-sky-500 to-violet-500 text-white">
            <History className="w-3.5 h-3.5" />
          </span>
          <span>Today's History</span>
        </div>
        {loading ? (
          <div aria-live="polite">
            <GamifiedLoader
              label="Today's History"
              icon={<History className="w-3.5 h-3.5" />}
            />
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {filteredHistory.map((c) => (
              <li
                key={c.id}
                className="px-3 py-2 rounded-xl bg-surface2 text-sm flex items-center justify-between border border-transparent hover:border-sky-500/25 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {c.task_template?.title || "Challenge"}
                  </div>
                  <div className="text-xs text-muted">
                    Ended:{" "}
                    {c.updated_at
                      ? new Date(c.updated_at).toLocaleString()
                      : c.due_time
                        ? new Date(c.due_time).toLocaleString()
                        : "—"}
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-muted uppercase">
                  {c.state}
                </span>
              </li>
            ))}
            {!filteredHistory.length && (
              <li className="px-3 py-3 rounded-xl bg-surface2 text-sm text-muted text-center">
                No past challenges
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Transparency (optional) */}
      <section className="rounded-2xl bg-surface p-4">
        <div className="flex items-center gap-2 font-semibold mb-2">
          <span className="inline-grid place-items-center h-6 w-6 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white">
            <Eye className="w-3.5 h-3.5" />
          </span>
          <span>Transparency</span>
        </div>
        <div className="rounded-xl border border-dashed border-surface2 p-4 text-sm text-muted">
          Shadow‑only tasks will be shown here in a future iteration.
        </div>
      </section>

      {err && <div className="mt-4 text-sm text-red-500">{err}</div>}
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 px-3 py-2 rounded-lg shadow-lg bg-surface text-sm">
          <div className="font-medium">{toast.title}</div>
          {toast.body && <div className="text-muted">{toast.body}</div>}
        </div>
      )}
    </div>
  );
}

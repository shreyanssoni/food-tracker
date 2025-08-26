"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CircularStat from "@/components/CircularStat";
import { createClient as createBrowserClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import { useNotifications } from "@/utils/notifications";
import { track } from "@/utils/analytics";

export default function DashboardPage() {
  const supabase = createBrowserClient();
  const { enabled: pushEnabled } = useNotifications();
  const [targets, setTargets] = useState<{
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  } | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [todayTotals, setTodayTotals] = useState({
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  });
  const [clearing, setClearing] = useState(false);
  // Gamification state
  const [tasks, setTasks] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<Record<string, any>>({});
  const [progress, setProgress] = useState<{
    level: number;
    ep_in_level: number;
    ep_required: number;
    total_ep: number;
    diamonds: number;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Streaks summary
  const [streakMax, setStreakMax] = useState<{
    current: number;
    longest: number;
  } | null>(null);
  // Life Streak
  const [lifeStreak, setLifeStreak] = useState<{
    current: number;
    longest: number;
    canRevive: boolean;
    reviveCost: number;
  } | null>(null);
  const [reviving, setReviving] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [nextUp, setNextUp] = useState<null | { task: any; when: Date | null }>(null);
  const nudgeSentRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((d) => setTargets(d?.targets || null));
    fetch("/api/ai/summary", { method: "POST" })
      .then((r) => r.json())
      .then(setSummary);
  }, []);

  useEffect(() => {
    const loadGamification = async () => {
      try {
        setTasksLoading(true);
        const [tRes, pRes, gRes, lsRes] = await Promise.all([
          fetch("/api/tasks"),
          fetch("/api/progress"),
          fetch("/api/goals"),
          fetch("/api/life-streak"),
        ]);
        const [tData, pData, gData, lsData] = await Promise.all([
          tRes.json(),
          pRes.json(),
          gRes.json(),
          lsRes.json(),
        ]);
        if (!tData.error) {
          setTasks(tData.tasks || []);
          const schedMap: Record<string, any> = {};
          (tData.schedules || []).forEach((s: any) => {
            schedMap[s.task_id] = s;
          });
          setSchedules(schedMap);
        }
        if (!pData.error) {
          setProgress(pData.progress);
        }
        if (!lsData?.error && lsData?.lifeStreak) {
          setLifeStreak(lsData.lifeStreak);
        }
        // Compute max daily streak across goals
        if (!gData.error) {
          const goals: any[] = gData.goals || [];
          const ids = goals.map((g: any) => g.id).filter(Boolean);
          if (ids.length) {
            const chunks = await Promise.all(
              ids.map((id: string) =>
                fetch(`/api/goals/${id}/streaks`)
                  .then((r) => r.json())
                  .catch(() => null)
              )
            );
            let maxCur = 0,
              maxLong = 0;
            for (const j of chunks) {
              if (!j || j.error) continue;
              const cur = Number(j?.streaks?.dailyCurrent || 0);
              const lng = Number(j?.streaks?.dailyLongest || 0);
              if (cur > maxCur) maxCur = cur;
              if (lng > maxLong) maxLong = lng;
            }
            setStreakMax({ current: maxCur, longest: maxLong });
          } else {
            setStreakMax({ current: 0, longest: 0 });
          }
        }
      } catch {} finally {
        setTasksLoading(false);
      }
    };
    loadGamification();
  }, []);

  useEffect(() => {
    const load = async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from("food_logs")
        .select("calories,protein_g,carbs_g,fat_g")
        .gte("eaten_at", start.toISOString())
        .lte("eaten_at", end.toISOString());
      if (data) {
        const totals = data.reduce(
          (acc: any, l: any) => {
            acc.calories += Number(l.calories) || 0;
            acc.protein_g += Number(l.protein_g) || 0;
            acc.carbs_g += Number(l.carbs_g) || 0;
            acc.fat_g += Number(l.fat_g) || 0;
            return acc;
          },
          { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
        );
        setTodayTotals(totals);
      }
    };
    load();
  }, [supabase]);

  // Load gamification data
  useEffect(() => {
    const loadGamification = async () => {
      try {
        const [tRes, pRes, gRes, lsRes] = await Promise.all([
          fetch("/api/tasks"),
          fetch("/api/progress"),
          fetch("/api/goals"),
          fetch("/api/life-streak"),
        ]);
        const [tData, pData, gData, lsData] = await Promise.all([
          tRes.json(),
          pRes.json(),
          gRes.json(),
          lsRes.json(),
        ]);
        if (!tData.error) {
          setTasks(tData.tasks || []);
          const schedMap: Record<string, any> = {};
          (tData.schedules || []).forEach((s: any) => {
            schedMap[s.task_id] = s;
          });
          setSchedules(schedMap);
        }
        if (!pData.error) {
          setProgress(pData.progress);
        }
        if (!lsData?.error && lsData?.lifeStreak) {
          setLifeStreak(lsData.lifeStreak);
        }
        // Compute max daily streak across goals
        if (!gData.error) {
          const goals: any[] = gData.goals || [];
          const ids = goals.map((g: any) => g.id).filter(Boolean);
          if (ids.length) {
            const chunks = await Promise.all(
              ids.map((id: string) =>
                fetch(`/api/goals/${id}/streaks`)
                  .then((r) => r.json())
                  .catch(() => null)
              )
            );
            let maxCur = 0,
              maxLong = 0;
            for (const j of chunks) {
              if (!j || j.error) continue;
              const cur = Number(j?.streaks?.dailyCurrent || 0);
              const lng = Number(j?.streaks?.dailyLongest || 0);
              if (cur > maxCur) maxCur = cur;
              if (lng > maxLong) maxLong = lng;
            }
            setStreakMax({ current: maxCur, longest: maxLong });
          } else {
            setStreakMax({ current: 0, longest: 0 });
          }
        }
      } catch {}
    };
    loadGamification();
  }, []);

  // Realtime: subscribe and debounce refresh for tasks/progress
  useEffect(() => {
    const ch = supabase.channel("rt-dashboard");
    const trigger = () => {
      if ((trigger as any)._t) clearTimeout((trigger as any)._t);
      (trigger as any)._t = setTimeout(async () => {
        try {
          const [tRes, pRes, gRes, lsRes] = await Promise.all([
            fetch("/api/tasks"),
            fetch("/api/progress"),
            fetch("/api/goals"),
            fetch("/api/life-streak"),
          ]);
          const [tData, pData, gData, lsData] = await Promise.all([
            tRes.json(),
            pRes.json(),
            gRes.json(),
            lsRes.json(),
          ]);
          if (!tData.error) {
            setTasks(tData.tasks || []);
            const schedMap: Record<string, any> = {};
            (tData.schedules || []).forEach((s: any) => {
              schedMap[s.task_id] = s;
            });
            setSchedules(schedMap);
          }
          if (!pData.error) setProgress(pData.progress);
          if (!lsData?.error && lsData?.lifeStreak)
            setLifeStreak(lsData.lifeStreak);
          if (!gData.error) {
            const goals: any[] = gData.goals || [];
            const ids = goals.map((g: any) => g.id).filter(Boolean);
            if (ids.length) {
              const chunks = await Promise.all(
                ids.map((id: string) =>
                  fetch(`/api/goals/${id}/streaks`)
                    .then((r) => r.json())
                    .catch(() => null)
                )
              );
              let maxCur = 0,
                maxLong = 0;
              for (const j of chunks) {
                if (!j || j.error) continue;
                const cur = Number(j?.streaks?.dailyCurrent || 0);
                const lng = Number(j?.streaks?.dailyLongest || 0);
                if (cur > maxCur) maxCur = cur;
                if (lng > maxLong) maxLong = lng;
              }
              setStreakMax({ current: maxCur, longest: maxLong });
            } else {
              setStreakMax({ current: 0, longest: 0 });
            }
          }
        } catch {}
      }, 250);
    };
    const tables = [
      "tasks",
      "task_completions",
      "task_schedules",
      "goal_tasks",
      "goals",
    ];
    for (const tbl of tables) {
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: tbl },
        trigger
      );
    }
    ch.subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearContext = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      const res = await fetch("/api/ai/coach", { method: "DELETE" });
      // no-op UI here; chat is on dedicated page
    } catch {}
    setClearing(false);
  };

  const reviveLifeStreak = async () => {
    if (!lifeStreak?.canRevive || reviving) return;
    try {
      setReviving(true);
      const res = await fetch("/api/life-streak/revive", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Revive failed");
      // refresh life streak + diamonds
      const [lsRes, pRes] = await Promise.all([
        fetch("/api/life-streak"),
        fetch("/api/progress"),
      ]);
      const [lsData, pData] = await Promise.all([lsRes.json(), pRes.json()]);
      if (!lsData.error && lsData.lifeStreak) setLifeStreak(lsData.lifeStreak);
      if (!pData.error && pData.progress) setProgress(pData.progress);
      toast.success("Streak revived 🔥");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReviving(false);
    }
  };

  const completeTask = async (taskId: string, epValue: number) => {
    try {
      setBusy(taskId);
      const res = await fetch(`/api/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to complete");
      toast.success(`+${data?.completion?.ep_awarded || epValue} EP`);
      // analytics: task_complete
      try {
        track("task_complete", { taskId, ep: data?.completion?.ep_awarded || epValue });
      } catch {}
      // refresh tasks + progress + life streak (which auto-updates on GET)
      const [tRes, pRes, lsRes] = await Promise.all([
        fetch("/api/tasks"),
        fetch("/api/progress"),
        fetch("/api/life-streak"),
      ]);
      const [tData, pData, lsData] = await Promise.all([
        tRes.json(),
        pRes.json(),
        lsRes.json(),
      ]);
      if (!tData.error) {
        setTasks(tData.tasks || []);
        const schedMap: Record<string, any> = {};
        (tData.schedules || []).forEach((s: any) => {
          schedMap[s.task_id] = s;
        });
        setSchedules(schedMap);
      }
      if (!pData.error) setProgress(pData.progress);
      if (!lsData?.error && lsData?.lifeStreak)
        setLifeStreak(lsData.lifeStreak);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const isDueToday = (taskId: string) => {
    const s = schedules[taskId];
    if (!s) return false; // only show scheduled tasks for today
    const t = tasks.find((x) => x.id === taskId);
    // Respect weekly quota if available
    if (t && typeof t.week_quota === "number" && t.week_quota !== null) {
      const done = Number(t.week_count || 0);
      if (done >= t.week_quota) return false;
    }
    const now = new Date();
    const dow = now.getDay();
    if (s.frequency === "daily") return true;
    if (s.frequency === "weekly") {
      return Array.isArray(s.byweekday) ? s.byweekday.includes(dow) : false;
    }
    // custom: include for now
    return true;
  };

  // Helpers to evaluate time-of-day based due-ness with timezone awareness
  const nowInTZ = (tz?: string) => {
    try {
      return tz ? new Date(new Date().toLocaleString("en-US", { timeZone: tz })) : new Date();
    } catch {
      return new Date();
    }
  };

  const todayAtInTZ = (tz: string | undefined, atTime: string | null | undefined) => {
    if (!atTime) return null;
    const n = nowInTZ(tz);
    const [hh, mm = "0", ss = "0"] = String(atTime).split(":");
    const d = new Date(n.getFullYear(), n.getMonth(), n.getDate(), Number(hh) || 0, Number(mm) || 0, Number(ss) || 0, 0);
    return d;
  };

  // Determine if a task is due now (time reached) or later today (time in future)
  const classifyToday = (task: any) => {
    const s = schedules[task.id];
    if (!s) return { dueNow: false, later: false, when: null as Date | null };
    if (!isDueToday(task.id)) return { dueNow: false, later: false, when: null };
    const when = todayAtInTZ(s.timezone, s.at_time);
    if (!when) {
      // No specific time, treat as due now
      return { dueNow: true, later: false, when: null };
    }
    const n = nowInTZ(s.timezone);
    return { dueNow: n >= when, later: n < when, when };
  };

  // Compute Next Up whenever tasks/schedules change
  useEffect(() => {
    const dueToday = tasks.filter((t) => isDueToday(t.id) && !t.completedToday);
    const withMeta = dueToday.map((t) => ({ t, meta: classifyToday(t) }));
    const later = withMeta.filter((x) => x.meta.later);
    later.sort((a: any, b: any) => (a.meta.when?.getTime?.() ?? 0) - (b.meta.when?.getTime?.() ?? 0));
    if (later.length > 0) setNextUp({ task: later[0].t, when: later[0].meta.when || null });
    else setNextUp(null);
  }, [tasks, schedules]);

  // Notifications timing hook: send a gentle nudge if user opted in and next task is upcoming
  useEffect(() => {
    if (!pushEnabled || !nextUp?.task) return;
    const id = nextUp.task.id as string;
    const when = nextUp.when;
    if (!when) return;
    const now = new Date();
    const msUntil = when.getTime() - now.getTime();
    // only nudge when within the next 45 minutes
    if (msUntil <= 0 || msUntil > 45 * 60 * 1000) return;
    // avoid duplicate sends per task per session
    if (nudgeSentRef.current === id) return;
    nudgeSentRef.current = id;
    const title = "Next up";
    const body = `${nextUp.task.title} at ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    // fire-and-forget; server has per-user rate limits
    fetch('/api/push/send-to-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, url: '/dashboard' })
    }).catch(() => {});
  }, [pushEnabled, nextUp]);

  return (
    <div className="space-y-7">
      {/* Player Card + Quick Actions */}
      <section className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gradient-to-br from-sky-600/15 via-indigo-600/10 to-emerald-500/10 dark:from-sky-900/25 dark:via-indigo-900/20 dark:to-emerald-900/20 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Today
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {/* Level */}
              <span className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 px-2 py-1">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-indigo-600" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>
                <span className="font-semibold">Level</span>
                <span className="tabular-nums">{progress?.level ?? '—'}</span>
              </span>
              {/* EP */}
              <span className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 px-2 py-1">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l9 9-9 9-9-9 9-9z"/></svg>
                <span className="font-semibold">EP</span>
                <span className="tabular-nums">{progress ? `${progress.ep_in_level}/${progress.ep_required}` : '—'}</span>
              </span>
              {/* Diamonds */}
              <span className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 px-2 py-1">
                <span aria-hidden className="text-blue-600">💎</span>
                <span className="font-semibold">Diamonds</span>
                <span className="tabular-nums">{progress?.diamonds ?? 0}</span>
              </span>
              {/* Life Streak */}
              <span className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-slate-900/60 border border-orange-200/70 dark:border-orange-900/50 px-2 py-1">
                <span aria-hidden>🔥</span>
                <span className="font-semibold">Streak</span>
                <span className="tabular-nums">{lifeStreak?.current ?? '—'}</span>
              </span>
            </div>
          </div>
          <Link
            href={{ pathname: "/food" }}
            className="rounded-full px-3 py-1.5 text-xs font-medium bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-900 transition"
            onClick={() => {
              try { track("quick_action_use", { label: "Quick log" }); } catch {}
            }}
          >
            Quick log
          </Link>
        </div>
        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2"
          aria-label="Quick actions"
        >
          <QuickAction href="/food" emoji="🍽️" label="Log" kind="emerald" />
          <QuickAction href="/tasks" emoji="✅" label="Tasks" kind="blue" />
          <QuickAction href="/goals" emoji="🎯" label="Goals" kind="violet" />
          <QuickAction href="/suggestions" emoji="✨" label="Ideas" kind="amber" />
          <QuickAction href="/collectibles/shop" emoji="🛒" label="Collectibles" kind="slate" />
          <QuickAction href="/rewards" emoji="🎁" label="Rewards" kind="violet" />
        </div>
      </section>

      {/* Next Up banner (mobile-first) */}
      {nextUp && (
        <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 p-3 flex items-center justify-between shadow-sm">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-slate-500">Next up</div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{nextUp.task.title}</div>
            {nextUp.when && (
              <div className="text-[11px] text-slate-600 dark:text-slate-400">{nextUp.when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            )}
          </div>
          <button
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-600 text-white"
            onClick={() => {
              try {
                track("next_up_click", { taskId: nextUp.task.id });
              } catch {}
              const el = document.getElementById('later-today');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            View
          </button>
        </div>
      )}

      {/* Today's Tasks */}
      <section className="space-y-3" aria-labelledby="today-tasks-heading">
        <h2
          id="today-tasks-heading"
          className="text-md font-semibold text-slate-900 dark:text-slate-100"
        >
          Today's Tasks
        </h2>
        {tasksLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" aria-hidden>
            <div className="skeleton-card h-20 rounded-2xl" />
            <div className="skeleton-card h-20 rounded-2xl" />
            <div className="skeleton-card h-20 rounded-2xl hidden md:block" />
          </div>
        ) : (() => {
          const dueToday = tasks.filter((t) => isDueToday(t.id) && !t.completedToday);
          const withMeta = dueToday.map((t) => ({ t, meta: classifyToday(t) }));
          const dueNow = withMeta.filter((x) => x.meta.dueNow);
          const later = withMeta.filter((x) => x.meta.later);
          // Sort: dueNow without time first, then by time; later strictly by time
          const sortByWhen = (a: any, b: any) => {
            const wa = a.meta.when?.getTime?.() ?? 0;
            const wb = b.meta.when?.getTime?.() ?? 0;
            return wa - wb;
          };
          dueNow.sort(sortByWhen);
          later.sort(sortByWhen);

          if (dueNow.length + later.length === 0) {
            return (
              <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-5 text-center">
                <div className="text-sm text-slate-600 dark:text-slate-400">No tasks due today. Enjoy a rest or log a quick win.</div>
                <div className="mt-3">
                  <Link
                    href="/tasks"
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white"
                    onClick={() => {
                      try {
                        track("quick_action_use", { label: "Empty state quick log" });
                      } catch {}
                    }}
                  >
                    Log a quick win
                  </Link>
                </div>
              </div>
            );
          }

          return (
            <div className="space-y-4">
              {dueNow.length > 0 && (
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Due now</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {dueNow.map(({ t, meta }) => {
                      const rc = rarityClasses(t.ep_value);
                      return (
                      <div
                        key={t.id}
                        className={`rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-4 flex items-start justify-between gap-3 ${rc.card}`}
                      >
                        <div>
                          <div className="font-semibold flex items-center gap-2">
                            {t.title}
                            {t.goal?.title && (
                              <span className="text-[10px] uppercase tracking-wide bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                                Goal: {t.goal.title}
                              </span>
                            )}
                            <span className={`ml-1 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${rc.badge}`}>
                              <span className="font-semibold">+{t.ep_value} EP</span>
                              <span className="opacity-80">{rc.label}</span>
                            </span>
                          </div>
                          {t.description && (
                            <div className="text-xs text-slate-600 mt-1">{t.description}</div>
                          )}
                        </div>
                        <button
                          disabled={!!busy || t.completedToday}
                          onClick={() => completeTask(t.id, t.ep_value)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium disabled:opacity-60 ${t.completedToday ? "bg-slate-300 text-slate-600" : "bg-blue-600 text-white"}`}
                        >
                          {t.completedToday ? "Completed" : busy === t.id ? "Completing…" : "Complete"}
                        </button>
                      </div>
                    );})}
                  </div>
                </div>
              )}

              {later.length > 0 && (
                <div>
                  <div id="later-today" className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Later today</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {later.map(({ t, meta }) => {
                      const rc = rarityClasses(t.ep_value);
                      return (
                      <div
                        key={t.id}
                        className={`rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-3 flex items-center justify-between gap-3 ${rc.card}`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate flex items-center gap-2">
                            {t.title}
                            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${rc.badge}`}>
                              <span className="font-semibold">+{t.ep_value} EP</span>
                              <span className="opacity-80">{rc.label}</span>
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                            {meta.when && (
                              <span className="inline-flex items-center gap-1 text-slate-500">
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M12 6v6l4 2" />
                                </svg>
                                {meta.when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          disabled={!!busy || t.completedToday}
                          onClick={() => completeTask(t.id, t.ep_value)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium disabled:opacity-60 ${t.completedToday ? "bg-slate-300 text-slate-600" : "bg-blue-600 text-white"}`}
                          aria-label={`Complete ${t.title}`}
                        >
                          {t.completedToday ? "Done" : busy === t.id ? "…" : "Complete"}
                        </button>
                      </div>
                    );})}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </section>

      {/* Life Streak + Progress & Diamonds */}
      <section
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
        aria-labelledby="progress-heading"
      >
        {/* Life Streak Card */}
        <div className="rounded-2xl border border-orange-200/70 dark:border-orange-900/50 bg-gradient-to-br from-orange-50/80 to-rose-50/60 dark:from-orange-950/30 dark:to-rose-950/20 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-md font-semibold flex items-center gap-2">
              <span className="text-xl" aria-hidden>
                🔥
              </span>
              Life Streak
            </h2>
            {lifeStreak?.canRevive && (
              <button
                onClick={reviveLifeStreak}
                disabled={reviving}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-60"
                title={`Revive for ${lifeStreak.reviveCost} diamonds`}
              >
                {reviving ? "Reviving…" : `Revive (${lifeStreak.reviveCost}💎)`}
              </button>
            )}
          </div>
          <div className="mt-3 flex items-end gap-4">
            <div className="text-4xl font-extrabold text-orange-700 dark:text-orange-300 tabular-nums">
              {lifeStreak ? lifeStreak.current : "—"}
            </div>
            <div className="text-sm text-orange-800/80 dark:text-orange-300/80">
              <div>Current</div>
              <div className="text-[12px]">
                Longest:{" "}
                <span className="font-semibold">
                  {lifeStreak ? lifeStreak.longest : "—"}
                </span>
              </div>
            </div>
          </div>
          {!lifeStreak?.canRevive && (
            <div className="mt-3 text-[12px] text-orange-700/80 dark:text-orange-300/80">
              Complete all tasks today to keep your flame alive.
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-5 lg:col-span-2">
          <h2 id="progress-heading" className="text-md font-semibold mb-2">
            Progress
          </h2>
          {!progress ? (
            <div className="skeleton-line w-1/2" aria-hidden />
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  Level {progress.level}
                </div>
                <div className="text-sm text-slate-600">
                  Total EP: {progress.total_ep}
                </div>
              </div>
              <div className="mt-3">
                <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full"
                    style={{
                      width: `${Math.min(100, (progress.ep_in_level / Math.max(1, progress.ep_required)) * 100)}%`,
                    }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {progress.ep_in_level}/{progress.ep_required} EP • Remaining{" "}
                  {Math.max(0, progress.ep_required - progress.ep_in_level)}
                </div>
                {/* Weekly consistency mini-meter */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Weekly consistency</div>
                    <div className="text-[11px] text-slate-500">Longest {streakMax?.longest ?? 0}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const filled = (streakMax?.current ?? 0) % 7 > i || (streakMax?.current ?? 0) >= 7 && i < 7;
                      return (
                        <span
                          key={i}
                          className={`h-2.5 w-8 rounded-full ${filled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                          aria-hidden
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* Removed old daily streak chips in favor of Life Streak card */}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-5">
          <h2 className="text-md font-semibold mb-2">Diamonds</h2>
          <div className="text-2xl font-extrabold text-blue-600">
            {progress?.diamonds ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Earn diamonds by reaching new levels.
          </div>
          <div className="mt-3">
            <Link
              href="/rewards"
              className="inline-block px-3 py-1.5 rounded-full text-xs font-medium bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-900"
              onClick={() => {
                try {
                  track("open_wallet");
                } catch {}
              }}
            >
              View rewards
            </Link>
          </div>
        </div>
      </section>

      {/* Macros */}
      <section className="space-y-3" aria-labelledby="macros-heading">
        <h2
          id="macros-heading"
          className="text-md font-semibold text-slate-900 dark:text-slate-100"
        >
          Macros
        </h2>
        {targets ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-3 shadow-sm">
              <CircularStat
                label="Calories"
                value={todayTotals.calories}
                target={targets.calories}
                unit="kcal"
              />
            </div>
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-3 shadow-sm">
              <CircularStat
                label="Protein"
                value={todayTotals.protein_g}
                target={targets.protein_g}
                unit="g"
              />
            </div>
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-3 shadow-sm">
              <CircularStat
                label="Carbs"
                value={todayTotals.carbs_g}
                target={targets.carbs_g}
                unit="g"
              />
            </div>
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-3 shadow-sm">
              <CircularStat
                label="Fats"
                value={todayTotals.fat_g}
                target={targets.fat_g}
                unit="g"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" aria-hidden>
            <div className="skeleton-circle h-28 w-28 mx-auto" />
            <div className="skeleton-circle h-28 w-28 mx-auto" />
            <div className="skeleton-circle h-28 w-28 mx-auto hidden sm:block" />
            <div className="skeleton-circle h-28 w-28 mx-auto hidden sm:block" />
          </div>
        )}
      </section>

      {/* Coach Summary moved to Food page */}
    </div>
  );
}

type QuickKind = "blue" | "emerald" | "violet" | "amber" | "slate";
function colorClasses(kind: QuickKind) {
  switch (kind) {
    case "emerald":
      return {
        from: "from-emerald-100 dark:from-emerald-950",
        to: "to-emerald-50/60 dark:to-emerald-900/40",
        ring: "ring-emerald-200/50 dark:ring-emerald-800/50",
        iconBg: "bg-emerald-100 dark:bg-emerald-900/60",
        iconText: "text-emerald-700 dark:text-emerald-300",
        tint: "bg-emerald-200/80 dark:bg-emerald-900/45",
        border: "border-emerald-300/70 dark:border-emerald-800/50",
      } as const;
    case "violet":
      return {
        from: "from-violet-100 dark:from-violet-950",
        to: "to-violet-50/60 dark:to-violet-900/40",
        ring: "ring-violet-200/50 dark:ring-violet-800/50",
        iconBg: "bg-violet-100 dark:bg-violet-900/60",
        iconText: "text-violet-700 dark:text-violet-300",
        tint: "bg-violet-200/80 dark:bg-violet-900/45",
        border: "border-violet-300/70 dark:border-violet-800/50",
      } as const;
    case "amber":
      return {
        from: "from-amber-100 dark:from-amber-950",
        to: "to-amber-50/60 dark:to-amber-900/40",
        ring: "ring-amber-200/50 dark:ring-amber-800/50",
        iconBg: "bg-amber-100 dark:bg-amber-900/60",
        iconText: "text-amber-700 dark:text-amber-300",
        tint: "bg-amber-200/80 dark:bg-amber-900/45",
        border: "border-amber-300/70 dark:border-amber-800/50",
      } as const;
    case "slate":
      return {
        from: "from-slate-100 dark:from-slate-900",
        to: "to-slate-50/60 dark:to-slate-800/60",
        ring: "ring-slate-200/50 dark:ring-slate-700/60",
        iconBg: "bg-slate-100 dark:bg-slate-800/70",
        iconText: "text-slate-700 dark:text-slate-200",
        tint: "bg-slate-300/70 dark:bg-slate-800/60",
        border: "border-slate-300/70 dark:border-slate-700/60",
      } as const;
    default:
      return {
        from: "from-blue-100 dark:from-blue-950",
        to: "to-blue-50/60 dark:to-blue-900/40",
        ring: "ring-blue-200/50 dark:ring-blue-800/50",
        iconBg: "bg-blue-100 dark:bg-blue-900/60",
        iconText: "text-blue-700 dark:text-blue-300",
        tint: "bg-blue-200/80 dark:bg-blue-900/45",
        border: "border-blue-300/70 dark:border-blue-800/50",
      } as const;
  }
}

// EP rarity styling based on EP value
function rarityClasses(ep: number) {
  // Simple tiers: 1-9 Common, 10-19 Uncommon, 20-34 Rare, 35-49 Epic, 50+ Legendary
  let label = 'Common';
  let card = '';
  let badge = 'border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200';
  if (ep >= 50) {
    label = 'Legendary';
    card = 'ring-1 ring-offset-1 ring-yellow-400/50 dark:ring-yellow-500/50 ring-offset-white dark:ring-offset-slate-950';
    badge = 'border-yellow-300 dark:border-yellow-600 bg-yellow-50/80 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200';
  } else if (ep >= 35) {
    label = 'Epic';
    card = 'ring-1 ring-offset-1 ring-purple-400/50 dark:ring-purple-500/50 ring-offset-white dark:ring-offset-slate-950';
    badge = 'border-purple-300 dark:border-purple-600 bg-purple-50/80 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200';
  } else if (ep >= 20) {
    label = 'Rare';
    card = 'ring-1 ring-offset-1 ring-blue-400/40 dark:ring-blue-500/40 ring-offset-white dark:ring-offset-slate-950';
    badge = 'border-blue-300 dark:border-blue-600 bg-blue-50/80 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200';
  } else if (ep >= 10) {
    label = 'Uncommon';
    card = 'ring-1 ring-offset-1 ring-emerald-400/40 dark:ring-emerald-500/40 ring-offset-white dark:ring-offset-slate-950';
    badge = 'border-emerald-300 dark:border-emerald-600 bg-emerald-50/80 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200';
  }
  return { label, card, badge };
}

function QuickAction({
  href,
  emoji,
  label,
  className,
  kind = "blue",
}: {
  href: string;
  emoji: string;
  label: string;
  className?: string;
  kind?: QuickKind;
}) {
  const c = colorClasses(kind);
  return (
    <Link
      href={{ pathname: href }}
      aria-label={label}
      className={`group block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-600 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 active:scale-[.995] transition-transform ${className || ""}`}
      onClick={() => {
        try {
          track("quick_action_use", { label });
        } catch {}
      }}
    >
      <div
        className={`w-full h-12 sm:h-[56px] rounded-full border ${c.border} shadow-sm hover:shadow-md active:shadow-sm flex items-center gap-2 pl-2 pr-1.5 sm:pr-2 transition-all duration-200 ease-out ${c.tint} backdrop-blur-md overflow-hidden`}
      >
        <div
          className={`h-7 w-7 sm:h-8 sm:w-8 ${c.iconBg} ${c.iconText} rounded-full grid place-items-center text-[16px] sm:text-[18px] shadow-inner shrink-0`}
          aria-hidden
        >
          <span className="leading-none">{emoji}</span>
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
          <span className="flex-1 min-w-0 text-[12px] sm:text-[13px] font-semibold tracking-wide text-slate-900 dark:text-slate-100 whitespace-nowrap">
            {label}
          </span>
          <svg
            viewBox="0 0 24 24"
            className="hidden sm:block h-4 w-4 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors shrink-0 ml-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

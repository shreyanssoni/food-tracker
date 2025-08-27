"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CircularStat from "@/components/CircularStat";
import { createClient as createBrowserClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import { useNotifications } from "@/utils/notifications";
import { track } from "@/utils/analytics";
import AvatarPanel from "../../components/AvatarPanel";
import { useSession } from "next-auth/react";

export default function DashboardPage() {
  const supabase = createBrowserClient();
  const { enabled: pushEnabled } = useNotifications();
  // Minute tick to re-evaluate date-sensitive UI (e.g., after midnight)
  const [clockTick, setClockTick] = useState(0);
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
    week?: Array<{
      day: string;
      status: "counted" | "revived" | "missed" | "none";
    }>;
    weekly?: { consecutive: number; longest: number; currentWeekDays?: number };
  } | null>(null);
  // Goals overview
  const [goals, setGoals] = useState<any[]>([]);
  const [goalSummaries, setGoalSummaries] = useState<
    Record<string, { totalWeeks: number; successWeeks: number }>
  >({});
  const [reviving, setReviving] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [nextUp, setNextUp] = useState<null | { task: any; when: Date | null }>(
    null
  );
  const nudgeSentRef = useRef<string | null>(null);
  // Server-calculated set of tasks due today
  const [todayTaskIds, setTodayTaskIds] = useState<Set<string>>(new Set());
  const { data: session } = useSession();


  useEffect(() => {
    // Ensure user has an avatar; if unauthorized, redirect to sign-in
    (async () => {
      try {
        const res = await fetch("/api/avatar", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/auth/signin";
          return;
        }
        const j = await res.json().catch(() => ({}));
        if (res.ok && !j?.avatar) {
          window.location.href = "/onboarding/avatar";
        }
      } catch {
        // On hard failure, log out to be safe
        window.location.href = "/auth/signin";
      }
    })();
  }, []);

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
          setGoals(goals);
          setGoalSummaries(gData.summaries || {});
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
              const cur = Number(j?.streaks?.consecutiveWeeks || 0);
              const lng = Number(j?.streaks?.longest || 0);
              if (cur > maxCur) maxCur = cur;
              if (lng > maxLong) maxLong = lng;
            }
            setStreakMax({ current: maxCur, longest: maxLong });
          } else {
            setStreakMax({ current: 0, longest: 0 });
          }
        }
      } catch {
      } finally {
        setTasksLoading(false);
      }
    };
    loadGamification();
  }, []);

  useEffect(() => {
    // update every 60s to naturally roll UI to a new day/time without manual refresh
    const id = setInterval(() => setClockTick((t) => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // also force a re-render at immediate mount to sync with current minute boundary
    setClockTick((t) => t);
  }, []);

  // Fetch today's tasks from the server based on current instant
  useEffect(() => {
    (async () => {
      try {
        const nowIso = new Date().toISOString();
        const res = await fetch(
          `/api/tasks/today?now=${encodeURIComponent(nowIso)}`,
          { cache: "no-store" }
        );
        const j = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(j.tasks)) {
          setTodayTaskIds(new Set((j.tasks as any[]).map((x) => x.id)));
        }
      } catch {}
    })();
  }, [clockTick]);

  // ---------- existing effects below ----------

  useEffect(() => {
    const load = async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      // const { data: userRes, error: userErr } = await supabase.auth.getUser();
      // const userId = userRes?.user?.id;
      // if (userErr || !userId) {
      //   // Not signed in; redirect to sign-in
      //   window.location.href = "/auth/signin";
      //   return;
      // }
      const { data } = await supabase
        .from("food_logs")
        .select("calories,protein_g,carbs_g,fat_g")
        .gte("eaten_at", start.toISOString())
        .lte("eaten_at", end.toISOString())
        .eq("user_id", session?.user?.id);
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
            setGoals(goals);
            setGoalSummaries(gData.summaries || {});
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
                const cur = Number(j?.streaks?.consecutiveWeeks || 0);
                const lng = Number(j?.streaks?.longest || 0);
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
        track("task_complete", {
          taskId,
          ep: data?.completion?.ep_awarded || epValue,
        });
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
    const nowTz = nowInTZ(s.timezone);
    const todayStr = dateStrInTZ(s.timezone);
    // If a date window exists (start_date[/end_date]), only show within that window
    if (s.start_date) {
      const start = String(s.start_date || "").slice(0, 10);
      const end = String(s.end_date || s.start_date || "").slice(0, 10);
      if (!(todayStr >= start && todayStr <= end)) return false;
    }
    // one-time tasks: only on the scheduled date (respect timezone); support optional end_date window
    if (s.frequency === "once") {
      // The window check above already filtered; enforce presence of start_date
      return Boolean(s.start_date);
    }
    if (s.frequency === "daily") return true;
    if (s.frequency === "weekly") {
      const dow = nowTz.getDay();
      return Array.isArray(s.byweekday) ? s.byweekday.includes(dow) : false;
    }
    // custom/other: default to not due unless explicitly windowed above
    return false;
  };

  // Helpers to evaluate time-of-day based due-ness with timezone awareness
  const normalizeTz = (tz?: string) => {
    // Many older schedules may have 'UTC' persisted; for client-side "today" checks we prefer local time over UTC.
    return tz && tz !== "UTC" ? tz : undefined;
  };
  const nowInTZ = (tz?: string) => {
    try {
      const t = normalizeTz(tz);
      return t
        ? new Date(new Date().toLocaleString("en-US", { timeZone: t }))
        : new Date();
    } catch {
      return new Date();
    }
  };

  // Format YYYY-MM-DD for a given timezone without converting to UTC
  const dateStrInTZ = (tz?: string, d?: Date) => {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: normalizeTz(tz),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(d || new Date()); // en-CA yields YYYY-MM-DD
  };

  const todayAtInTZ = (
    tz: string | undefined,
    atTime: string | null | undefined
  ) => {
    if (!atTime) return null;
    const n = nowInTZ(tz);
    const [hh, mm = "0", ss = "0"] = String(atTime).split(":");
    const d = new Date(
      n.getFullYear(),
      n.getMonth(),
      n.getDate(),
      Number(hh) || 0,
      Number(mm) || 0,
      Number(ss) || 0,
      0
    );
    return d;
  };

  // Determine if a task is due now (time reached) or later today (time in future)
  const classifyToday = (task: any) => {
    const s = schedules[task.id];
    if (!s) return { dueNow: false, later: false, when: null as Date | null };
    if (!todayTaskIds.has(task.id))
      return { dueNow: false, later: false, when: null };
    const when = todayAtInTZ(s.timezone, s.at_time);
    if (!when) {
      // No specific time, treat as due now
      return { dueNow: true, later: false, when: null };
    }
    const n = nowInTZ(s.timezone);
    // If time has already passed, mark as expired for today (not due now or later)
    if (n.getTime() > when.getTime())
      return { dueNow: false, later: false, when };
    return { dueNow: false, later: true, when };
  };

  // Compute Next Up whenever tasks/schedules change
  useEffect(() => {
    const dueToday = tasks.filter(
      (t) => todayTaskIds.has(t.id) && !t.completedToday
    );
    const withMeta = dueToday
      .map((t) => ({ t, meta: classifyToday(t) }))
      .filter((x) => x.meta.dueNow || x.meta.later);
    const later = withMeta.filter((x) => x.meta.later);
    later.sort(
      (a: any, b: any) =>
        (a.meta.when?.getTime?.() ?? 0) - (b.meta.when?.getTime?.() ?? 0)
    );
    if (later.length > 0)
      setNextUp({ task: later[0].t, when: later[0].meta.when || null });
    else setNextUp(null);
  }, [tasks, schedules, clockTick, todayTaskIds]);

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
    const body = `${nextUp.task.title} at ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    // fire-and-forget; server has per-user rate limits
    fetch("/api/push/send-to-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, url: "/dashboard" }),
    }).catch(() => {});
  }, [pushEnabled, nextUp]);

  return (
    <div className="space-y-7">
      {/* Avatar + EP Panel */}
      <section className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/70 dark:bg-slate-950/60 p-4 sm:p-5">
        <AvatarPanel />
      </section>
      {/* Player Card + Quick Actions */}
      <section className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gradient-to-br from-sky-600/15 via-indigo-600/10 to-emerald-500/10 dark:from-sky-900/25 dark:via-indigo-900/20 dark:to-emerald-900/20 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Today
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              {/* Level */}
              <span className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
                </svg>
                <span className="font-semibold">Level</span>
                <span className="tabular-nums">{progress?.level ?? "—"}</span>
              </span>
              {/* EP chip removed; progress lives in AvatarPanel */}
              {/* Diamonds & Life Streak moved into AvatarPanel */}
            </div>
          </div>
          {/* <Link
            href={{ pathname: "/food" }}
            className="self-center rounded-full px-3 py-2 text-xs sm:text-[13px] font-semibold text-slate-900 dark:text-slate-100 bg-white/20 dark:bg-slate-900/50 border border-white/30 dark:border-slate-700 hover:bg-white/30 dark:hover:bg-slate-900/60 backdrop-blur-md shadow-sm transition"
            onClick={() => {
              try { track("quick_action_use", { label: "Quick log" }); } catch {}
            }}
          >
            Quick log
          </Link> */}
        </div>
        <div
          className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-3"
          aria-label="Quick actions"
        >
          <QuickAction href="/food" emoji="🍽️" label="Log" kind="emerald" />
          <QuickAction href="/tasks" emoji="✅" label="Tasks" kind="blue" />
          <QuickAction href="/goals" emoji="🎯" label="Goals" kind="violet" />
          <QuickAction
            href="/suggestions"
            emoji="✨"
            label="Ideas"
            kind="amber"
          />
          <QuickAction
            href="/collectibles/shop"
            emoji="🛒"
            label="Collectibles"
            kind="slate"
          />
          <QuickAction
            href="/rewards"
            emoji="🎁"
            label="Rewards"
            kind="violet"
          />
        </div>
      </section>

      {/* Next Up banner (mobile-first) */}
      {nextUp && (
        <div className="inline-flex w-[240px] sm:w-[260px] items-center justify-between rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 px-6 py-4 shadow-sm">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              Next up
            </div>
            <div className="text-[13px] sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {nextUp.task.title}
            </div>
            {nextUp.when && (
              <div className="hidden sm:block text-[11px] text-slate-600 dark:text-slate-400">
                {nextUp.when.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>
          <button
            className="px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-medium bg-blue-600 text-white"
            onClick={() => {
              try {
                track("next_up_click", { taskId: nextUp.task.id });
              } catch {}
              const el = document.getElementById("later-today");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
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
          <div
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
            aria-hidden
          >
            <div className="skeleton-card h-20 rounded-2xl" />
            <div className="skeleton-card h-20 rounded-2xl" />
            <div className="skeleton-card h-20 rounded-2xl hidden md:block" />
          </div>
        ) : (
          (() => {
            const dueToday = tasks.filter(
              (t) => todayTaskIds.has(t.id) && !t.completedToday
            );
            const withMeta = dueToday
              .map((t) => ({ t, meta: classifyToday(t) }))
              .filter((x) => x.meta.dueNow || x.meta.later);
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
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    No tasks due today. Enjoy a rest or log a quick win.
                  </div>
                  <div className="mt-3">
                    <Link
                      href="/tasks"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white"
                      onClick={() => {
                        try {
                          track("quick_action_use", {
                            label: "Empty state quick log",
                          });
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
                    <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Due now
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {dueNow.map(({ t, meta }) => {
                        const rc = rarityClasses(t.ep_value);
                        return (
                          <div
                            key={t.id}
                            className={`relative rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-4 flex items-start justify-between gap-3 ${rc.card}`}
                          >
                            {/* <span className={`pointer-events-none select-none absolute top-2 right-2 z-10 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${rc.badge}`}>
                          <span className="opacity-90">{rc.label}</span>
                        </span> */}
                            <div>
                              <div className="font-semibold flex items-center gap-2">
                                {t.title}
                                {/* {t.goal?.title && (
                                  <span className="text-[8px] uppercase tracking-wide bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                                    {t.goal.title}
                                  </span>
                                )} */}
                                <span
                                  className={`ml-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${rc.badge}`}
                                >
                                  <span className="font-semibold">
                                    +{t.ep_value} EP
                                  </span>
                                </span>
                              </div>
                              {t.description && (
                                <div className="text-[11px] sm:text-xs text-slate-600 mt-1">
                                  {t.description}
                                </div>
                              )}
                            </div>
                            <button
                              disabled={!!busy || t.completedToday}
                              onClick={() => completeTask(t.id, t.ep_value)}
                              className={`rounded-full text-[11px] sm:text-xs font-medium disabled:opacity-60 flex items-center justify-center ${t.completedToday ? "bg-slate-300 text-slate-600" : "bg-blue-600 text-white"} h-9 w-9 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5`}
                              aria-label={`$${t.completedToday ? "Completed" : busy === t.id ? "Completing" : "Complete"} ${t.title}`}
                            >
                              <span className="hidden sm:inline">
                                {t.completedToday
                                  ? "Completed"
                                  : busy === t.id
                                    ? "Completing…"
                                    : "Complete"}
                              </span>
                              <span className="sm:hidden inline-flex items-center justify-center">
                                {t.completedToday ? (
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="h-5 w-5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden
                                  >
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                ) : busy === t.id ? (
                                  <svg
                                    className="h-5 w-5 animate-spin"
                                    viewBox="0 0 24 24"
                                    aria-hidden
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                      fill="none"
                                    ></circle>
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                                    ></path>
                                  </svg>
                                ) : (
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="h-5 w-5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden
                                  >
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                )}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {later.length > 0 && (
                  <div>
                    <div
                      id="later-today"
                      className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 mb-2"
                    >
                      Later today
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {later.map(({ t, meta }) => {
                        const rc = rarityClasses(t.ep_value);
                        return (
                          <div
                            key={t.id}
                            className={`relative rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-3 flex items-start justify-between gap-3 ${rc.card}`}
                          >
                            {/* <span className={`pointer-events-none select-none absolute top-2 right-2 z-10 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${rc.badge}`}>
                          <span className="opacity-90">{rc.label}</span>
                        </span> */}
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate flex items-center gap-2">
                                {t.title}
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${rc.badge}`}
                                >
                                  <span className="font-semibold">
                                    +{t.ep_value} EP
                                  </span>
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                                {meta.when && (
                                  <span className="inline-flex items-center gap-1 text-slate-500">
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-3.5 w-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden
                                    >
                                      <circle cx="12" cy="12" r="10" />
                                      <path d="M12 6v6l4 2" />
                                    </svg>
                                    {meta.when.toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              disabled={!!busy || t.completedToday}
                              onClick={() => completeTask(t.id, t.ep_value)}
                              className={`rounded-full text-[11px] sm:text-xs font-medium disabled:opacity-60 flex items-center justify-center ${t.completedToday ? "bg-slate-300 text-slate-600" : "bg-blue-600 text-white"} h-9 w-9 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5`}
                              aria-label={`$${t.completedToday ? "Completed" : busy === t.id ? "Completing" : "Complete"} ${t.title}`}
                            >
                              <span className="hidden sm:inline">
                                {t.completedToday
                                  ? "Done"
                                  : busy === t.id
                                    ? "…"
                                    : "Complete"}
                              </span>
                              <span className="sm:hidden inline-flex items-center justify-center">
                                {t.completedToday ? (
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="h-5 w-5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden
                                  >
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                ) : busy === t.id ? (
                                  <svg
                                    className="h-5 w-5 animate-spin"
                                    viewBox="0 0 24 24"
                                    aria-hidden
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                      fill="none"
                                    ></circle>
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                                    ></path>
                                  </svg>
                                ) : (
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="h-5 w-5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden
                                  >
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                )}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </section>

      {/* Life Streak + Progress & Diamonds */}
      {/* <section
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
        aria-labelledby="progress-heading"
      > */}
      {/* Life Streak Card */}
      {/* <div className="rounded-2xl border border-orange-200/70 dark:border-orange-900/50 bg-gradient-to-br from-orange-50/80 to-rose-50/60 dark:from-orange-950/30 dark:to-rose-950/20 p-5">
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
        </div> */}
      {/* <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-5 lg:col-span-2">
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
                </div> */}
      {/* Weekly consistency moved into AvatarPanel */}
      {/* </div> */}
      {/* Removed old daily streak chips in favor of Life Streak card */}
      {/* </div> */}
      {/* )} */}
      {/* </div> */}
      {/* Diamonds card removed; value shown inside AvatarPanel */}
      {/* </section> */}

      {/* Goals Overview */}
      <section className="space-y-3" aria-labelledby="goals-overview-heading">
        <h2
          id="goals-overview-heading"
          className="text-md font-semibold text-slate-900 dark:text-slate-100"
        >
          Goals Overview
        </h2>
        {goals && goals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {goals.map((g: any) => {
              const summary = goalSummaries[g.id] || {
                totalWeeks: 0,
                successWeeks: 0,
              };
              const total = Number(summary.totalWeeks || 0);
              const success = Number(summary.successWeeks || 0);
              const pct = total > 0 ? Math.round((success / total) * 100) : 0;
              const now = new Date();
              const deadline = new Date(g.deadline);
              const daysLeft = Math.max(
                0,
                Math.ceil(
                  (deadline.getTime() -
                    new Date(
                      now.getFullYear(),
                      now.getMonth(),
                      now.getDate()
                    ).getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              );
              return (
                <div
                  key={g.id}
                  className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {g.title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Deadline: {deadline.toLocaleDateString()} • Days left:{" "}
                        {daysLeft}
                      </div>
                    </div>
                    <Link
                      href="/goals"
                      className="text-[11px] px-2 py-1 rounded-full border hover:bg-slate-100/70 dark:hover:bg-slate-900/50"
                    >
                      View
                    </Link>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                      <span>Weekly streak</span>
                      <span>
                        {success}/{total} weeks ({pct}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-2.5 rounded-full bg-gradient-to-r from-blue-600 to-emerald-500"
                        style={{ width: `${Math.max(5, Math.min(100, pct))}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-5 text-center">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              No goals yet. Create your first goal to start tracking progress.
            </div>
            <div className="mt-3">
              <Link
                href="/goals"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white"
              >
                Create a goal
              </Link>
            </div>
          </div>
        )}
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
  let label = "Common";
  let card = "";
  let badge =
    "border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200";
  if (ep >= 50) {
    label = "Legendary";
    card =
      "ring-1 ring-offset-1 ring-yellow-400/50 dark:ring-yellow-500/50 ring-offset-white dark:ring-offset-slate-950";
    badge =
      "border-yellow-300 dark:border-yellow-600 bg-yellow-50/80 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200";
  } else if (ep >= 35) {
    label = "Epic";
    card =
      "ring-1 ring-offset-1 ring-purple-400/50 dark:ring-purple-500/50 ring-offset-white dark:ring-offset-slate-950";
    badge =
      "border-purple-300 dark:border-purple-600 bg-purple-50/80 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200";
  } else if (ep >= 20) {
    label = "Rare";
    card =
      "ring-1 ring-offset-1 ring-blue-400/40 dark:ring-blue-500/40 ring-offset-white dark:ring-offset-slate-950";
    badge =
      "border-blue-300 dark:border-blue-600 bg-blue-50/80 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200";
  } else if (ep >= 10) {
    label = "Uncommon";
    card =
      "ring-1 ring-offset-1 ring-emerald-400/40 dark:ring-emerald-500/40 ring-offset-white dark:ring-offset-slate-950";
    badge =
      "border-emerald-300 dark:border-emerald-600 bg-emerald-50/80 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200";
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
      className={`group block w-full sm:w-[250px] rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-600 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 active:scale-[.995] transition-transform ${className || ""}`}
      onClick={() => {
        try {
          track("quick_action_use", { label });
        } catch {}
      }}
    >
      <div
        className={`w-full h-10 sm:h-10 rounded-full border ${c.border} shadow-sm hover:shadow-md active:shadow-sm flex items-center gap-2 sm:gap-1 pl-2 pr-1.5 sm:pr-1 transition-all duration-200 ease-out ${c.tint} backdrop-blur-md overflow-hidden`}
      >
        <div
          className={`h-6 w-6 sm:h-5 sm:w-5 ${c.iconBg} ${c.iconText} rounded-full grid place-items-center text-[14px] sm:text-[12px] shadow-inner shrink-0`}
          aria-hidden
        >
          <span className="leading-none">{emoji}</span>
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
          <span className="flex-1 min-w-0 text-[11px] sm:text-[12px] font-semibold tracking-wide text-slate-900 dark:text-slate-100 whitespace-nowrap truncate">
            {label}
          </span>
          <svg
            viewBox="0 0 24 24"
            className="hidden sm:block h-3 w-3 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors shrink-0 ml-0.5"
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

"use client";
import { useEffect, useMemo, useState } from 'react';
import { createClient as createBrowserClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { CheckCircle2, Plus, Pencil, Trash2, Clock, CalendarDays, Search, ChevronDown, ChevronRight, Sun, Moon, Zap, Gem, Flame, MoreHorizontal } from 'lucide-react';
import TimezoneMismatchPrompt from '@/app/components/TimezoneMismatchPrompt';

interface Task {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  ep_value: number;
  min_level: number;
  active: boolean;
  completedToday?: boolean;
  last_completed_on?: string | null;
  goal?: { id: string; title: string } | null;
  week_count?: number;
  week_quota?: number | null;
}

interface Schedule {
  task_id: string;
  frequency: 'daily' | 'weekly' | 'custom' | 'once';
  byweekday?: number[] | null;
  at_time?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  timezone?: string | null;
}

export default function TasksPage() {
  const supabase = createBrowserClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schedules, setSchedules] = useState<Record<string, Schedule>>({});
  // Minute tick to naturally re-evaluate date-sensitive UI like "Today" after midnight
  const [clockTick, setClockTick] = useState(0);
  // Today's tasks from server API (ids only)
  const [todayTaskIds, setTodayTaskIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [newTask, setNewTask] = useState<{ title: string; description?: string; ep_value: number; min_level: number; schedule?: Partial<Schedule> & { timezone?: string; start_date?: string | null; end_date?: string | null } }>(
    { title: '', description: '', ep_value: 10, min_level: 1, schedule: { frequency: 'daily' } as any }
  );
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, Partial<Task>>>({});
  const [schedEdits, setSchedEdits] = useState<Record<string, Partial<Schedule> & { timezone?: string; start_date?: string | null; end_date?: string | null }>>({});

  // Streaks UI state
  type StreaksData = {
    goal: { id: string; title: string };
    week_quota: number;
    week_quota_current?: number;
    days: Array<{ date: string; completed: boolean; count: number }>;
    weeks: Array<{ weekStart: string; success: boolean; count: number }>;
    streaks: { consecutiveWeeks: number; longest: number };
  } | null;
  const [goalsForSelect, setGoalsForSelect] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string>('');
  const [streaksData, setStreaksData] = useState<StreaksData>(null);
  const [streaksLoading, setStreaksLoading] = useState(false);

  // UI state
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all'|'active'|'inactive'>('all');
  const [freqFilter, setFreqFilter] = useState<'all'|'daily'|'weekly'|'custom'|'once'>('all');
  const [sectionsOpen, setSectionsOpen] = useState<{today:boolean; inactive:boolean}>({ today: true, inactive: false });

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/tasks');
        const data = await res.json();
        if (!mounted) return;
        if (data.error) throw new Error(data.error);
        setTasks(data.tasks || []);
        const schedMap: Record<string, Schedule> = {};
        (data.schedules || []).forEach((s: Schedule) => {
          schedMap[s.task_id] = s;
        });
        setSchedules(schedMap);
        setError(null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load tasks');
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  // Keep UI fresh across midnight boundaries
  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch today's tasks from server using provided current instant
  useEffect(() => {
    (async () => {
      try {
        const nowIso = new Date().toISOString();
        const res = await fetch(`/api/tasks/today?now=${encodeURIComponent(nowIso)}`, { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(j.tasks)) {
          setTodayTaskIds(new Set((j.tasks as any[]).map((x) => x.id)));
        }
      } catch {}
    })();
  }, [clockTick]);

  // -------- Timezone helpers (mirror dashboard) --------
  const normalizeTz = (tz?: string | null) => {
    const t = String(tz || '').trim();
    return t || (process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || 'Asia/Kolkata');
  };
  const nowInTZ = (tz?: string | null) => {
    try {
      const t = normalizeTz(tz || undefined);
      return new Date(new Date().toLocaleString('en-US', { timeZone: t }));
    } catch {
      return new Date();
    }
  };
  const dateStrInTZ = (tz?: string | null, d?: Date) => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: normalizeTz(tz || undefined),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(d || new Date()); // YYYY-MM-DD
  };

  // Load goals for streaks selector and default selection
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/goals', { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (res.ok) {
          const gs: Array<{ id: string; title: string }> = (j.goals || []).map((g: any) => ({ id: g.id, title: g.title }));
          setGoalsForSelect(gs);
          if (!selectedGoalId && gs.length) setSelectedGoalId(gs[0].id);
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, [selectedGoalId]);

  // Load streaks when goal changes
  useEffect(() => {
    if (!selectedGoalId) { setStreaksData(null); return; }
    let mounted = true;
    (async () => {
      try {
        setStreaksLoading(true);
        const res = await fetch(`/api/goals/${selectedGoalId}/streaks`, { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (!res.ok) throw new Error(j.error || 'Failed to load streaks');
        setStreaksData(j);
      } catch (e: any) {
        setStreaksData(null);
      } finally {
        setStreaksLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [selectedGoalId]);

  async function refresh() {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (!data.error) {
        setTasks(data.tasks || []);
        const map: Record<string, Schedule> = {};
        (data.schedules || []).forEach((s: Schedule) => { map[s.task_id] = s; });
        setSchedules(map);
      }
    } catch {}
  }

  // Realtime: subscribe to changes and debounce refresh
  useEffect(() => {
    const ch = supabase.channel('rt-tasks-page');
    const trigger = () => {
      // debounce 250ms
      if ((trigger as any)._t) clearTimeout((trigger as any)._t);
      (trigger as any)._t = setTimeout(() => {
        refresh();
      }, 250);
    };
    const tables = ['tasks', 'task_completions', 'task_schedules', 'goal_tasks', 'goals'];
    for (const tbl of tables) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: tbl }, trigger);
    }
    ch.subscribe();
    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createTask() {
    try {
      setCreating(true);
      const payload: any = { title: newTask.title, description: newTask.description, ep_value: newTask.ep_value };
      if (newTask.schedule && newTask.schedule.frequency) {
        // client-side validation for one-time tasks
        if ((newTask.schedule as any).frequency === 'once') {
          const sd = (newTask.schedule as any).start_date as string | undefined;
          const at = (newTask.schedule as any).at_time as string | undefined;
          const dateOk = typeof sd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sd);
          const timeOk = typeof at === 'string' && /^\d{2}:\d{2}$/.test(String(at).slice(0,5));
          if (!dateOk || !timeOk) {
            toast.error('One time tasks need a date (YYYY-MM-DD) and time (HH:MM)');
            return;
          }
        }
        payload.schedule = newTask.schedule;
      }
      const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setNewTask({ title: '', description: '', ep_value: 10, min_level: 1, schedule: { frequency: 'daily' } as any });
      await refresh();
      toast.success('Task created');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(id: string) {
    setEditing((e) => ({ ...e, [id]: true }));
    const t = tasks.find((x) => x.id === id)!;
    setEdits((m) => ({ ...m, [id]: { title: t.title, description: t.description || '', ep_value: t.ep_value, min_level: t.min_level, active: t.active } }));
    const s = schedules[id];
    if (s) setSchedEdits((m) => ({ ...m, [id]: { ...s, timezone: (s.timezone ?? undefined) as any } }));
  }

  function cancelEdit(id: string) {
    setEditing((e) => ({ ...e, [id]: false }));
  }

  async function saveEdit(id: string) {
    try {
      setBusy(id);
      const e = edits[id] || {};
      if (Object.keys(e).length) {
        const res = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update task');
      }
      const se = schedEdits[id];
      if (se && se.frequency) {
        // client-side validation for one-time schedule updates
        if (se.frequency === 'once') {
          const sd = (se as any).start_date as string | undefined;
          const at = (se as any).at_time as string | undefined;
          const dateOk = typeof sd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sd);
          const timeOk = typeof at === 'string' && /^\d{2}:\d{2}$/.test(String(at).slice(0,5));
          if (!dateOk || !timeOk) {
            toast.error('One time tasks need a date (YYYY-MM-DD) and time (HH:MM)');
            return;
          }
        }
        const res2 = await fetch(`/api/tasks/${id}/schedule`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(se) });
        const d2 = await res2.json();
        if (!res2.ok) throw new Error(d2.error || 'Failed to update schedule');
      }
      await refresh();
      cancelEdit(id);
      toast.success('Task updated');
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    } finally {
      setBusy(null);
    }
  }

  async function deleteTask(id: string) {
    try {
      setBusy(id);
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Forbidden: you can delete only your own tasks.');
        }
        throw new Error(data.error || 'Failed to delete');
      }
      await refresh();
      toast.success('Task deleted');
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    } finally {
      setBusy(null);
    }
  }

  async function completeTask(task: Task) {
    try {
      setBusy(task.id);
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete');
      toast.success(`+${data?.completion?.ep_awarded || task.ep_value} EP`);
      if (data?.rewards?.level_up_diamonds > 0) {
        const amt = data.rewards.level_up_diamonds;
        toast.success(`Level up! +${amt} diamonds`);
      }
      // refresh list to update completedToday flags
      try {
        const res2 = await fetch('/api/tasks');
        const d2 = await res2.json();
        if (!d2.error) {
          setTasks(d2.tasks || []);
          const schedMap: Record<string, Schedule> = {};
          (d2.schedules || []).forEach((s: Schedule) => {
            schedMap[s.task_id] = s;
          });
          setSchedules(schedMap);
        }
      } catch {}
    } catch (e: any) {
      toast.error(e?.message || 'Failed to complete');
    } finally {
      setBusy(null);
    }
  }

  // Derived/grouped data
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && !t.active) return false;
        if (statusFilter === 'inactive' && t.active) return false;
      }
      const s = schedules[t.id];
      if (freqFilter !== 'all') {
        if (!s || s.frequency !== freqFilter) return false;
      }
      if (ql) {
        const hay = `${t.title} ${t.description || ''}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [tasks, schedules, q, statusFilter, freqFilter]);

  const isDueToday = (t: Task) => {
    const s = schedules[t.id];
    if (!s) return false;
    // If weekly quota exists and already met, don't show as due
    if (typeof t.week_quota === 'number' && t.week_quota !== null) {
      const done = Number(t.week_count || 0);
      if (done >= t.week_quota) return false;
    }
    const todayStr = dateStrInTZ(s.timezone);
    // If a date window exists, only show within that window (prevents lingering past end date)
    if (s.start_date) {
      const start = String(s.start_date || '').slice(0, 10);
      const end = String(s.end_date || s.start_date || '').slice(0, 10);
      if (!(todayStr >= start && todayStr <= end)) return false;
    }
    if (s.frequency === 'once') {
      // window check above suffices; ensure presence of start_date
      return Boolean(s.start_date);
    }
    if (s.frequency === 'daily') return true;
    if (s.frequency === 'weekly') {
      const dow = nowInTZ(s.timezone).getDay();
      return Array.isArray(s.byweekday) && s.byweekday.includes(dow);
    }
    return false; // custom default not due unless windowed
  };

  const grouped = useMemo(() => {
    // Do not treat past-time tasks as expired; they remain due today
    const isExpiredForToday = (_t: Task) => false;

    const todayList = filtered.filter((t) => t.active && todayTaskIds.has(t.id));
    // Consider tasks overdue (>1 day since last completion) as inactive for display, but only for daily schedules
    const isOverdue = (t: Task) => {
      if (!t.active) return false; // already inactive handled below
      const s = schedules[t.id];
      if (!s || s.frequency !== 'daily') return false; // only daily tasks can be overdue daily
      if (!t.last_completed_on) return false;
      const last = new Date(t.last_completed_on + 'T00:00:00');
      const today = new Date();
      const diffDays = Math.floor((today.getTime() - last.getTime()) / (1000*60*60*24));
      return diffDays > 1;
    };
    const inactiveList = filtered.filter((t) => !t.active || isOverdue(t));
    const activeList = filtered.filter((t) => t.active && !todayTaskIds.has(t.id) && !isOverdue(t));
    return { todayList, activeList, inactiveList };
  }, [filtered, schedules, clockTick, todayTaskIds]);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Timezone mismatch modal */}
      <TimezoneMismatchPrompt />
      {/* Header / Toolbar */}
      <div className="sticky top-0 z-10 -mx-4 sm:mx-0 bg-gray-50/70 dark:bg-gray-900/70 backdrop-blur supports-[backdrop-filter]:bg-gray-50/60 dark:supports-[backdrop-filter]:bg-gray-900/60 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-600" /> Tasks
          </h1>
          <div className="ml-auto flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search tasks..." className="w-full sm:w-64 pl-8 pr-3 py-1.5 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500/30" />
            </div>
            <button onClick={createTask} disabled={creating || !newTask.title} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60">
              <Plus className="w-4 h-4" /> {creating ? 'Creating…' : 'Add'}
            </button>
          </div>
        </div>
        {/* Quick filters */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value as any)} className="px-2 py-1.5 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-sm">
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={freqFilter} onChange={(e)=>setFreqFilter(e.target.value as any)} className="px-2 py-1.5 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-sm">
            <option value="all">All frequencies</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="custom">Custom</option>
            <option value="once">One time</option>
          </select>
          {/* Mini create inline inputs (mobile) */}
          <input value={newTask.title} onChange={(e)=>setNewTask(t=>({...t,title:e.target.value}))} placeholder="Quick add: title" className="px-2 py-1.5 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-sm" />
        </div>
      </div>

      {/* Create advanced form */}
      <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
        <div className="font-semibold mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create task
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded-lg px-3 py-2 text-sm" placeholder="Title" value={newTask.title} onChange={(e) => setNewTask((t) => ({ ...t, title: e.target.value }))} />
          <input className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded-lg px-3 py-2 text-sm" placeholder="Description" value={newTask.description} onChange={(e) => setNewTask((t) => ({ ...t, description: e.target.value }))} />
          <div className="relative">
            <input className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded-lg pl-3 pr-10 py-2 text-sm" type="number" placeholder="EP" value={newTask.ep_value} onChange={(e) => setNewTask((t) => ({ ...t, ep_value: Number(e.target.value)||0 }))} />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-900 text-gray-600">EP</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm">Schedule:</label>
            <select className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded-lg px-3 py-2 text-sm" value={(newTask.schedule as any)?.frequency || 'daily'} onChange={(e) => setNewTask((t) => ({ ...t, schedule: { ...(t.schedule||{} as any), frequency: e.target.value as any } }))}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="custom">Custom</option>
              <option value="once">One time</option>
            </select>
          </div>
          {(newTask.schedule as any)?.frequency === 'weekly' && (
            <div className="flex flex-wrap gap-1.5">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,idx)=>{
                const selected = Array.isArray((newTask.schedule as any)?.byweekday) && (newTask.schedule as any).byweekday.includes(idx);
                return (
                  <button key={d} type="button" onClick={()=>setNewTask(t=>({
                    ...t,
                    schedule: { ...(t.schedule as any), byweekday: (()=>{ const cur = new Set<number>(Array.isArray((t.schedule as any)?.byweekday)? (t.schedule as any).byweekday:[]); cur.has(idx)? cur.delete(idx): cur.add(idx); return Array.from(cur).sort(); })() }
                  }))} className={`text-xs px-2 py-1 rounded-full border ${selected? 'bg-blue-600 text-white border-blue-600':'bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700'}`}>{d}</button>
                );
              })}
            </div>
          )}
          {(newTask.schedule as any)?.frequency === 'custom' && (
            <div className="flex flex-wrap gap-1.5">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,idx)=>{
                const selected = Array.isArray((newTask.schedule as any)?.byweekday) && (newTask.schedule as any).byweekday.includes(idx);
                return (
                  <button key={d} type="button" onClick={()=>setNewTask(t=>({
                    ...t,
                    schedule: { ...(t.schedule as any), byweekday: (()=>{ const cur = new Set<number>(Array.isArray((t.schedule as any)?.byweekday)? (t.schedule as any).byweekday:[]); cur.has(idx)? cur.delete(idx): cur.add(idx); return Array.from(cur).sort(); })() }
                  }))} className={`text-xs px-2 py-1 rounded-full border ${selected? 'bg-blue-600 text-white border-blue-600':'bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700'}`}>{d}</button>
                );
              })}
            </div>
          )}
          {(newTask.schedule as any)?.frequency === 'once' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded-lg px-3 py-2 text-sm"
                value={(newTask.schedule as any)?.start_date || ''}
                onChange={(e)=> setNewTask(t=> ({...t, schedule: { ...(t.schedule as any), start_date: e.target.value, end_date: e.target.value }}))}
              />
            </div>
          )}
          <input
            type="time"
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded-lg px-3 py-2 text-sm"
            value={String((newTask.schedule as any)?.at_time || '').slice(0,5)}
            onChange={(e) => setNewTask((t) => ({ ...t, schedule: { ...(t.schedule||{} as any), at_time: e.target.value } }))}
            step={60}
            min="00:00"
            max="23:59"
          />
        </div>
        <div className="mt-3">
          <button
            disabled={(() => {
              if (creating || !newTask.title) return true;
              const s: any = newTask.schedule || {};
              if (s.frequency === 'once') {
                const sd = s.start_date as string | undefined;
                const at = s.at_time as string | undefined;
                const dateOk = typeof sd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sd);
                const timeOk = typeof at === 'string' && /^\d{2}:\d{2}$/.test(String(at).slice(0,5));
                return !(dateOk && timeOk);
              }
              return false;
            })()}
            onClick={createTask}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60 transition-colors"
          >{creating ? 'Creating…' : 'Create'}</button>
        </div>
      </div>

      {/* Streaks Panel */}
      <div className="mt-4 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-white dark:bg-gray-950 p-3 sm:p-4">
        <div className="flex items-center gap-1.5 sm:gap-2 mb-2.5 sm:mb-3">
          <Gem className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
          <div className="font-semibold">Streaks</div>
          <div className="ml-auto">
            <select value={selectedGoalId} onChange={(e)=>setSelectedGoalId(e.target.value)} className="px-2 py-1 sm:py-1.5 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-xs sm:text-sm">
              <option value="">Select goal…</option>
              {goalsForSelect.map(g=> (<option key={g.id} value={g.id}>{g.title}</option>))}
            </select>
          </div>
        </div>
        {!selectedGoalId ? (
          <div className="text-sm text-gray-600 dark:text-gray-400">Pick a goal to view weekly streaks.</div>
        ) : streaksLoading ? (
          <div className="text-sm text-gray-600 dark:text-gray-400">Loading streaks…</div>
        ) : !streaksData ? (
          <div className="text-sm text-gray-600 dark:text-gray-400">No data.</div>
        ) : (
          <div className="space-y-2.5 sm:space-y-3">
            {/* Weekly heatmap (current week) */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {streaksData.days.map((d, idx) => (
                <div key={d.date} className={`flex flex-col items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-xl border ${d.completed? 'bg-gradient-to-br from-amber-100 to-emerald-100 dark:from-amber-900/30 dark:to-emerald-900/20 border-amber-200 dark:border-amber-900 text-emerald-700 dark:text-emerald-300':'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-500'}`}>
                  <span className="text-[10px]">{['S','M','T','W','T','F','S'][idx]}</span>
                  <Gem className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${d.completed? 'text-amber-500':'text-gray-400'}`} />
                </div>
              ))}
            </div>
            {/* This week progress */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {streaksData.days.reduce((s, d) => s + (d.count || 0), 0)} / {(streaksData.week_quota_current ?? streaksData.week_quota)} this week
              </span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-600 dark:text-gray-400">Keep going to maintain your streak!</span>
            </div>
            {/* Streak stats */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">Consecutive weeks: {streaksData.streaks.consecutiveWeeks}</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900">Longest streak: {streaksData.streaks.longest}</span>
            </div>
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="mt-6 space-y-5">
        {loading ? (
          <>
            {/* Skeleton for Today */}
            <section className="rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-white dark:bg-gray-950 overflow-hidden">
              <div className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 dark:bg-blue-950/30">
                <div className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-300">Today</div>
                <span className="text-xs text-blue-700/70 dark:text-blue-300/70">—</span>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-900">
                {Array.from({length:3}).map((_,i)=>(
                  <li key={i} className="p-4">
                    <div className="flex items-start gap-3 animate-pulse">
                      <div className="mt-1 h-5 w-5 rounded-full bg-gray-200 dark:bg-gray-800"/>
                      <div className="flex-1">
                        <div className="h-4 w-1/3 bg-gray-200 dark:bg-gray-800 rounded"/>
                        <div className="mt-2 h-3 w-2/3 bg-gray-200 dark:bg-gray-800 rounded"/>
                        <div className="mt-2 h-3 w-1/4 bg-gray-200 dark:bg-gray-800 rounded"/>
                      </div>
                      <div className="h-8 w-20 bg-gray-200 dark:bg-gray-800 rounded"/>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            {/* Skeleton for Inactive section only */}
            {['Inactive'].map((label,idx)=> (
              <section key={idx} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden">
                <div className="w-full flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 font-semibold">{label}</div>
                  <span className="text-xs text-gray-500">—</span>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-gray-900">
                  {Array.from({length:3}).map((_,i)=>(
                    <li key={i} className="p-4">
                      <div className="flex items-start gap-3 animate-pulse">
                        <div className="mt-1 h-5 w-5 rounded-full bg-gray-200 dark:bg-gray-800"/>
                        <div className="flex-1">
                          <div className="h-4 w-1/3 bg-gray-200 dark:bg-gray-800 rounded"/>
                          <div className="mt-2 h-3 w-2/3 bg-gray-200 dark:bg-gray-800 rounded"/>
                        </div>
                        <div className="h-8 w-20 bg-gray-200 dark:bg-gray-800 rounded"/>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        ) : (
          <>
          {/* Today */}
          <section className="rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-white dark:bg-gray-950 overflow-visible">
            <button onClick={()=>setSectionsOpen(s=>({...s,today:!s.today}))} className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 dark:bg-blue-950/30">
              <div className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-300">
                {sectionsOpen.today ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}
              Today
              </div>
              <span className="text-xs text-blue-700/70 dark:text-blue-300/70">{grouped.todayList.length}</span>
            </button>
            {sectionsOpen.today && (
              <ul className="divide-y divide-gray-100 dark:divide-gray-900">
                {grouped.todayList.map((t) => {
                const s = schedules[t.id];
                const due = isDueToday(t);
                return (
                  <li key={t.id} className={`p-4 ${schedules[t.id]?.frequency==='once' ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}>
                    {!editing[t.id] ? (
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className="mt-1 shrink-0">
                          <CheckCircle2 className={`w-5 h-5 ${t.completedToday ? 'text-green-500' : 'text-gray-300 dark:text-gray-700'}`} />
                        </div>
                        <div className="flex-1">
                              {/* Title row with EP pill on the right */}
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[15px] sm:text-base flex items-center gap-2 flex-wrap">
                                <span className="flex-auto min-w-0 truncate">{t.title}</span>
                                {t.goal?.title && (
                                  <span className="shrink-0 text-[10px] uppercase tracking-wide bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 whitespace-nowrap">Goal: {t.goal.title}</span>
                                )}
                                {!t.active && <span className="text-[10px] uppercase tracking-wide bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded whitespace-nowrap">inactive</span>}
                              </div>
                              {t.description && (
                                <div className="text-[13px] sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 overflow-hidden" style={{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                                  {t.description}
                                </div>
                              )}
                            </div>
                            <span className="ml-2 inline-flex items-center gap-1 text-blue-700 dark:text-blue-300 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 shrink-0">+{t.ep_value} EP</span>
                          </div>
                          <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-500 mt-2 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            {s ? (
                              <span className="inline-flex items-center gap-1 flex-wrap">
                                {s.frequency === 'daily' && <Sun className="w-3.5 h-3.5"/>}
                                {s.frequency === 'weekly' && <CalendarDays className="w-3.5 h-3.5"/>}
                                {s.frequency === 'custom' && <Clock className="w-3.5 h-3.5"/>}
                                {s.frequency === 'once' && <CalendarDays className="w-3.5 h-3.5"/>}
                                <span className="px-1.5 py-0.5 sm:px-2 rounded-full border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                                  {s.frequency === 'daily' && 'Daily'}
                                  {s.frequency === 'weekly' && 'Weekly'}
                                  {s.frequency === 'custom' && 'Custom'}
                                  {s.frequency === 'once' && 'One time'}
                                </span>
                                {s.frequency === 'weekly' && Array.isArray(s.byweekday) && s.byweekday.length ? (
                                  <div className="flex flex-wrap gap-1">
                                    {s.byweekday?.map((d) => (
                                      <span key={d} className="px-1.5 py-0.5 rounded-full border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-[10px] sm:text-[11px]">
                                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d] ?? d}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {s.at_time ? (
                                  <span className="px-1.5 py-0.5 sm:px-2 rounded-full border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800">{String(s.at_time).slice(0,5)}</span>
                                ) : null}
                                {s.frequency === 'once' && s.start_date ? (
                                  <span className="px-1.5 py-0.5 sm:px-2 rounded-full border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800">{s.start_date}</span>
                                ) : null}
                              </span>
                            ) : (
                              <span>No schedule</span>
                            )}
                            {/* Mobile overflow menu */}
                            <div className="ml-auto sm:hidden relative">
                              <button aria-label="Actions" onClick={()=> setMenuOpen(prev => prev===t.id ? null : t.id)} className="h-8 w-8 rounded-md border border-gray-200 dark:border-gray-800 inline-flex items-center justify-center">
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                              {menuOpen===t.id && (
                                <div className="absolute right-0 bottom-full mb-1 w-40 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-soft z-30">
                                  <button className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-900 ${!t.completedToday && due ? 'text-blue-700 dark:text-blue-300 font-medium' : ''}`} onClick={()=>{ setMenuOpen(null); if(!t.completedToday) completeTask(t); }} disabled={!!busy || t.completedToday}>{t.completedToday? 'Completed' : 'Complete'}</button>
                                  <button className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-900" onClick={()=>{ setMenuOpen(null); startEdit(t.id); }}>Edit</button>
                                  <button className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={()=>{ setMenuOpen(null); deleteTask(t.id); }} disabled={!!busy}>Delete</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col sm:items-end gap-2 mt-2 sm:mt-0">
                          <div className="flex gap-2 w-full sm:w-auto">
                            {/* Labeled buttons on sm+ */}
                            <button onClick={() => startEdit(t.id)} className="px-2 py-1 rounded-md bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-xs hidden sm:inline-flex items-center gap-1"><Pencil className="w-3.5 h-3.5"/>Edit</button>
                            <button onClick={() => deleteTask(t.id)} disabled={!!busy} className="px-2 py-1 rounded-md bg-red-600 text-white text-xs hidden sm:inline-flex items-center gap-1 disabled:opacity-60"><Trash2 className="w-3.5 h-3.5"/>Delete</button>
                            {/* Mobile actions moved to overflow menu */}
                          </div>
                          <button
                            disabled={!!busy || t.completedToday}
                            onClick={() => completeTask(t)}
                            className={`px-2.5 py-1.5 rounded-md text-xs disabled:opacity-60 transition w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-blue-500/60 active:scale-[0.98] ${
                              t.completedToday
                                ? 'bg-gray-400 text-white'
                                : due
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                  : 'border border-blue-300 text-blue-700 dark:text-blue-300 bg-transparent hover:bg-blue-50 dark:hover:bg-blue-900/20'
                            } ${busy===t.id && !t.completedToday ? 'animate-pulse':''}`}
                          >
                            {t.completedToday ? 'Completed' : busy === t.id ? 'Completing…' : 'Complete'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded px-2 py-1" defaultValue={t.title} onChange={(e) => setEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), title: e.target.value } }))} />
                          <input className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded px-2 py-1" defaultValue={t.description || ''} onChange={(e) => setEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), description: e.target.value } }))} />
                          <input className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded px-2 py-1" type="number" defaultValue={t.ep_value} onChange={(e) => setEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), ep_value: Number(e.target.value)||0 } }))} />
                          <input className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded px-2 py-1" type="number" defaultValue={t.min_level} onChange={(e) => setEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), min_level: Number(e.target.value)||1 } }))} />
                          <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked={t.active} onChange={(e) => setEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), active: e.target.checked } }))} /> Active</label>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            <label className="text-sm">Schedule:</label>
                            <select className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded px-2 py-1" defaultValue={s?.frequency || 'daily'} onChange={(e) => setSchedEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), frequency: e.target.value as any } }))}>
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="custom">Custom</option>
                            </select>
                          </div>
                          {(s?.frequency === 'weekly' || schedEdits[t.id]?.frequency === 'weekly') && (
                            <div className="flex flex-wrap gap-1.5">
                              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,idx)=>{
                                const base = Array.isArray(s?.byweekday)? s?.byweekday: [];
                                const current = new Set<number>(Array.isArray(schedEdits[t.id]?.byweekday)? (schedEdits[t.id]?.byweekday as number[]): base);
                                const selected = (schedEdits[t.id]?.byweekday ?? base)?.includes(idx);
                                return (
                                  <button key={d} type="button" onClick={()=>setSchedEdits(m=>({
                                    ...m,
                                    [t.id]: { ...(m[t.id]||{}), byweekday: (()=>{ const cur = new Set<number>(Array.isArray(m[t.id]?.byweekday)? (m[t.id]?.byweekday as number[]): base); cur.has(idx)? cur.delete(idx): cur.add(idx); return Array.from(cur).sort(); })() }
                                  }))} className={`text-xs px-2 py-1 rounded-full border ${selected? 'bg-blue-600 text-white border-blue-600':'bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700'}`}>{d}</button>
                                );
                              })}
                            </div>
                          )}
                          {(s?.frequency === 'custom' || schedEdits[t.id]?.frequency === 'custom') && (
                            <div className="flex flex-wrap gap-1.5">
                              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,idx)=>{
                                const base = Array.isArray(s?.byweekday)? s?.byweekday: [];
                                const selected = (schedEdits[t.id]?.byweekday ?? base)?.includes(idx);
                                return (
                                  <button key={d} type="button" onClick={()=>setSchedEdits(m=>({
                                    ...m,
                                    [t.id]: { ...(m[t.id]||{}), byweekday: (()=>{ const cur = new Set<number>(Array.isArray(m[t.id]?.byweekday)? (m[t.id]?.byweekday as number[]): base); cur.has(idx)? cur.delete(idx): cur.add(idx); return Array.from(cur).sort(); })() }
                                  }))} className={`text-xs px-2 py-1 rounded-full border ${selected? 'bg-blue-600 text-white border-blue-600':'bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700'}`}>{d}</button>
                                );
                              })}
                            </div>
                          )}
                          <input className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded px-2 py-1" placeholder="At time (HH:MM)" defaultValue={s?.at_time || ''} onChange={(e) => setSchedEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), at_time: e.target.value } }))} />
                        </div>
                        <div className="flex gap-2">
                          <button disabled={!!busy} onClick={() => saveEdit(t.id)} className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-60">Save</button>
                          <button onClick={() => cancelEdit(t.id)} className="px-3 py-1.5 rounded bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800">Cancel</button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
              {!loading && !grouped.todayList.length && <li className="p-4 text-sm text-gray-500">Nothing due today</li>}
              </ul>
            )}
          </section>

          {/* Upcoming section removed */}

          {/* Inactive */}
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-visible">
          <button onClick={()=>setSectionsOpen(s=>({...s,inactive:!s.inactive}))} className="w-full flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 font-semibold">
              {sectionsOpen.inactive ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}
              Inactive
            </div>
            <span className="text-xs text-gray-500">{grouped.inactiveList.length}</span>
          </button>
          {sectionsOpen.inactive && (
            <ul className="divide-y divide-gray-100 dark:divide-gray-900">
              {grouped.inactiveList.map((t) => {
                const s = schedules[t.id];
                return (
                  <li key={t.id} className="p-4 opacity-80">
                    {!editing[t.id] ? (
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className="mt-1 shrink-0">
                          <CheckCircle2 className={`w-5 h-5 ${t.completedToday ? 'text-green-500' : 'text-gray-300 dark:text-gray-700'}`} />
                        </div>
                        <div className="flex-1">
                          {/* Title row with EP pill on the right */}
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[15px] sm:text-base flex items-center gap-2">
                                <span className="truncate">{t.title}</span>
                                {t.goal?.title && (
                                  <span className="text-[10px] uppercase tracking-wide bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 whitespace-nowrap">Goal: {t.goal.title}</span>
                                )}
                                {!t.active && <span className="text-[10px] uppercase tracking-wide bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded whitespace-nowrap">inactive</span>}
                              </div>
                              {t.description && (
                                <div className="text-[13px] sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 overflow-hidden" style={{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                                  {t.description}
                                </div>
                              )}
                            </div>
                            <span className="ml-2 inline-flex items-center gap-1 text-blue-700 dark:text-blue-300 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 shrink-0">+{t.ep_value} EP</span>
                          </div>
                          <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-500 mt-2 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            {s ? (
                              <span className="inline-flex items-center gap-1 flex-wrap">
                                {s.frequency === 'daily' && <Sun className="w-3.5 h-3.5"/>}
                                {s.frequency === 'weekly' && <CalendarDays className="w-3.5 h-3.5"/>}
                                {s.frequency === 'custom' && <Clock className="w-3.5 h-3.5"/>}
                                {s.frequency === 'once' && <CalendarDays className="w-3.5 h-3.5"/>}
                                <span className="px-1.5 py-0.5 sm:px-2 rounded-full border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                                  {s.frequency === 'daily' && 'Daily'}
                                  {s.frequency === 'weekly' && 'Weekly'}
                                  {s.frequency === 'custom' && 'Custom'}
                                  {s.frequency === 'once' && 'One time'}
                                </span>
                                {s.frequency === 'weekly' && Array.isArray(s.byweekday) && s.byweekday.length ? (
                                  <div className="flex flex-wrap gap-1">
                                    {s.byweekday?.map((d) => (
                                      <span key={d} className="px-1.5 py-0.5 rounded-full border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-[10px] sm:text-[11px]">
                                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d] ?? d}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {s.at_time ? (
                                  <span className="px-1.5 py-0.5 sm:px-2 rounded-full border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800">{String(s.at_time).slice(0,5)}</span>
                                ) : null}
                                {s.frequency === 'once' && s.start_date ? (
                                  <span className="px-1.5 py-0.5 sm:px-2 rounded-full border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800">{s.start_date}</span>
                                ) : null}
                              </span>
                            ) : (
                              <span>No schedule</span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col sm:items-end gap-2 mt-2 sm:mt-0">
                          <div className="flex gap-2 w-full sm:w-auto">
                            <button onClick={() => startEdit(t.id)} className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-sm inline-flex items-center gap-1 flex-1 sm:flex-none"><Pencil className="w-4 h-4"/>Edit</button>
                            <button onClick={() => deleteTask(t.id)} disabled={!!busy} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm inline-flex items-center gap-1 disabled:opacity-60 flex-1 sm:flex-none"><Trash2 className="w-4 h-4"/>Delete</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded px-2 py-1" defaultValue={t.title} onChange={(e) => setEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), title: e.target.value } }))} />
                          <input className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded px-2 py-1" defaultValue={t.description || ''} onChange={(e) => setEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), description: e.target.value } }))} />
                          <input className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded px-2 py-1" type="number" defaultValue={t.ep_value} onChange={(e) => setEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), ep_value: Number(e.target.value)||0 } }))} />
                          <input className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded px-2 py-1" type="number" defaultValue={t.min_level} onChange={(e) => setEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), min_level: Number(e.target.value)||1 } }))} />
                          <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked={t.active} onChange={(e) => setEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), active: e.target.checked } }))} /> Active</label>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            <label className="text-sm">Schedule:</label>
                            <select className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded px-2 py-1" defaultValue={s?.frequency || 'daily'} onChange={(e) => setSchedEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), frequency: e.target.value as any } }))}>
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="custom">Custom</option>
                            </select>
                          </div>
                          {(s?.frequency === 'weekly' || schedEdits[t.id]?.frequency === 'weekly') && (
                            <input className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded px-2 py-1" placeholder="Weekdays (e.g. 1,3,5)" defaultValue={Array.isArray(s?.byweekday)? s?.byweekday.join(',') : ''} onChange={(e) => setSchedEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), byweekday: e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n)) } }))} />
                          )}
                          <input className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded px-2 py-1" placeholder="At time (HH:MM)" defaultValue={s?.at_time || ''} onChange={(e) => setSchedEdits((m) => ({ ...m, [t.id]: { ...(m[t.id]||{}), at_time: e.target.value } }))} />
                        </div>
                        <div className="flex gap-2">
                          <button disabled={!!busy} onClick={() => saveEdit(t.id)} className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-60">Save</button>
                          <button onClick={() => cancelEdit(t.id)} className="px-3 py-1.5 rounded bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800">Cancel</button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
              {!loading && !grouped.inactiveList.length && <li className="p-4 text-sm text-gray-500">No inactive tasks</li>}
              </ul>
            )}
          </section>
          </>
        )}
      </div>
    </div>
  );
}

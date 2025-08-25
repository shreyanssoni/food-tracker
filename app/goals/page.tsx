"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient as createBrowserClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import { Sparkles, Trophy, Target, CalendarDays, Plus, Trash2, Zap, ChevronDown, ChevronRight, Flame, Gem } from "lucide-react";

type Frequency = "daily" | "weekly" | "custom";

type TemplateInput = {
  title: string;
  description?: string;
  ep_value: number;
  frequency: Frequency;
  times_per_period: number;
  byweekday?: number[] | null;
};

type Goal = {
  id: string;
  title: string;
  description?: string | null;
  start_date: string;
  deadline: string;
  status: string;
};

type Summaries = Record<string, { totalWeeks: number; successWeeks: number }>; 

const WeekdayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function GoalsPage() {
  const supabase = createBrowserClient();
  const [loading, setLoading] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [summaries, setSummaries] = useState<Summaries>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [streaksCache, setStreaksCache] = useState<Record<string, any>>({});
  const [streaksLoading, setStreaksLoading] = useState<Record<string, boolean>>({});

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [templates, setTemplates] = useState<TemplateInput[]>([]);
  const [withCollectible, setWithCollectible] = useState(true);
  const [collectibleName, setCollectibleName] = useState("");
  const [collectibleIcon, setCollectibleIcon] = useState("🏆");
  const [collectiblePrice, setCollectiblePrice] = useState<number | "">("");

  const canSubmit = useMemo(() => {
    // deadline must be strictly in the future (not today)
    const dOk = (() => {
      if (!deadline) return false;
      const d = new Date(deadline);
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      return d > start; // future only
    })();
    return title.trim().length > 0 && dOk && templates.length > 0 && templates.every(t => t.title.trim().length > 0 && t.times_per_period > 0 && t.ep_value >= 0 && t.ep_value <= 200);
  }, [title, deadline, templates]);

  useEffect(() => {
    void refresh();
  }, []);

  // Realtime: subscribe to goals and related tables; debounce refresh
  useEffect(() => {
    const ch = supabase.channel('rt-goals-page');
    const trigger = () => {
      if ((trigger as any)._t) clearTimeout((trigger as any)._t);
      (trigger as any)._t = setTimeout(() => { void refresh(); }, 250);
    };
    const tables = ['goals', 'goal_tasks', 'goal_task_templates'];
    for (const tbl of tables) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: tbl }, trigger);
    }
    ch.subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    try {
      const res = await fetch("/api/goals", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to load goals");
      setGoals(j.goals || []);
      setSummaries(j.summaries || {});
    } catch (e: any) {
      toast.error(e.message || "Failed to load goals");
    }
  }

  async function fetchStreaks(goalId: string) {
    if (streaksCache[goalId] || streaksLoading[goalId]) return;
    setStreaksLoading(prev => ({ ...prev, [goalId]: true }));
    try {
      const res = await fetch(`/api/goals/${goalId}/streaks`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to load streaks");
      setStreaksCache(prev => ({ ...prev, [goalId]: j }));
    } catch (e: any) {
      toast.error(e.message || "Failed to load streaks");
    } finally {
      setStreaksLoading(prev => ({ ...prev, [goalId]: false }));
    }
  }

  async function refetchStreaks(goalId: string) {
    setStreaksLoading(prev => ({ ...prev, [goalId]: true }));
    try {
      const res = await fetch(`/api/goals/${goalId}/streaks`, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to refresh streaks');
      setStreaksCache(prev => ({ ...prev, [goalId]: j }));
    } catch (e: any) {
      toast.error(e.message || 'Failed to refresh streaks');
    } finally {
      setStreaksLoading(prev => ({ ...prev, [goalId]: false }));
    }
  }

  function updateTemplate(i: number, patch: Partial<TemplateInput>) {
    setTemplates(prev => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  }
  function addTemplate() {
    setTemplates(prev => [
      ...prev,
      {
        title: "",
        description: "",
        ep_value: 10,
        frequency: "weekly",
        times_per_period: 3,
        byweekday: [],
      },
    ]);
  }
  function removeTemplate(i: number) {
    setTemplates(prev => prev.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast.error("Please fix validation errors before submitting (deadline must be future, EP <= 200)");
      return;
    }
    setLoading(true);
    try {
      const payload: any = {
        title,
        description: description || undefined,
        deadline,
        templates: templates.map(t => ({
          title: t.title,
          description: t.description || undefined,
          ep_value: Number(t.ep_value),
          frequency: t.frequency,
          times_per_period: Number(t.times_per_period),
          byweekday: Array.isArray(t.byweekday) ? t.byweekday : null,
        }))
      };
      if (withCollectible && collectibleName.trim()) {
        if (collectibleName.trim()) {
          payload.collectible = {
            name: collectibleName.trim(),
            icon: collectibleIcon || undefined,
            price: collectiblePrice === "" ? undefined : Number(collectiblePrice),
          };
        }
      }
      const res = await fetch("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to create goal");
      toast.success("Goal created");
      // reset minimal
      setTitle("");
      setDescription("");
      setDeadline("");
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Create failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Hero header */}
      <div className="rounded-3xl p-5 border border-gray-200/70 dark:border-gray-800/70 bg-gradient-to-br from-blue-600/10 via-emerald-500/10 to-purple-500/10 dark:from-blue-600/10 dark:via-emerald-500/10 dark:to-purple-500/10 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white flex items-center justify-center shadow">
            <Trophy className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">Goals & Streaks</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">Create quests, stack streaks, and earn rewards</p>
          </div>
          {/* <button
            type="button"
            onClick={addTemplate}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm bg-gradient-to-tr from-blue-600 to-emerald-500 text-white shadow hover:opacity-95"
          >
            <Plus className="h-4 w-4" /> New task template
          </button> */}
        </div>
      </div>

      {/* Create form */}
      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-3xl border border-gray-200/70 dark:border-gray-800/70 p-4 md:p-5 bg-white/70 dark:bg-gray-900/60">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1"><Target className="h-3.5 w-3.5"/>Goal Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 10k Steps Daily" className="mt-1 w-full rounded-xl border border-gray-300/70 dark:border-gray-700/70 bg-transparent px-3 py-2" required />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5"/> Deadline</label>
            <input
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              min={(() => { const t=new Date(); const d=new Date(t.getFullYear(), t.getMonth(), t.getDate()+1); return d.toISOString().slice(0,10); })()}
              className="mt-1 w-full rounded-xl border border-gray-300/70 dark:border-gray-700/70 bg-transparent px-3 py-2"
              required
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Share your why…" className="mt-1 w-full rounded-xl border border-gray-300/70 dark:border-gray-700/70 bg-transparent px-3 py-2" rows={2} />
        </div>

        {/* Templates */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-500"/> Task templates
            </div>
            <button type="button" onClick={addTemplate} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-gradient-to-tr from-blue-600 to-emerald-500 text-white shadow">
              <Plus className="h-4 w-4"/> Add template
            </button>
          </div>
          {templates.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300/70 dark:border-gray-700/70 p-6 text-center text-sm text-gray-600 dark:text-gray-400">
              No templates yet. Click "Add template" to design the tasks that power this goal.
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 dark:bg-gray-900/70 border border-gray-200/70 dark:border-gray-800/70">
                <Zap className="h-4 w-4 text-amber-500"/> Tip: Weekly templates with clear weekdays help build strong streaks
              </div>
            </div>
          )}
          {templates.map((t, i) => (
            <div key={i} className="rounded-2xl border border-gray-200/70 dark:border-gray-800/70 p-3 bg-white/60 dark:bg-gray-900/50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Task Title</label>
                  <input value={t.title} onChange={e => updateTemplate(i, { title: e.target.value })} placeholder="e.g. Evening Walk"
                         className="mt-1 w-full rounded-xl border border-gray-300/70 dark:border-gray-700/70 bg-transparent px-3 py-2" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Frequency</label>
                  <select value={t.frequency} onChange={e => updateTemplate(i, { frequency: e.target.value as Frequency })} className="mt-1 w-full rounded-xl border border-gray-300/70 dark:border-gray-700/70 bg-transparent px-3 py-2">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Times per period</label>
                  <input type="number" min={1} value={t.times_per_period} onChange={e => {
                    const val = Math.max(1, Number(e.target.value || 1));
                    updateTemplate(i, { times_per_period: val });
                  }} className="mt-1 w-full rounded-xl border border-gray-300/70 dark:border-gray-700/70 bg-transparent px-3 py-2" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">EP value</label>
                  <input type="number" min={0} max={200} value={t.ep_value} onChange={e => {
                    let v = Number(e.target.value);
                    if (isNaN(v)) v = 0;
                    v = Math.max(0, Math.min(200, v));
                    updateTemplate(i, { ep_value: v });
                  }} className="mt-1 w-full rounded-xl border border-gray-300/70 dark:border-gray-700/70 bg-transparent px-3 py-2" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Weekdays (for weekly/custom)</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {WeekdayNames.map((name, idx) => {
                      const selected = (t.byweekday || []).includes(idx);
                      return (
                        <button type="button" key={idx} onClick={() => {
                          const set = new Set(t.byweekday || []);
                          if (set.has(idx)) set.delete(idx); else set.add(idx);
                          updateTemplate(i, { byweekday: Array.from(set).sort((a,b)=>a-b) });
                        }}
                        className={`px-2.5 py-1.5 rounded-full text-xs border transition ${selected ? "bg-gradient-to-tr from-blue-600 to-emerald-500 text-white border-transparent shadow" : "border-gray-300/70 dark:border-gray-700/70 hover:bg-gray-100/60 dark:hover:bg-white/5"}`}
                        >{name}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Description</label>
                <input value={t.description || ""} onChange={e => updateTemplate(i, { description: e.target.value })} placeholder="Short helpful note"
                       className="mt-1 w-full rounded-xl border border-gray-300/70 dark:border-gray-700/70 bg-transparent px-3 py-2" />
              </div>
              <div className="mt-2 flex justify-between items-center">
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                  <Sparkles className="h-3.5 w-3.5"/> {(t.ep_value || 0)} EP • {t.frequency}
                </span>
                <button type="button" onClick={() => removeTemplate(i)} className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:opacity-90">
                  <Trash2 className="h-4 w-4"/> Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Private collectible */}
        <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800/70 p-3 bg-white/60 dark:bg-gray-900/50">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withCollectible} onChange={e => setWithCollectible(e.target.checked)} />
            Create private collectible reward for this goal
          </label>
          {withCollectible && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Name</label>
                <input value={collectibleName} onChange={e => setCollectibleName(e.target.value)} placeholder="e.g., Milestone Trophy" className="mt-1 w-full rounded-xl border border-gray-300/70 dark:border-gray-700/70 bg-transparent px-3 py-2" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Icon (emoji or URL)</label>
                <input value={collectibleIcon} onChange={e => setCollectibleIcon(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-300/70 dark:border-gray-700/70 bg-transparent px-3 py-2" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Price (optional)</label>
                <input type="number" min={0} value={collectiblePrice} onChange={e => setCollectiblePrice(e.target.value === "" ? "" : Number(e.target.value))} className="mt-1 w-full rounded-xl border border-gray-300/70 dark:border-gray-700/70 bg-transparent px-3 py-2" />
                <div className="text-[11px] text-gray-500 mt-1">Minimum is auto-enforced: 3x weekly EP</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button disabled={!canSubmit || loading} className="px-4 py-2 rounded-full text-sm bg-gradient-to-tr from-blue-600 to-emerald-500 text-white disabled:opacity-60 shadow">
            {loading ? "Creating..." : "Create Goal"}
          </button>
        </div>
      </form>

      {/* Existing goals */}
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Your Goals</h2>
        {(goals || []).length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-400">No goals yet. Create one above.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {goals.map(g => (
              <GoalCard
                key={g.id}
                goal={g}
                summary={summaries[g.id]}
                expanded={!!expanded[g.id]}
                onToggle={() => {
                  setExpanded(prev => ({ ...prev, [g.id]: !prev[g.id] }));
                  if (!expanded[g.id]) void fetchStreaks(g.id);
                }}
                streaksData={streaksCache[g.id]}
                streaksLoading={!!streaksLoading[g.id]}
                onRefetchStreaks={() => refetchStreaks(g.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GoalCard({
  goal,
  summary,
  expanded,
  onToggle,
  streaksData,
  streaksLoading,
  onRefetchStreaks,
}: {
  goal: Goal;
  summary?: { totalWeeks: number; successWeeks: number };
  expanded: boolean;
  onToggle: () => void;
  streaksData?: any;
  streaksLoading?: boolean;
  onRefetchStreaks?: () => void;
}) {
  const now = new Date();
  const start = new Date(goal.start_date);
  const deadline = new Date(goal.deadline);
  const pastDeadline = deadline <= now;
  const total = summary?.totalWeeks ?? 0;
  const success = summary?.successWeeks ?? 0;
  const pct = total > 0 ? Math.round((success / total) * 100) : 0;
  const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / (1000*60*60*24)));

  async function onRevive() {
    try {
      const res = await fetch(`/api/goals/${goal.id}/streaks/revive`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Revive failed');
      toast.success('Streak revived');
      onRefetchStreaks && onRefetchStreaks();
    } catch (e: any) {
      toast.error(e.message || 'Revive failed');
    }
  }

  return (
    <div className="rounded-3xl border border-gray-200/70 dark:border-gray-800/70 bg-white/70 dark:bg-gray-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onToggle} className="flex items-start gap-3 flex-1 text-left">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white flex items-center justify-center">
            <Target className="h-5 w-5"/>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1">
              <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{goal.title}</div>
              {expanded ? <ChevronDown className="h-4 w-4 text-gray-400"/> : <ChevronRight className="h-4 w-4 text-gray-400"/>}
            </div>
            <div className="text-xs text-gray-500 mt-1">Deadline: {deadline.toLocaleDateString()} • Days left: {daysLeft}</div>
          </div>
        </button>
        <span className={`px-2 py-1 rounded-full text-xs ${pastDeadline ? "bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300" : "bg-emerald-100 text-emerald-700"}`}>
          {pastDeadline ? "Ended" : "In progress"}
        </span>
      </div>

      {/* Compact progress row */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
          <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-emerald-500"/> Weekly streak</span>
          <span>{success}/{total} weeks ({pct}%)</span>
        </div>
        <div className="mt-1.5 h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div className="h-2.5 rounded-full bg-gradient-to-r from-blue-600 to-emerald-500" style={{ width: `${Math.max(5, Math.min(100, pct))}%` }}/>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 rounded-2xl border border-gray-200/70 dark:border-gray-800/70 p-3 bg-white/60 dark:bg-gray-900/50">
          {/* Description */}
          {goal.description ? (
            <div className="text-sm text-gray-700 dark:text-gray-300">{goal.description}</div>
          ) : null}

          {/* Progress from start */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>Progress since {start.toLocaleDateString()}</span>
              <span>{success}/{total} weeks ({pct}%)</span>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div className="h-2.5 rounded-full bg-gradient-to-r from-blue-600 to-emerald-500" style={{ width: `${Math.max(5, Math.min(100, pct))}%` }}/>
            </div>
          </div>

          {/* Streaks (current week) */}
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">This week</div>
              {streaksLoading ? (
                <div className="text-xs text-gray-500">Loading…</div>
              ) : null}
            </div>
            {streaksData ? (
              <div className="mt-2 space-y-2">
                {/* Heatmap-like week row (scroll on mobile) */}
                <div className="-mx-1 overflow-x-auto no-scrollbar">
                  <div className="px-1 inline-flex items-center gap-1 min-w-max">
                    {(streaksData.days || []).slice(-7).map((d: any, idx: number) => {
                      const cls = d.revived
                        ? 'bg-blue-100 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300'
                        : d.missed
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900 text-red-600 dark:text-red-300'
                          : d.completed
                            ? 'bg-gradient-to-br from-amber-100 to-emerald-100 dark:from-amber-900/30 dark:to-emerald-900/20 border-amber-200 dark:border-amber-900 text-emerald-700 dark:text-emerald-300'
                            : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-500';
                      const iconCls = d.revived ? 'text-blue-500' : d.completed ? 'text-amber-500' : d.missed ? 'text-red-400' : 'text-gray-400';
                      return (
                        <div key={d.date}
                             className={`flex flex-col items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl border ${cls}`}>
                          <span className="text-[10px]">{['S','M','T','W','T','F','S'][idx]}</span>
                          <Gem className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${iconCls}`}/>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* This week progress */}
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                    <Flame className="w-4 h-4" />
                    {(streaksData.days || []).reduce((s: number, d: any) => s + (d.count || 0), 0)} / {(streaksData.week_quota_current ?? streaksData.week_quota)} this week
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-600 dark:text-gray-400">Keep going to maintain your streak!</span>
                </div>
                {/* Streak stats */}
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">Consecutive weeks: {streaksData.streaks?.consecutiveWeeks ?? 0}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900">Longest streak: {streaksData.streaks?.longest ?? 0}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">Daily: {streaksData.streaks?.dailyCurrent ?? 0} current • {streaksData.streaks?.dailyLongest ?? 0} longest</span>
                </div>
                {/* Revive action */}
                {streaksData.revive?.eligible ? (
                  <div className="pt-1">
                    <button onClick={onRevive} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-full text-sm bg-blue-600 text-white hover:opacity-95">
                      <Gem className="w-4 h-4"/>
                      Revive yesterday (-{streaksData.revive?.cost ?? 20} diamonds)
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-gray-500">Expand to load streaks</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { createClient } from '@/utils/supabase/client';

type NutritionTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type FoodLog = {
  id: string;
  food_name?: string; // legacy/local use for UI; DB uses items jsonb
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  eaten_at: string;
  items?: Array<{ name: string; quantity?: string | null }>; // DB column
  note?: string | null;
};

type Suggestion = {
  greeting: string;
  suggestion: string;
  nextMealSuggestion: string;
};

export default function SuggestionsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const [targets, setTargets] = useState<NutritionTotals | null>(null);
  const [todayTotals, setTodayTotals] = useState<NutritionTotals>({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [avgCalories7d, setAvgCalories7d] = useState<number | null>(null);
  const [recentMeals, setRecentMeals] = useState<FoodLog[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<any>({});
  const [genLoading, setGenLoading] = useState(false);
  const [generatedMeals, setGeneratedMeals] = useState<Array<{ name: string; why?: string }>>([]);
  const [nextMealIdea, setNextMealIdea] = useState<string | null>(null);
  // Grocery inventory & generation controls
  type InvItem = { id: string; name: string; qty: number; unit: string };
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [newItem, setNewItem] = useState<{ name: string; qty: string; unit: string }>({ name: '', qty: '', unit: 'unit' });
  const [strictness, setStrictness] = useState<number>(40); // 0 random -> 100 strictly use inventory
  const [mealType, setMealType] = useState<string>('auto');

  // Weekly chart state
  type DayTotals = NutritionTotals & { date: string };
  const [weekOffset, setWeekOffset] = useState<number>(0); // 0=current week, 1=previous week, etc.
  const [weekTotals, setWeekTotals] = useState<DayTotals[]>([]);

  function startOfWeekLocal(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay(); // 0 Sun - 6 Sat
    const diff = (day === 0 ? -6 : 1) - day; // make Monday=first day
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function endOfWeekLocal(start: Date) {
    const e = new Date(start);
    e.setDate(e.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    return e;
  }

  async function loadWeek(offset: number) {
    if (!session?.user?.id) return;
    // compute week range in local time
    const base = new Date();
    base.setDate(base.getDate() - offset * 7);
    const start = startOfWeekLocal(base);
    const end = endOfWeekLocal(start);
    const { data, error } = await supabase
      .from('food_logs')
      .select('eaten_at,calories,protein_g,carbs_g,fat_g')
      .gte('eaten_at', start.toISOString())
      .lte('eaten_at', end.toISOString());
    if (error) return;
    // initialize 7 days
    const days: DayTotals[] = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const label = d.toLocaleDateString(undefined, { weekday: 'short' });
      return { date: label, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    });
    (data || []).forEach((l: any) => {
      const dt = new Date(l.eaten_at);
      // index by day difference from start
      const idx = Math.max(0, Math.min(6, Math.floor((dt.getTime() - start.getTime()) / (24 * 3600 * 1000))));
      days[idx].calories += Number(l.calories) || 0;
      days[idx].protein_g += Number(l.protein_g) || 0;
      days[idx].carbs_g += Number(l.carbs_g) || 0;
      days[idx].fat_g += Number(l.fat_g) || 0;
    });
    setWeekTotals(days);
  }

  // Helper: derive display name from log
  const displayName = (log: Partial<FoodLog>) => {
    if (log.food_name && log.food_name.trim()) return log.food_name.trim();
    const names = Array.isArray(log.items) ? log.items.map((i) => i?.name).filter(Boolean) : [];
    if (names.length) return names.slice(0, 3).join(', ');
    return 'Quick meal';
  };

  async function addInventoryItem() {
    if (!newItem.name.trim()) return;
    const body = { name: newItem.name.trim(), qty: Number(newItem.qty) || 1, unit: newItem.unit || 'unit' };
    try {
      const resp = await fetch('/api/groceries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (resp.ok) {
        const created = await resp.json();
        setInventory((arr) => [created, ...arr]);
        setNewItem({ name: '', qty: '', unit: 'unit' });
      }
    } catch {}
  }

  async function updateInventoryItem(id: string, patch: Partial<InvItem>) {
    const prev = inventory;
    setInventory((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    try {
      await fetch(`/api/groceries/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    } catch {
      setInventory(prev);
    }
  }

  async function removeInventoryItem(id: string) {
    const prev = inventory;
    setInventory((arr) => arr.filter((it) => it.id !== id));
    try {
      await fetch(`/api/groceries/${id}`, { method: 'DELETE' });
    } catch {
      setInventory(prev);
    }
  }

  useEffect(() => {
    const initPage = async () => {
      if (!session?.user?.id) return;
      setLoading(true);
      try {
        // Get targets (preferences API consolidates values)
        try {
          const prefRes = await fetch('/api/preferences');
          const prefJson = await prefRes.json();
          const t = prefJson?.targets as NutritionTotals | undefined;
          if (t) setTargets(t);
          if (prefJson) setPreferences(prefJson);
        } catch {}

        // Get today's nutrition data (use local start/end to avoid UTC offset issues)
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const { data: todayLogs, error: logsError } = await supabase
          .from('food_logs')
          .select('calories,protein_g,carbs_g,fat_g')
          .gte('eaten_at', start.toISOString())
          .lte('eaten_at', end.toISOString());

        if (logsError) {
          throw new Error('Failed to fetch today\'s logs');
        }

        const totals = (todayLogs || []).reduce(
          (acc, log) => ({
            calories: acc.calories + (Number(log.calories) || 0),
            protein_g: acc.protein_g + (Number(log.protein_g) || 0),
            carbs_g: acc.carbs_g + (Number(log.carbs_g) || 0),
            fat_g: acc.fat_g + (Number(log.fat_g) || 0),
          }),
          { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } as NutritionTotals
        );
        setTodayTotals(totals);

        // Fetch 7-day logs for average calories
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: last7d, error: last7dError } = await supabase
          .from('food_logs')
          .select('calories')
          .gte('eaten_at', sevenDaysAgo);
        if (!last7dError && last7d) {
          const sum = last7d.reduce((s, l) => s + (Number(l.calories) || 0), 0);
          setAvgCalories7d(Math.round(sum / Math.max(1, last7d.length)));
        }

        // Fetch recent meals
        const { data: recent } = await supabase
          .from('food_logs')
          .select('*')
          .order('eaten_at', { ascending: false })
          .limit(12);
        // Deduplicate by normalized display name and limit to 4 random unique
        if (recent && Array.isArray(recent)) {
          const normalize = (l: any) => {
            if (Array.isArray(l.items) && l.items.length) {
              return l.items
                .map((i: any) => String(i?.name || '').trim().toLowerCase())
                .filter(Boolean)
                .join(', ');
            }
            if (l.food_name) return String(l.food_name).trim().toLowerCase();
            return '';
          };
          const uniqMap = new Map<string, any>();
          for (const r of recent) {
            const key = normalize(r);
            if (!key) continue;
            if (!uniqMap.has(key)) uniqMap.set(key, r);
          }
          const uniques = Array.from(uniqMap.values());
          // shuffle
          uniques.sort(() => Math.random() - 0.5);
          setRecentMeals(uniques.slice(0, 4));
        } else {
          setRecentMeals([]);
        }

        // Load groceries from API (source of truth)
        try {
          const resp = await fetch('/api/groceries');
          if (resp.ok) {
            const items = await resp.json();
            setInventory(items || []);
          }
        } catch {}

        // Set loading done for non-AI content
        setLoading(false);

        // Do not auto-generate AI suggestion on load

      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to load suggestions');
        setLoading(false);
      }
    };
    // Load generation controls from localStorage (optional)
    try {
      const rawS = localStorage.getItem('ft.strictness');
      if (rawS) setStrictness(Number(rawS));
      const rawT = localStorage.getItem('ft.mealType');
      if (rawT) setMealType(rawT);
    } catch {}
    initPage();
  }, [session?.user?.id]);

  // Load weekly data when session or offset changes
  useEffect(() => {
    loadWeek(weekOffset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, weekOffset]);

  const gaps = useMemo(() => {
    if (!targets) return null;
    return {
      calories: Math.max(0, Math.round(targets.calories - todayTotals.calories)),
      protein_g: Math.max(0, Math.round(targets.protein_g - todayTotals.protein_g)),
      carbs_g: Math.max(0, Math.round(targets.carbs_g - todayTotals.carbs_g)),
      fat_g: Math.max(0, Math.round(targets.fat_g - todayTotals.fat_g)),
    } as NutritionTotals;
  }, [targets, todayTotals]);


  async function addQuick(log: Partial<FoodLog> & { id?: string }) {
    if (!session?.user?.id) return;
    try {
      setAddingId(log.id || log.food_name || 'adding');
      const nameOnly = (Array.isArray(log.items) && log.items.length) ? '' : (log.food_name || '');
      let payload: any = null;
      if (nameOnly) {
        // Get robust macros via AI parse for name-only presets/generated
        const res = await fetch('/api/ai/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: nameOnly })
        });
        if (res.ok) {
          const data = await res.json();
          payload = data?.log || null;
        }
      }
      const baseItems = Array.isArray(log.items) && log.items.length
        ? log.items.map((i) => ({ name: String(i.name), quantity: i.quantity ?? null }))
        : (nameOnly ? [{ name: String(nameOnly), quantity: null }] : []);
      const finalLog = payload ? { ...payload } : {
        calories: log.calories,
        protein_g: log.protein_g,
        carbs_g: log.carbs_g,
        fat_g: log.fat_g,
        items: baseItems,
      };
      // Ensure calories if macros exist
      if ((finalLog?.calories == null || isNaN(finalLog.calories)) && [finalLog?.protein_g, finalLog?.carbs_g, finalLog?.fat_g].every((v: any) => typeof v === 'number')) {
        const cals = Math.round((finalLog.protein_g || 0) * 4 + (finalLog.carbs_g || 0) * 4 + (finalLog.fat_g || 0) * 9);
        if (cals > 0) finalLog.calories = cals;
      }
      const insert = {
        user_id: session.user.id,
        calories: Number(finalLog?.calories ?? 0),
        protein_g: Number(finalLog?.protein_g ?? 0),
        carbs_g: Number(finalLog?.carbs_g ?? 0),
        fat_g: Number(finalLog?.fat_g ?? 0),
        eaten_at: new Date().toISOString(),
        items: Array.isArray(finalLog?.items) ? finalLog.items : baseItems,
      } as any;
      const { error } = await supabase.from('food_logs').insert(insert);
      if (error) throw error;
      setTodayTotals((t) => ({
        calories: t.calories + (insert.calories || 0),
        protein_g: t.protein_g + (insert.protein_g || 0),
        carbs_g: t.carbs_g + (insert.carbs_g || 0),
        fat_g: t.fat_g + (insert.fat_g || 0),
      }));
      setJustAddedId(log.id || log.food_name || 'added');
      setToast(`Added: ${displayName({ food_name: nameOnly, items: insert.items })}`);
      setTimeout(() => setToast(null), 2500);
    } catch (e: any) {
      console.error('Failed to quick add', e);
      const msg = (e && (e.message || e?.error?.message)) || (typeof e === 'string' ? e : 'Failed to add meal.');
      setError(msg);
      setToast(msg);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setAddingId(null);
    }
  }

  // Magic: Generate meals (3 ideas) using AI
  async function generateMeals() {
    if (!session?.user?.id) return;
    try {
      setGenLoading(true);
      setGeneratedMeals([]);
      setNextMealIdea(null);
      const hours = new Date().getHours();
      let timeOfDay = hours < 12 ? 'morning' : hours < 17 ? 'afternoon' : 'evening';
      const targetsForCall = targets;
      const gapsForCall = targetsForCall ? {
        calories: Math.max(0, Math.round(targetsForCall.calories - todayTotals.calories)),
        protein_g: Math.max(0, Math.round(targetsForCall.protein_g - todayTotals.protein_g)),
        carbs_g: Math.max(0, Math.round(targetsForCall.carbs_g - todayTotals.carbs_g)),
        fat_g: Math.max(0, Math.round(targetsForCall.fat_g - todayTotals.fat_g)),
      } as NutritionTotals : null;
      // Add fetch timeout to avoid hanging spinner
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const response = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeOfDay,
          totals: todayTotals,
          preferences,
          targets: targetsForCall,
          gaps: gapsForCall,
          generateCount: 3,
          generation: {
            strictness,
            mealType,
          },
          inventory: inventory.map(({ name, qty, unit }) => ({ name, qty, unit })),
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.ok) {
        const data = await response.json();
        const ideas: Array<{ name: string; why?: string }> = Array.isArray(data?.mealIdeas) ? data.mealIdeas : [];
        setGeneratedMeals(ideas);
        if (ideas.length > 0 && ideas[0]?.name) {
          setNextMealIdea(ideas[0].name);
        }
      } else {
        const data = await response.json().catch(() => ({}));
        const msg = data?.error || data?.hint || (response.status === 429 ? 'AI is rate limited. Try again shortly.' : 'Could not generate meals right now.');
        setError(msg);
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
      }
    } catch (e: any) {
      console.error('Failed to generate meals', e);
      const isAbort = (e?.name === 'AbortError');
      const msg = isAbort ? 'AI took too long. Please try again.' : 'Could not generate meals right now.';
      setError(msg);
      setToast(msg);
      setTimeout(() => setToast(null), 2500);
    } finally {
      setGenLoading(false);
    }
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Sign in to see personalized suggestions</h2>
        <p className="text-gray-600 mb-4">Get AI-powered meal recommendations based on your preferences and history</p>
        <a href="/auth/signin" className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          Sign In
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-hidden>
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-6 border border-gray-100 dark:border-gray-800">
          <div className="skeleton-line w-1/3 mb-4" />
          <div className="space-y-2">
            <div className="skeleton-line w-2/3" />
            <div className="skeleton-line w-1/2" />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-6 border border-gray-100 dark:border-gray-800">
          <div className="skeleton-line w-1/2 mb-3" />
          <div className="skeleton-line w-3/4" />
        </div>
        <div className="bg-blue-50 rounded-xl p-6">
          <div className="skeleton-line w-1/4 mb-3" />
          <div className="skeleton-line w-2/3" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 my-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* Greeting + Next Meal */}
      <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-6 border border-gray-100 dark:border-gray-800">
        <h2 className="text-xl font-semibold mb-1">Hello{suggestion?.greeting ? `, ${suggestion.greeting}` : ''}!</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Here’s a plan tailored for the rest of your {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-4">
            <h3 className="font-medium mb-2">Next meal idea</h3>
            {genLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300" role="status" aria-busy>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                Generating suggestion…
              </div>
            ) : (
              <p className="text-gray-800 dark:text-gray-100 text-sm whitespace-pre-wrap">{nextMealIdea || 'click on magic button for magic show'}</p>
            )}
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={generateMeals} className="text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800" disabled={genLoading} aria-busy={genLoading}>
                  {genLoading ? 'Generating…' : '✨ Magic: Generate meals'}
                </button>
                {nextMealIdea && (
                  <button
                    onClick={() => router.push(`/recipes?name=${encodeURIComponent(nextMealIdea)}`)}
                    className="text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    View recipe
                  </button>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <label className="font-medium">Strictness</label>
                  <input type="range" min={0} max={100} value={strictness} onChange={(e) => setStrictness(Number(e.target.value))} className="w-28" />
                  <span className="w-8 text-right">{strictness}</span>
                </div>
                <div className="text-xs">
                  <select value={mealType} onChange={(e) => setMealType(e.target.value)} className="px-2 py-1 rounded border bg-white dark:bg-gray-900">
                    <option value="auto">Auto</option>
                    <option value="snack">Snack</option>
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="full_meal">Full meal</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-4">
            <h3 className="font-medium mb-2">What to aim for</h3>
            {gaps ? (
              <ul className="text-sm text-gray-700 dark:text-gray-200 space-y-1">
                <li><span className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 mr-2">Protein</span> ~{gaps.protein_g}g remaining</li>
                <li><span className="inline-block px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 mr-2">Carbs</span> ~{gaps.carbs_g}g remaining</li>
                <li><span className="inline-block px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 mr-2">Fats</span> ~{gaps.fat_g}g remaining</li>
                <li className="text-xs text-gray-500 dark:text-gray-400 mt-1">Calories left: {gaps.calories} kcal</li>
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Add your profile to see personalized targets.</p>
            )}
          </div>
        </div>
      </div>

      {/* AI meal ideas (moved just below generation area) */}
      {generatedMeals.length > 0 && (
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-5 bg-white dark:bg-gray-950">
          <h3 className="font-medium text-lg mb-2">AI meal ideas</h3>
          <div className="space-y-3">
            {generatedMeals.map((g, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
                <div>
                  <div className="text-sm font-medium">{g.name}</div>
                  {g.why && <div className="text-xs text-gray-500 dark:text-gray-400">{g.why}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => router.push(`/recipes?name=${encodeURIComponent(g.name)}`)} className="text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800">
                    View recipe
                  </button>
                  <button onClick={() => addQuick({ id: `gen-${idx}`, food_name: g.name })} className="text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800">
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress • Weekly chart */}
      <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-6 border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-lg">Progress</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset((v) => v + 1)}
              className="text-xs px-2 py-1 rounded border hover:bg-gray-50 dark:hover:bg-gray-800"
              title="Previous week"
            >← Prev</button>
            <button
              onClick={() => setWeekOffset((v) => Math.max(0, v - 1))}
              className="text-xs px-2 py-1 rounded border hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              disabled={weekOffset === 0}
              title="Next week"
            >Next →</button>
          </div>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-200 mb-3">Calories today: <span className="font-semibold">{todayTotals.calories}</span>{avgCalories7d !== null && (
          <> · 7-day avg: <span className="font-semibold">{avgCalories7d}</span></>
        )}</p>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-300 mb-2">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 inline-block rounded-sm bg-emerald-500" />Protein</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 inline-block rounded-sm bg-blue-500" />Carbs</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 inline-block rounded-sm bg-amber-500" />Fats</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 inline-block rounded-sm bg-slate-400" />Total kcal (bar height)</span>
        </div>

        {/* Stacked bars */}
        {weekTotals.length === 0 ? (
          <div className="text-sm text-gray-500">No data for selected week.</div>
        ) : (
          <div className="grid grid-cols-7 gap-3 items-end" style={{ minHeight: 160 }}>
            {(() => {
              const kcalPerDay = weekTotals.map(d => Math.max(0, Math.round((d.protein_g*4)+(d.carbs_g*4)+(d.fat_g*9))));
              const maxKcal = Math.max(1, ...kcalPerDay);
              return weekTotals.map((d, idx) => {
                const totalKcal = kcalPerDay[idx];
                const hPct = Math.min(100, Math.round((totalKcal / maxKcal) * 100));
                const pk = Math.max(0, d.protein_g*4);
                const ck = Math.max(0, d.carbs_g*4);
                const fk = Math.max(0, d.fat_g*9);
                const sum = Math.max(1, pk+ck+fk);
                const ph = (pk/sum)*100, ch = (ck/sum)*100, fh = (fk/sum)*100;
                return (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    <div className="w-7 sm:w-8 rounded-md bg-gray-100 dark:bg-gray-800 overflow-hidden flex flex-col justify-end" style={{ height: 140 }}>
                      <div className="bg-emerald-500" style={{ height: `${(hPct*ph/100)}%` }} />
                      <div className="bg-blue-500" style={{ height: `${(hPct*ch/100)}%` }} />
                      <div className="bg-amber-500" style={{ height: `${(hPct*fh/100)}%` }} />
                    </div>
                    <div className="text-[11px] text-gray-600 dark:text-gray-300">{d.date}</div>
                    <div className="text-[11px] text-gray-500">{totalKcal} kcal</div>
                  </div>
                );
              })
            })()}
          </div>
        )}
      </div>

      {/* Hydration & Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-5">
          <h3 className="font-medium text-lg mb-2">💧 Hydration</h3>
          <ul className="list-disc pl-5 text-sm text-blue-900 dark:text-blue-200 space-y-1">
            <li>Aim for ~8 cups (2L) across the day</li>
            <li>Have a glass with each meal</li>
            <li>Add a pinch of salt after workouts</li>
          </ul>
        </div>
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-5">
          <h3 className="font-medium text-lg mb-2">Quick actions</h3>
          <div className="flex flex-wrap gap-2">
            <a href="/food" className="btn text-xs px-3 py-1.5">Log a meal</a>
            <a href="/chat" className="btn-ghost text-xs px-3 py-1.5">Ask the coach</a>
            <a href="/suggestions" className="btn-ghost text-xs px-3 py-1.5">New ideas</a>
          </div>
        </div>
      </div>

      {/* Grocery inventory (compact) */}
      <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-lg">Grocery inventory</h3>
          <a href="/groceries" className="text-sm text-blue-600 hover:underline">Manage in full page →</a>
        </div>
        {inventory.length === 0 ? (
          <p className="text-sm text-gray-500">No groceries yet. Add items in the Groceries page.</p>
        ) : (
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <div className="flex flex-wrap gap-2">
              {inventory.slice(0, 8).map((it) => (
                <span key={it.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border">
                  <span className="font-medium">{it.name}</span>
                  <span className="text-xs text-gray-500">{Number(it.qty)} {it.unit}</span>
                </span>
              ))}
              {inventory.length > 8 && (
                <a href="/groceries" className="text-xs text-blue-600">+{inventory.length - 8} more</a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* One-tap add • Recent (Presets removed) */}
      <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-5">
        <h3 className="font-medium text-lg mb-2">One-tap add • Recent</h3>
        {recentMeals.length === 0 ? (
          <p className="text-sm text-gray-500">No recent meals yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {recentMeals.map((m) => (
              <button
                key={m.id}
                onClick={() => addQuick(m)}
                className={`text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-normal break-words text-left max-w-[85vw] sm:max-w-none ${addingId===m.id?'opacity-60 cursor-wait':''} ${justAddedId===m.id?'ring-2 ring-emerald-300':''}`}
                disabled={!!addingId}
                aria-busy={addingId===m.id}
              >
                {justAddedId===m.id ? 'Added ✓' : displayName(m)}
              </button>
            ))}
          </div>
        )}
      </div>

      
    </div>
  );
}

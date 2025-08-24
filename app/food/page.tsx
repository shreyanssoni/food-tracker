"use client";
import { useEffect, useMemo, useState } from 'react';
import { FoodForm } from '@/components/FoodForm';
import { PhotoUpload } from '@/components/PhotoUpload';
import { LogCard } from '@/components/LogCard';
import { HabitBanner } from '@/components/HabitBanner';
import CircularStat from '@/components/CircularStat';
import { createClient as createBrowserClient } from '@/utils/supabase/client';
import type { FoodLog } from '@/types';

export default function FoodPage() {
  const supabase = createBrowserClient();
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10)); // yyyy-mm-dd
  const [targets, setTargets] = useState<{ calories: number; protein_g: number; carbs_g: number; fat_g: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, [supabase]);

  // Fetch preferences/targets
  useEffect(() => {
    fetch('/api/preferences')
      .then((r) => r.json())
      .then((d) => setTargets(d?.targets || null))
      .catch(() => setTargets(null));
  }, []);

  // Fetch logs for selected day
  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const start = new Date(date + 'T00:00:00');
      const end = new Date(date + 'T23:59:59.999');
      const { data, error } = await supabase
        .from('food_logs')
        .select('*')
        .gte('eaten_at', start.toISOString())
        .lte('eaten_at', end.toISOString())
        .order('eaten_at', { ascending: false });
      if (!error && data) setLogs(data as any);
      setLoading(false);
    };
    fetchLogs();
  }, [supabase, date]);

  const onLogged = (log: FoodLog) => {
    const logDate = new Date(log.eaten_at).toISOString().slice(0, 10);
    if (logDate === date) setLogs((prev) => [log, ...prev]);
  };

  const onDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/food_logs/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error || `Failed to delete (status ${res.status})`;
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
        return;
      }
      setLogs((prev) => prev.filter((l) => l.id !== id));
      setToast('Deleted');
      setTimeout(() => setToast(null), 1200);
    } catch (e: any) {
      setToast(e?.message || 'Failed to delete');
      setTimeout(() => setToast(null), 2500);
    }
  };

  const totals = useMemo(() => {
    return logs.reduce(
      (acc, l) => {
        acc.calories += Number(l.calories) || 0;
        acc.protein_g += Number(l.protein_g) || 0;
        acc.carbs_g += Number(l.carbs_g) || 0;
        acc.fat_g += Number(l.fat_g) || 0;
        return acc;
      },
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
  }, [logs]);

  return (
    <div className="space-y-5">
      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}
      <HabitBanner />
      <div className="relative overflow-hidden rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white/80 dark:bg-gray-950/70 backdrop-blur shadow-sm">
        <div className="absolute inset-0 -z-10 opacity-[0.12] pointer-events-none">
          <div className="absolute -top-12 -left-10 h-40 w-40 rounded-full bg-blue-500 blur-3xl" />
          <div className="absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-emerald-500 blur-3xl" />
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex items-baseline justify-between">
            <h1 className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent">Log your meal</h1>
          </div>
        </div>
        <div className="px-4 sm:px-5 pb-4">
          <div className="mt-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1" htmlFor="log-date">Date</label>
            <input
              id="log-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200/70 dark:border-gray-800/70 rounded-lg px-3 py-2 text-sm bg-white/80 dark:bg-gray-900/70 backdrop-blur"
            />
          </div>

          {/* Quick text log */}
          <div className="mt-4">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Quick log</h2>
            <FoodForm onLogged={onLogged} />
          </div>

          {/* Collapsible photo upload */}
          <PhotoUploadSection onLogged={onLogged} />

          <p className="text-xs text-gray-500 mt-4">{userEmail ? `Signed in as ${userEmail}` : 'You can log anonymously; sign in to sync across devices.'}</p>
        </div>
      </div>

      {targets ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <CircularStat label="Calories" value={totals.calories} target={targets.calories} unit="kcal" />
          <CircularStat label="Protein" value={totals.protein_g} target={targets.protein_g} unit="g" />
          <CircularStat label="Carbs" value={totals.carbs_g} target={targets.carbs_g} unit="g" />
          <CircularStat label="Fats" value={totals.fat_g} target={targets.fat_g} unit="g" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" aria-hidden>
          <div className="skeleton-circle h-28 w-28 mx-auto" />
          <div className="skeleton-circle h-28 w-28 mx-auto" />
          <div className="skeleton-circle h-28 w-28 mx-auto hidden sm:block" />
          <div className="skeleton-circle h-28 w-28 mx-auto hidden sm:block" />
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3" aria-hidden>
            <SkeletonLogCard />
            <SkeletonLogCard />
            <SkeletonLogCard />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No logs yet. Try adding your first meal!</p>
        ) : (
          logs.map((l) => <LogCard key={l.id} log={l} onDelete={onDelete} />)
        )}
      </div>
    </div>
  );
}

function PhotoUploadSection({ onLogged }: { onLogged: (log: any) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v: boolean) => !v)}
        className="w-full flex items-center justify-between rounded-xl border border-gray-200/70 dark:border-gray-800/70 px-3 py-2 text-sm hover:bg-gray-50/80 dark:hover:bg-white/5"
        aria-expanded={open}
        aria-controls="photo-upload-panel"
      >
        <span className="font-medium">Add via photo</span>
        <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div id="photo-upload-panel" className="mt-3">
          <PhotoUpload onLogged={onLogged} />
        </div>
      )}
    </div>
  );
}

function SkeletonLogCard() {
  return (
    <div className="bg-white/80 dark:bg-gray-950/70 backdrop-blur border border-gray-200/70 dark:border-gray-800/70 shadow-sm rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 skeleton-circle" />
        <div className="flex-1 space-y-2">
          <div className="skeleton-line w-1/2" />
          <div className="skeleton-line w-1/3" />
        </div>
        <div className="h-8 w-16 skeleton" />
      </div>
    </div>
  );
}

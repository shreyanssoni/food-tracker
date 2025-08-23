"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import CircularStat from '@/components/CircularStat';
import { createClient as createBrowserClient } from '@/utils/supabase/client';

export default function DashboardPage() {
  const supabase = createBrowserClient();
  const [targets, setTargets] = useState<{ calories: number; protein_g: number; carbs_g: number; fat_g: number } | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [todayTotals, setTodayTotals] = useState({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    fetch('/api/preferences').then((r) => r.json()).then((d) => setTargets(d?.targets || null));
    fetch('/api/ai/summary', { method: 'POST' }).then((r) => r.json()).then(setSummary);
  }, []);

  const clearContext = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      const res = await fetch('/api/ai/coach', { method: 'DELETE' });
      // no-op UI here; chat is on dedicated page
    } catch {}
    setClearing(false);
  };

  useEffect(() => {
    const load = async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from('food_logs')
        .select('calories,protein_g,carbs_g,fat_g')
        .gte('eaten_at', start.toISOString())
        .lte('eaten_at', end.toISOString());
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

  return (
    <div className="space-y-6">
      {/* Greeting + Quick Actions */}
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">Today</h1>
        <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5 sm:gap-3">
          <QuickAction href="/food" emoji="🍽️" label="Log" kind="emerald" />
          <QuickAction href="/chat" emoji="💬" label="Chat" kind="blue" />
          <QuickAction href="/suggestions" emoji="✨" label="Ideas" kind="violet" />
          <QuickAction href="/profile" emoji="👤" label="Profile" kind="amber" className="hidden sm:flex" />
          <QuickAction href="/settings" emoji="⚙️" label="Settings" kind="slate" className="hidden sm:flex" />
        </div>
      </section>

      {/* Macros */}
      <section className="space-y-3" aria-labelledby="macros-heading">
        <h2 id="macros-heading" className="text-md font-semibold">Macros</h2>
        {targets ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <CircularStat label="Calories" value={todayTotals.calories} target={targets.calories} unit="kcal" />
            <CircularStat label="Protein" value={todayTotals.protein_g} target={targets.protein_g} unit="g" />
            <CircularStat label="Carbs" value={todayTotals.carbs_g} target={targets.carbs_g} unit="g" />
            <CircularStat label="Fats" value={todayTotals.fat_g} target={targets.fat_g} unit="g" />
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

      {/* Coach Summary */}
      <section className="space-y-3" aria-labelledby="coach-summary-heading">
        <div className="flex items-center justify-between">
          <h2 id="coach-summary-heading" className="text-md font-semibold">Coach summary</h2>
          <button
            onClick={clearContext}
            className="px-2.5 py-1.5 rounded-md text-xs border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-60"
            disabled={clearing}
            title="Clear coach memory"
          >{clearing ? 'Clearing…' : 'Clear memory'}</button>
        </div>
        {!summary ? (
          <div className="bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-xl p-4" aria-hidden>
            <div className="space-y-3">
              <div className="skeleton-line w-2/3" />
              <div className="skeleton-line w-1/2" />
              <div className="skeleton-line w-5/6" />
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-xl p-4">
            <p className="text-sm whitespace-pre-wrap">{summary.text}</p>
            <div className="mt-3">
              <Link href="/chat" className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                Continue chat →
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

type QuickKind = 'blue' | 'emerald' | 'violet' | 'amber' | 'slate';
function colorClasses(kind: QuickKind) {
  switch (kind) {
    case 'emerald':
      return {
        from: 'from-emerald-100 dark:from-emerald-950',
        to: 'to-emerald-50/60 dark:to-emerald-900/40',
        ring: 'ring-emerald-200/50 dark:ring-emerald-800/50',
        iconBg: 'bg-emerald-100 dark:bg-emerald-900/60',
        iconText: 'text-emerald-700 dark:text-emerald-300',
      } as const;
    case 'violet':
      return {
        from: 'from-violet-100 dark:from-violet-950',
        to: 'to-violet-50/60 dark:to-violet-900/40',
        ring: 'ring-violet-200/50 dark:ring-violet-800/50',
        iconBg: 'bg-violet-100 dark:bg-violet-900/60',
        iconText: 'text-violet-700 dark:text-violet-300',
      } as const;
    case 'amber':
      return {
        from: 'from-amber-100 dark:from-amber-950',
        to: 'to-amber-50/60 dark:to-amber-900/40',
        ring: 'ring-amber-200/50 dark:ring-amber-800/50',
        iconBg: 'bg-amber-100 dark:bg-amber-900/60',
        iconText: 'text-amber-700 dark:text-amber-300',
      } as const;
    case 'slate':
      return {
        from: 'from-slate-100 dark:from-slate-900',
        to: 'to-slate-50/60 dark:to-slate-800/60',
        ring: 'ring-slate-200/50 dark:ring-slate-700/60',
        iconBg: 'bg-slate-100 dark:bg-slate-800/70',
        iconText: 'text-slate-700 dark:text-slate-200',
      } as const;
    default:
      return {
        from: 'from-blue-100 dark:from-blue-950',
        to: 'to-blue-50/60 dark:to-blue-900/40',
        ring: 'ring-blue-200/50 dark:ring-blue-800/50',
        iconBg: 'bg-blue-100 dark:bg-blue-900/60',
        iconText: 'text-blue-700 dark:text-blue-300',
      } as const;
  }
}

function QuickAction({ href, emoji, label, className, kind = 'blue' }: { href: string; emoji: string; label: string; className?: string; kind?: QuickKind }) {
  const c = colorClasses(kind);
  return (
    <Link
      href={href}
      aria-label={label}
      className={`group rounded-2xl p-2.5 sm:p-3 aspect-square flex items-center justify-center ${className||''}`}
    >
      <div
        className={`w-full h-full rounded-xl bg-gradient-to-br ${c.from} ${c.to} ring-1 ring-inset ${c.ring} shadow-sm flex flex-col items-center justify-center transition-transform duration-150 ease-out group-hover:translate-y-[1px] group-active:translate-y-[2px]`}
      >
        <div className={`h-10 w-10 sm:h-11 sm:w-11 ${c.iconBg} ${c.iconText} rounded-xl grid place-items-center text-2xl`} aria-hidden>
          <span className="leading-none">{emoji}</span>
        </div>
        <span className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs font-medium tracking-wide text-slate-700 dark:text-slate-200">{label}</span>
      </div>
    </Link>
  );
}

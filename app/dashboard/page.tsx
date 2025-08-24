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
    <div className="space-y-7">
      {/* Top Section: Greeting + Quick Actions */}
      <section className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gradient-to-br from-sky-600/10 via-blue-500/10 to-cyan-400/10 dark:from-sky-900/20 dark:via-blue-900/10 dark:to-cyan-900/10 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Today</h1>
          <Link href={{ pathname: '/food' }} className="rounded-full px-3 py-1.5 text-xs font-medium bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-900 transition">Quick log</Link>
        </div>
        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2"
          aria-label="Quick actions"
        >
          <QuickAction href="/food" emoji="🍽️" label="Log" kind="emerald" />
          <QuickAction href="/chat" emoji="💬" label="Chat" kind="blue" />
          <QuickAction href="/suggestions" emoji="✨" label="Ideas" kind="violet" />
          <QuickAction href="/profile" emoji="👤" label="Profile" kind="amber" />
          <QuickAction href="/settings" emoji="⚙️" label="Settings" kind="slate" />
        </div>
      </section>

      {/* Macros */}
      <section className="space-y-3" aria-labelledby="macros-heading">
        <h2 id="macros-heading" className="text-md font-semibold text-slate-900 dark:text-slate-100">Macros</h2>
        {targets ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-3 shadow-sm"><CircularStat label="Calories" value={todayTotals.calories} target={targets.calories} unit="kcal" /></div>
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-3 shadow-sm"><CircularStat label="Protein" value={todayTotals.protein_g} target={targets.protein_g} unit="g" /></div>
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-3 shadow-sm"><CircularStat label="Carbs" value={todayTotals.carbs_g} target={targets.carbs_g} unit="g" /></div>
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm p-3 shadow-sm"><CircularStat label="Fats" value={todayTotals.fat_g} target={targets.fat_g} unit="g" /></div>
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
      <section className="rounded-2xl border border-slate-100 dark:border-slate-800 p-5 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 id="coach-summary-heading" className="text-md font-semibold">Coach summary</h2>
          <button
            onClick={clearContext}
            className="px-3 py-1.5 rounded-full text-xs border border-slate-200 dark:border-slate-700 hover:bg-white/70 dark:hover:bg-slate-900/60 backdrop-blur-sm disabled:opacity-60"
            disabled={clearing}
            title="Clear coach memory"
          >{clearing ? 'Clearing…' : 'Clear memory'}</button>
        </div>
        {!summary ? (
          <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-4" aria-hidden>
            <div className="space-y-3">
              <div className="skeleton-line w-2/3" />
              <div className="skeleton-line w-1/2" />
              <div className="skeleton-line w-5/6" />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-4 bg-white/80 dark:bg-slate-950/70">
            <h3 className="font-medium mb-2">Next meal idea</h3>
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
        tint: 'bg-emerald-200/80 dark:bg-emerald-900/45',
        border: 'border-emerald-300/70 dark:border-emerald-800/50',
      } as const;
    case 'violet':
      return {
        from: 'from-violet-100 dark:from-violet-950',
        to: 'to-violet-50/60 dark:to-violet-900/40',
        ring: 'ring-violet-200/50 dark:ring-violet-800/50',
        iconBg: 'bg-violet-100 dark:bg-violet-900/60',
        iconText: 'text-violet-700 dark:text-violet-300',
        tint: 'bg-violet-200/80 dark:bg-violet-900/45',
        border: 'border-violet-300/70 dark:border-violet-800/50',
      } as const;
    case 'amber':
      return {
        from: 'from-amber-100 dark:from-amber-950',
        to: 'to-amber-50/60 dark:to-amber-900/40',
        ring: 'ring-amber-200/50 dark:ring-amber-800/50',
        iconBg: 'bg-amber-100 dark:bg-amber-900/60',
        iconText: 'text-amber-700 dark:text-amber-300',
        tint: 'bg-amber-200/80 dark:bg-amber-900/45',
        border: 'border-amber-300/70 dark:border-amber-800/50',
      } as const;
    case 'slate':
      return {
        from: 'from-slate-100 dark:from-slate-900',
        to: 'to-slate-50/60 dark:to-slate-800/60',
        ring: 'ring-slate-200/50 dark:ring-slate-700/60',
        iconBg: 'bg-slate-100 dark:bg-slate-800/70',
        iconText: 'text-slate-700 dark:text-slate-200',
        tint: 'bg-slate-300/70 dark:bg-slate-800/60',
        border: 'border-slate-300/70 dark:border-slate-700/60',
      } as const;
    default:
      return {
        from: 'from-blue-100 dark:from-blue-950',
        to: 'to-blue-50/60 dark:to-blue-900/40',
        ring: 'ring-blue-200/50 dark:ring-blue-800/50',
        iconBg: 'bg-blue-100 dark:bg-blue-900/60',
        iconText: 'text-blue-700 dark:text-blue-300',
        tint: 'bg-blue-200/80 dark:bg-blue-900/45',
        border: 'border-blue-300/70 dark:border-blue-800/50',
      } as const;
  }
}

function QuickAction({ href, emoji, label, className, kind = 'blue' }: { href: string; emoji: string; label: string; className?: string; kind?: QuickKind }) {
  const c = colorClasses(kind);
  return (
    <Link
      href={{ pathname: href }}
      aria-label={label}
      className={`group block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-600 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 active:scale-[.995] transition-transform ${className||''}`}
    >
      <div
        className={`w-full h-12 sm:h-[56px] rounded-full border ${c.border} shadow-sm hover:shadow-md active:shadow-sm flex items-center gap-2 pl-2 pr-1.5 sm:pr-2 transition-all duration-200 ease-out ${c.tint} backdrop-blur-md overflow-hidden`}
      >
        <div className={`h-7 w-7 sm:h-8 sm:w-8 ${c.iconBg} ${c.iconText} rounded-full grid place-items-center text-[16px] sm:text-[18px] shadow-inner shrink-0`} aria-hidden>
          <span className="leading-none">{emoji}</span>
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
          <span className="flex-1 min-w-0 text-[12px] sm:text-[13px] font-semibold tracking-wide text-slate-900 dark:text-slate-100 whitespace-nowrap">{label}</span>
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

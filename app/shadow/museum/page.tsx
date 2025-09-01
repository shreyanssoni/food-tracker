"use client";

import React, { useEffect, useState } from 'react';

type LedgerEntry = {
  id: string;
  entity_type: 'user' | 'shadow';
  entity_id: string;
  source: 'task' | 'challenge' | 'bonus' | 'streak';
  amount: number;
  meta: any;
  created_at: string;
};

export default function MuseumPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [userEp, setUserEp] = useState(0);
  const [shadowEp, setShadowEp] = useState(0);
  const [earned, setEarned] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [entityFilter, setEntityFilter] = useState<'all'|'user'|'shadow'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all'|'task'|'challenge'|'bonus'|'streak'>('all');

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [ledgerRes, achRes] = await Promise.all([
          fetch('/api/shadow/ledger?limit=50', { cache: 'no-store' }),
          fetch('/api/shadow/achievements', { cache: 'no-store' }),
        ]);
        if (!ledgerRes.ok) throw new Error(`Ledger HTTP ${ledgerRes.status}`);
        if (!achRes.ok) throw new Error(`Achievements HTTP ${achRes.status}`);
        const json = await ledgerRes.json();
        const achJson = await achRes.json();
        if (!mounted) return;
        setEntries(json.entries || []);
        setUserEp(json.user_ep || 0);
        setShadowEp(json.shadow_ep || 0);
        setEarned(achJson.earned || []);
        setCatalog(achJson.catalog || []);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = entries.filter((e) => {
    const entityOk = entityFilter === 'all' || e.entity_type === entityFilter;
    const sourceOk = sourceFilter === 'all' || e.source === sourceFilter;
    return entityOk && sourceOk;
  });

  function humanSource(s: LedgerEntry['source']) {
    switch (s) {
      case 'task': return 'Task';
      case 'challenge': return 'Shadow Challenge';
      case 'bonus': return 'Bonus';
      case 'streak': return 'Streak';
      default: return s;
    }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); } catch {}
  }

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Achievements Museum</h1>
        <div className="text-sm text-gray-500">EP Scoreboard</div>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-4 bg-white/50">
          <div className="text-gray-500 text-sm">You</div>
          <div className="text-3xl font-bold">{userEp}</div>
        </div>
        <div className="rounded-lg border p-4 bg-white/50">
          <div className="text-gray-500 text-sm">Shadow</div>
          <div className="text-3xl font-bold">{shadowEp}</div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent EP Activity</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Entity:</span>
            {(['all','user','shadow'] as const).map((v) => (
              <button
                key={v}
                className={`px-2 py-1 rounded border ${entityFilter===v?'bg-gray-900 text-white':'bg-white text-gray-700'}`}
                onClick={() => setEntityFilter(v)}
              >{v}</button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Source:</span>
            {(['all','task','challenge','bonus','streak'] as const).map((v) => (
              <button
                key={v}
                className={`px-2 py-1 rounded border ${sourceFilter===v?'bg-gray-900 text-white':'bg-white text-gray-700'}`}
                onClick={() => setSourceFilter(v)}
              >{v}</button>
            ))}
          </div>
        </div>
        {loading && <div className="text-sm text-gray-500">Loading…</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-sm text-gray-500">No recent activity.</div>
        )}
        <ul className="divide-y rounded-md border bg-white/40">
          {filtered.map((e) => (
            <li key={e.id} className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
                    (e.entity_type === 'user'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-purple-100 text-purple-800')
                  }
                >
                  {e.entity_type}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm text-gray-700">
                    {humanSource(e.source)}
                    {e.meta?.shadow_challenge_id ? ' · ' : ''}
                    {e.meta?.shadow_challenge_id ? (
                      <button
                        className="underline text-blue-700 hover:text-blue-900"
                        onClick={() => copy(e.meta.shadow_challenge_id)}
                        title="Copy challenge ID"
                      >challenge id</button>
                    ) : null}
                  </span>
                  {e.meta?.shadow_challenge_id && (
                    <span className="text-[10px] text-gray-400">{e.meta.shadow_challenge_id}</span>
                  )}
                </div>
              </div>
              <div
                className={
                  'text-sm font-semibold ' + (e.entity_type === 'user' ? 'text-green-700' : 'text-purple-700')
                }
              >
                +{e.amount}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Badges</h2>
        {loading && <div className="text-sm text-gray-500">Loading…</div>}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {catalog.map((a) => {
              const got = earned.find((e) => e.achievement_id === a.id);
              return (
                <div
                  key={a.id}
                  className={
                    'rounded-lg border p-3 bg-white/50 ' +
                    (got ? 'opacity-100' : 'opacity-60')
                  }
                  title={a.description}
                >
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="text-xs text-gray-500 line-clamp-2">{a.description}</div>
                  <div className="mt-1 text-[10px] text-gray-400">{got ? 'Earned' : 'Locked'}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

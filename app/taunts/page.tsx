"use client";
import { useEffect, useState } from "react";

export default function TauntsPage() {
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  async function load() {
    try {
      const res = await fetch(`/api/shadow/taunts?limit=${limit}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      setItems(j.items || []);
    } catch (e: any) {
      setError(e?.message || 'Failed');
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Shadow Taunts</h1>

      <div className="flex items-center gap-2">
        <label className="text-sm">Limit:</label>
        <input
          className="rounded-md border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-slate-900/50 px-3 py-1.5 text-sm w-24"
          type="number"
          min={1}
          max={200}
          value={limit}
          onChange={(e) => setLimit(parseInt(e.target.value || '50', 10))}
        />
        <button
          className="rounded-md bg-blue-600 text-white px-3 py-1.5 text-sm"
          onClick={load}
        >
          Refresh
        </button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {!items ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-500">No taunts yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map((t: any) => (
            <div key={t.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white/70 dark:bg-slate-950/60">
              <div className="text-xs text-slate-500 flex items-center justify-between">
                <span className="uppercase">{t.intensity}</span>
                <span>{new Date(t.created_at).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-sm">{t.message}</div>
              {t.outcome && (
                <div className="mt-1 text-xs text-slate-500">Outcome: {t.outcome}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";

export default function MuseumPage() {
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/achievements/history');
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Failed');
        setItems(j.items || []);
      } catch (e: any) {
        setError(e?.message || 'Failed');
        setItems([]);
      }
    })();
  }, []);

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Achievements Museum</h1>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!items ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-500">No achievements yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {items.map((it, idx) => (
            <div key={idx} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white/70 dark:bg-slate-950/60">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{it.achievement?.name || it.achievement?.code}</div>
                <div className="text-xs text-slate-500">{new Date(it.awarded_at).toLocaleString()}</div>
              </div>
              {it.achievement?.description && (
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{it.achievement.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

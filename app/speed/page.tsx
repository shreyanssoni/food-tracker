"use client";
import { useEffect, useState } from "react";

export default function SpeedPage() {
  const [days, setDays] = useState(14);
  const [series, setSeries] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shadow/speed/history?days=${days}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setSeries(j.series || []);
    } catch (e: any) {
      setError(e?.message || "Failed");
      setSeries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">My Speed vs Shadow Speed</h1>

      <div className="flex items-center gap-2">
        <label className="text-sm">Days:</label>
        <input
          className="rounded-md border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-slate-900/50 px-3 py-1.5 text-sm w-24"
          type="number"
          min={7}
          max={90}
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value || "14", 10))}
        />
        <button
          className="rounded-md bg-blue-600 text-white px-3 py-1.5 text-sm disabled:opacity-60"
          disabled={loading}
          onClick={load}
        >
          Refresh
        </button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {!series ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : series.length === 0 ? (
        <div className="text-sm text-slate-500">No data.</div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-semibold">User Speed Avg</div>
              <ul className="mt-2 space-y-1 text-sm">
                {series.map((pt: any) => (
                  <li key={pt.date} className="flex justify-between">
                    <span className="text-slate-500">{pt.date}</span>
                    <span className="tabular-nums">{pt.user_speed_avg ?? "-"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold">Shadow Target</div>
              <ul className="mt-2 space-y-1 text-sm">
                {series.map((pt: any) => (
                  <li key={pt.date} className="flex justify-between">
                    <span className="text-slate-500">{pt.date}</span>
                    <span className="tabular-nums">{pt.shadow_speed_target ?? "-"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

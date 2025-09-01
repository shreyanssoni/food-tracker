"use client";
import { useState } from "react";

export default function AdminShadowPage() {
  const [userId, setUserId] = useState("");
  const [limit, setLimit] = useState(100);
  const [mirrorItems, setMirrorItems] = useState<any[] | null>(null);
  const [logs, setLogs] = useState<any[] | null>(null);
  const [kind, setKind] = useState<string>("");
  const [day, setDay] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<any | null>(null);

  const run = async (id: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Shadow Admin</h1>

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Controls</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm">User ID</label>
            <input
              className="rounded-md border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-slate-900/50 px-3 py-2 text-sm"
              placeholder="user uuid/text id"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm">Limit</label>
            <input
              className="rounded-md border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-slate-900/50 px-3 py-2 text-sm"
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value || "100", 10))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm">Logs kind</label>
            <select
              className="rounded-md border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-slate-900/50 px-3 py-2 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="">(any)</option>
              <option value="state_snapshot">state_snapshot</option>
              <option value="race_update">race_update</option>
              <option value="pace_adapt">pace_adapt</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm">Logs day (YYYY-MM-DD)</label>
            <input
              className="rounded-md border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-slate-900/50 px-3 py-2 text-sm"
              placeholder="2025-09-01"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md bg-blue-600 text-white px-3 py-1.5 text-sm disabled:opacity-60"
            disabled={!userId || !!busy}
            onClick={() =>
              run("mirror", async () => {
                setMirrorItems(null);
                const url = `/api/admin/shadow/mirror-status?user_id=${encodeURIComponent(userId)}&limit=${limit}`;
                const res = await fetch(url);
                const j = await res.json().catch(() => ({}));
                if (res.ok) setMirrorItems(j.items || []);
                else setMirrorItems([]);
              })
            }
          >
            Load Mirror Status
          </button>
          <button
            className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-sm disabled:opacity-60"
            disabled={!userId || !!busy}
            onClick={() =>
              run("logs", async () => {
                setLogs(null);
                const params = new URLSearchParams({ user_id: userId, limit: String(limit) });
                if (kind) params.set("kind", kind);
                if (day) params.set("day", day);
                const res = await fetch(`/api/admin/shadow/logs?${params.toString()}`);
                const j = await res.json().catch(() => ({}));
                if (res.ok) setLogs(j.logs || []);
                else setLogs([]);
              })
            }
          >
            Load Dry-Run Logs
          </button>
          <button
            className="rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm disabled:opacity-60"
            disabled={!!busy}
            onClick={() =>
              run("batch", async () => {
                setBatchResult(null);
                const res = await fetch(`/api/admin/shadow/run-today-all`, { method: "POST" });
                const j = await res.json().catch(() => ({}));
                setBatchResult(j);
              })
            }
          >
            Run Today For All Users
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h2 className="text-lg font-semibold">Mirror Status</h2>
        {!mirrorItems ? (
          <div className="text-sm text-slate-500">No data loaded.</div>
        ) : mirrorItems.length === 0 ? (
          <div className="text-sm text-slate-500">No items.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-200 dark:border-slate-800">
                  <th className="py-1 pr-4">Task</th>
                  <th className="py-1 pr-4">Mirrors</th>
                  <th className="py-1 pr-4">Candidates</th>
                  <th className="py-1 pr-4">Created</th>
                </tr>
              </thead>
              <tbody>
                {mirrorItems.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1 pr-4 max-w-[360px] truncate">{it.title}</td>
                    <td className="py-1 pr-4 tabular-nums">{it.mirrors_by_parent}</td>
                    <td className="py-1 pr-4 tabular-nums">{it.candidate_mirrors_by_title}</td>
                    <td className="py-1 pr-4 text-slate-500">{new Date(it.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h2 className="text-lg font-semibold">Dry-Run Logs</h2>
        {!logs ? (
          <div className="text-sm text-slate-500">No data loaded.</div>
        ) : logs.length === 0 ? (
          <div className="text-sm text-slate-500">No logs.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="rounded-md border border-slate-200 dark:border-slate-800 p-2">
                <div className="text-xs text-slate-500 flex items-center justify-between">
                  <span>{l.kind}</span>
                  <span>{new Date(l.created_at).toLocaleString()}</span>
                </div>
                <pre className="mt-1 text-xs whitespace-pre-wrap break-words">{JSON.stringify(l.payload, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h2 className="text-lg font-semibold">Batch Run Result</h2>
        {!batchResult ? (
          <div className="text-sm text-slate-500">No run yet.</div>
        ) : (
          <pre className="mt-2 text-xs whitespace-pre-wrap break-words">
            {JSON.stringify(batchResult, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}

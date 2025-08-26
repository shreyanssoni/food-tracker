"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function CoachSummary({ className = "" }: { className?: string }) {
  const [summary, setSummary] = useState<any>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    fetch("/api/ai/summary", { method: "POST" })
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const clearContext = async () => {
    if (clearing) return;
    try {
      setClearing(true);
      await fetch("/api/ai/coach", { method: "DELETE" });
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className={`rounded-2xl border border-slate-100 dark:border-slate-800 p-5 bg-white/70 dark:bg-slate-950/60 backdrop-blur-sm shadow-sm ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <h2 id="coach-summary-heading" className="text-md font-semibold">
          Coach summary
        </h2>
        <button
          onClick={clearContext}
          className="px-3 py-1.5 rounded-full text-xs border border-slate-200 dark:border-slate-700 hover:bg-white/70 dark:hover:bg-slate-900/60 backdrop-blur-sm disabled:opacity-60"
          disabled={clearing}
          title="Clear coach memory"
        >
          {clearing ? "Clearing…" : "Clear memory"}
        </button>
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
  );
}

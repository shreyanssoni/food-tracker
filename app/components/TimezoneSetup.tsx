"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

// Minimal timezone selector shown only if user_preferences.timezone is missing
export default function TimezoneSetup() {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentTz, setCurrentTz] = useState<string>("");

  const guessed = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;
      if (status !== "authenticated") return;
      try {
        const res = await fetch("/api/preferences", { cache: "no-store" });
        if (!res.ok) {
          // Do NOT show the popup on rate limit or any API failure
          // Only show when we positively know timezone is missing
          return;
        }
        const j = await res.json().catch(() => ({}));
        const tz = j?.profile?.timezone as string | undefined;
        if (cancelled) return;
        // Open only if preferences exist but timezone missing OR preferences row missing entirely
        if (!tz) {
          setCurrentTz(guessed);
          setOpen(true);
        }
      } catch {
        // no-op
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, guessed]);

  const save = async () => {
    if (!currentTz) return;
    setSaving(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: currentTz }),
      });
      if (!res.ok) throw new Error("Failed to save timezone");
      setOpen(false);
    } catch {
      // keep modal open; optionally show toast in future
    } finally {
      setSaving(false);
    }
  };

  if (loading || !open || status !== "authenticated") return null;

  // Lightweight list: rely on browser-detected tz and a short curated set, allow manual text entry fallback
  const commonTz = [
    "Asia/Kolkata",
    "Asia/Dubai",
    "Asia/Singapore",
    "Europe/London",
    "Europe/Berlin",
    "America/New_York",
    "America/Los_Angeles",
    "UTC",
  ];

  return (
    <div className="fixed inset-0 z-[101] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div className="relative w-[92%] max-w-md rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl shadow-2xl p-5">
        <div className="mb-3">
          <div className="text-lg font-semibold">Set your timezone</div>
          <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            We’ll use this to schedule reminders at the right local times.
          </div>
        </div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Timezone</label>
        <div className="flex items-center gap-2">
          <select
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm"
            value={currentTz}
            onChange={(e) => setCurrentTz(e.target.value)}
          >
            {/* Put guessed on top if not already in list */}
            {!commonTz.includes(guessed) && (
              <option value={guessed}>{guessed} (detected)</option>
            )}
            {commonTz.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div className="text-[11px] text-slate-500 mt-2">
          Your current device timezone is <span className="font-medium">{guessed}</span>.
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="text-[13px] px-3 py-1.5 rounded-full border border-gray-200/70 dark:border-gray-800/70 hover:bg-gray-100/70 dark:hover:bg-white/5"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Not now
          </button>
          <button
            className="text-[13px] px-3 py-1.5 rounded-full border border-transparent bg-gradient-to-r from-blue-600 to-emerald-500 text-white disabled:opacity-60"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

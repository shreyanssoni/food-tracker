"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient as createBrowserClient } from "@/utils/supabase/client";
import { getReliableTimeZone, mapOffsetToIana } from "@/utils/timezone";

export default function TimezoneMismatchPrompt() {
  const supabase = createBrowserClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [dbTz, setDbTz] = useState<string | null>(null);
  const [guessed, setGuessed] = useState<string>("UTC");

  const dismissKey = useMemo(() => {
    if (!userId || !dbTz || !guessed) return null;
    // include both db and guessed tz so a later change re-prompts
    return `tzMismatchDismissed:${userId}:${dbTz}->${guessed}`;
  }, [userId, dbTz, guessed]);

  useEffect(() => {
    // Determine device timezone
    try { setGuessed(getReliableTimeZone()); } catch { setGuessed("UTC"); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // get user
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id || null;
        if (cancelled) return;
        setUserId(uid);

        // fetch preferences
        const res = await fetch("/api/preferences", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        const tz: string | undefined = j?.profile?.timezone;
        if (cancelled) return;
        setDbTz(tz ?? null);

        if (uid && tz && tz !== guessed) {
          // check local dismissal
          const key = `tzMismatchDismissed:${uid}:${tz}->${guessed}`;
          const dismissed = typeof window !== "undefined" ? localStorage.getItem(key) : null;
          if (!dismissed) setOpen(true);
        }
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guessed]);

  const onDismiss = () => {
    if (dismissKey) {
      try { localStorage.setItem(dismissKey, "1"); } catch {}
    }
    setOpen(false);
  };

  const onUpdate = async () => {
    if (!guessed) return;
    setSaving(true);
    try {
      // Only save IANA-style zones when possible. If we have a numeric offset like 'UTC+05:30', try to map
      // the current device offset to a representative IANA zone; fall back to 'UTC' only if mapping fails.
      const isIana = /\//.test(guessed) || guessed === 'UTC';
      let toSave = guessed;
      if (!isIana) {
        const offsetMin = new Date().getTimezoneOffset();
        const totalEast = -offsetMin; // positive east of UTC
        const mapped = mapOffsetToIana(totalEast);
        toSave = mapped || 'UTC';
      }
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: isIana ? guessed : toSave }),
      });
      if (!res.ok) throw new Error("Failed to update timezone");
      if (dismissKey) {
        try { localStorage.removeItem(dismissKey); } catch {}
      }
      setOpen(false);
    } catch {
      // keep dialog open
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[101] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      <div className="relative w-[92%] max-w-md rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl shadow-2xl p-5">
        <div className="mb-3">
          <div className="text-lg font-semibold">Timezone mismatch</div>
          <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Your saved timezone is <span className="font-medium">{dbTz}</span>, but your current device timezone is <span className="font-medium">{guessed}</span>.
          </div>
        </div>
        <div className="text-[11px] text-slate-500 mb-3">
          Would you like to update to the current timezone for accurate reminders?
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            className="text-[13px] px-3 py-1.5 rounded-full border border-gray-200/70 dark:border-gray-800/70 hover:bg-gray-100/70 dark:hover:bg-white/5"
            onClick={onDismiss}
            disabled={saving}
          >
            Dismiss
          </button>
          <button
            className="text-[13px] px-3 py-1.5 rounded-full border border-transparent bg-gradient-to-r from-blue-600 to-emerald-500 text-white disabled:opacity-60"
            onClick={onUpdate}
            disabled={saving}
          >
            {saving ? "Updating…" : "Update timezone"}
          </button>
        </div>
      </div>
    </div>
  );
}

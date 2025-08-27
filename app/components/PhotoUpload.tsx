"use client";
import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { FoodLog } from "@/types";

export function PhotoUpload({
  onLogged,
}: {
  onLogged: (log: FoodLog) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"idle" | "analyzing" | "logging" | "done">(
    "idle"
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [reward, setReward] = useState<null | { xp: number }>(null);
  const [hint, setHint] = useState<string | null>(null);
  const { data: session } = useSession();

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setReward(null);
    setHint(null);
    setStep("analyzing");
    // Preview image
    const url = URL.createObjectURL(file);
    setPreview(url);
    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res = await fetch("/api/ai/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: file.type || "image/jpeg",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHint(data?.error || "Could not analyze photo. Try again later.");
        return;
      }
      if (data?.suggestion) setHint(data.suggestion);
      console.log("FOOD RESULTS", data);
      if (
        Array.isArray(data?.log) ||
        (typeof data?.log === "object" && data?.log !== null)
      ) {
        const logs = Array.isArray(data?.log) ? data.log : [data.log];
        setStep("logging");
        for (const log of logs) {
          const baseLog = { ...log } as any;
          if (baseLog.eaten_at == null) delete baseLog.eaten_at; // let DB default now()
          const payload = {
            ...baseLog,
            user_id: session?.user?.id || null,
          } as const;
          const resp = await fetch("/api/food_logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const j = await resp.json();
          if (resp.ok && j?.data) {
          onLogged(j.data as FoodLog);
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            (navigator as any).vibrate?.(40);
          }
        }
        }
        setReward({ xp: 5 });
        setStep("done");
      } else if (typeof data?.log === "object" && data?.log !== null) {
        const baseLog = { ...data.log } as any;
        if (baseLog.eaten_at == null) delete baseLog.eaten_at; // let DB default now()
        const payload = {
          ...baseLog,
          user_id: session?.user?.id || null,
        } as const;
        setStep("logging");
        const resp = await fetch("/api/food_logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await resp.json();
        if (resp.ok && j?.data) onLogged(j.data as FoodLog);
        setReward({ xp: 5 });
        setStep("done");
      }
    } catch (e) {
      setHint("Could not analyze photo. Try again.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
      // Revoke preview URL to avoid leaks
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    }
  };

  const openPicker = () => inputRef.current?.click();

  // Drag & drop support (desktop)
  const onDrop: React.DragEventHandler<HTMLDivElement> = async (ev) => {
    ev.preventDefault();
    const f = ev.dataTransfer.files?.[0];
    if (f && inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputRef.current.files = dt.files;
      inputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  const onDragOver: React.DragEventHandler<HTMLDivElement> = (ev) => {
    ev.preventDefault();
  };

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-4 sm:p-5">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        className="relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-lg border border-white/10 p-4 sm:p-5 bg-black/20 backdrop-blur cursor-pointer hover:border-white/20 transition"
        onClick={openPicker}
        role="button"
        aria-label="Upload a food photo"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
          {/* Camera icon */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm sm:text-base font-medium">Add via photo</p>
          <p className="text-xs sm:text-sm text-white/60">Tap to open camera or drop an image here</p>
        </div>
        <button
          type="button"
          className="hidden sm:inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-green-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 active:scale-[0.99]"
        >
          Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPick}
          className="hidden"
        />
        {loading && (
          <div className="absolute inset-0 rounded-lg bg-black/40 backdrop-blur-sm grid place-items-center">
            <div className="flex items-center gap-3 text-white/90">
              {/* Spinner */}
              <svg className="h-5 w-5 animate-spin text-emerald-400" viewBox="0 0 24 24">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
              </svg>
              <span className="text-sm">
                {step === "analyzing" && "Analyzing your meal…"}
                {step === "logging" && "Adding to your journal…"}
                {step === "done" && "Done!"}
              </span>
            </div>
          </div>
        )}
      </div>

      {preview && (
        <div className="mt-3 sm:mt-4 overflow-hidden rounded-lg border border-white/10">
          <img src={preview} alt="Preview" className="w-full max-h-64 object-cover" />
        </div>
      )}

      {hint && (
        <div className="mt-3 sm:mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-emerald-200 text-sm">
          {hint}
        </div>
      )}

      {reward && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2">
          <span className="animate-bounce">✨</span>
          <p className="text-sm text-yellow-200">
            Logged! Keep your Streak going.
          </p>
        </div>
      )}
    </div>
  );
}

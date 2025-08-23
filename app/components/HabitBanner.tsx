"use client";
import { useEffect, useState } from 'react';

export function HabitBanner() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch('/api/habits/prompt').then((r) => r.json()).then((j) => setMsg(j.message)).catch(() => {});
    }, 800); // light nudge shortly after load
    return () => clearTimeout(t);
  }, []);

  if (!msg) return null;
  return (
    <div className="bg-brand-50 text-brand-800 rounded-xl p-3 text-sm shadow-soft">
      {msg}
    </div>
  );
}

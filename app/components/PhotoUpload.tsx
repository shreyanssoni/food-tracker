"use client";
import { useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { FoodLog } from '@/types';
import { createClient as createBrowserClient } from '@/utils/supabase/client';

export function PhotoUpload({ onLogged }: { onLogged: (log: FoodLog) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const { data: session } = useSession();
  const supabase = createBrowserClient();

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setHint(null);
    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res = await fetch('/api/ai/photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg' }) });
      const data = await res.json();
      if (!res.ok) {
        setHint(data?.error || 'Could not analyze photo. Try again later.');
        return;
      }
      if (data?.suggestion) setHint(data.suggestion);
      if (data?.log) {
        const baseLog = { ...data.log } as any;
        if (baseLog.eaten_at == null) delete baseLog.eaten_at; // let DB default now()
        const payload = {
          ...baseLog,
          user_id: session?.user?.id || null,
        } as const;
        const { data: inserted, error } = await supabase.from('food_logs').insert(payload).select().single();
        if (!error && inserted) onLogged(inserted);
      }
    } catch (e) {
      setHint('Could not analyze photo. Try again.');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <label className="block text-sm mb-2">Or upload a photo</label>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onPick} className="block w-full text-sm" />
      {loading && <p className="text-sm text-gray-500 mt-2">Analyzing…</p>}
      {hint && <p className="text-sm text-gray-700 mt-2">{hint}</p>}
    </div>
  );
}

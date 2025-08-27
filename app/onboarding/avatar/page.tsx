"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function AvatarSelectionPage() {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Array<{ path: string; url: string; type: 'gif'|'image' }>>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/avatar/catalog', { cache: 'no-store' });
        if (res.status === 401) {
          window.location.href = '/auth/signin';
          return;
        }
        const j = await res.json();
        if (alive && res.ok) setAssets(j.assets || []);
      } catch (e) {
        toast.error('Failed to load avatars');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const selectAvatar = async (appearance_stage: string) => {
    try {
      setBusy(appearance_stage);
      const res = await fetch('/api/avatar/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appearance_stage }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to set avatar');
      toast.success('Avatar selected');
      window.location.href = '/dashboard';
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Choose Your Avatar</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Pick a starting avatar. You can evolve and equip items as you progress.</p>

      {loading ? (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {assets.map(a => (
            <div key={a.path} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/60 p-3 flex flex-col gap-2">
              <div className="aspect-square rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden grid place-items-center bg-slate-50 dark:bg-slate-900">
                {a.type === 'gif' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.path} className="object-contain w-full h-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.path} className="object-contain w-full h-full" />
                )}
              </div>
              <button
                disabled={!!busy}
                onClick={() => selectAvatar(a.path)}
                className={`text-sm font-medium rounded-full px-3 py-1.5 ${busy ? 'opacity-60 cursor-not-allowed' : ''} bg-blue-600 text-white`}
              >
                {busy === a.path ? 'Selecting…' : 'Select'}
              </button>
            </div>
          ))}
          {assets.length === 0 && (
            <div className="col-span-full text-sm text-slate-600 dark:text-slate-400">No avatars available yet. Please contact Support.</div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { signIn } from 'next-auth/react';
import { signInWithGoogleNative } from '@/utils/auth/nativeGoogle';
import { registerDevicePushIfPossible } from '@/utils/push/registerDevice';
import { getReliableTimeZone, mapOffsetToIana } from '@/utils/timezone';

export default function SignUp() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tz, setTz] = useState<string>('');

  useEffect(() => {
    // Default timezone to device
    const guessed = getReliableTimeZone();
    setTz(guessed || 'UTC');
  }, []);

  const tzOptions = useMemo(() => {
    const detected = getReliableTimeZone();
    const list = [
      detected,
      'Asia/Kolkata',
      'Asia/Dubai',
      'Asia/Singapore',
      'Europe/London',
      'Europe/Berlin',
      'America/New_York',
      'America/Los_Angeles',
      'UTC',
    ].filter((v, i, a) => !!v && a.indexOf(v) === i);
    return list;
  }, []);

  const handleGoogle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const platform = Capacitor.getPlatform();
      if (platform === 'android') {
        // Prefer native Google sign-in (Firebase Authentication)
        try {
          const res = await signInWithGoogleNative();
          if (res?.ok) {
            try { await registerDevicePushIfPossible(); } catch {}
            toast.success('Signed in');
            return;
          }
        } catch (e: any) {
          // Fallback to NextAuth Google
          const msg = (e?.message || String(e)).slice(0, 300);
          toast.message(`Native sign-in unavailable: ${msg}`);
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          const base = (process.env.NEXT_PUBLIC_AUTH_URL || origin || '').replace(/\/$/, '');
          const authUrl = `${base}/api/auth/signin/google?callbackUrl=${encodeURIComponent(base + '/auth/signup')}`;
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ url: authUrl, presentationStyle: 'fullscreen' });
        }
      } else {
        const res = await signIn('google', { callbackUrl: '/auth/signup', redirect: false });
        if (res?.url) {
          window.location.assign(res.url);
        }
      }
    } catch (e: any) {
      const msg = e?.message || 'Google sign-in failed. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const finish = async () => {
    if (!session?.user?.id) {
      toast.error('Please sign in first');
      return;
    }
    setSaving(true);
    try {
      const isIana = /\//.test(tz) || tz === 'UTC';
      let toSave = tz;
      if (!isIana) {
        const offsetMin = new Date().getTimezoneOffset();
        const totalEast = -offsetMin;
        const mapped = mapOffsetToIana(totalEast);
        toSave = mapped || 'UTC';
      }
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: toSave }),
      });
      try { await registerDevicePushIfPossible(); } catch {}
      toast.success('All set!');
      router.replace('/');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md w-full space-y-6 p-6 bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-lg shadow">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Get started</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Create your account and set preferences</p>
        </div>

        {!session ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogle}
              className="w-full py-3 px-4 rounded-md text-white bg-blue-600 hover:bg-blue-700 text-sm font-medium"
              disabled={loading}
            >
              {loading ? 'Connecting…' : 'Continue with Google'}
            </button>
            <div className="text-center text-xs">
              <a href="/auth/signin" className="text-blue-600 hover:underline">Have an account? Sign in</a>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Timezone</label>
              <select
                className="mt-1 input w-full"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
              >
                {tzOptions.map((z) => (
                  <option key={z} value={z}>{z}{z===getReliableTimeZone()?' (device)':''}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Used to schedule reminders at local times.</p>
            </div>
            <button
              type="button"
              onClick={finish}
              className="w-full py-3 px-4 rounded-md text-white bg-emerald-600 hover:bg-emerald-700 text-sm font-medium disabled:opacity-60"
              disabled={saving}
            >
              {saving ? 'Finishing…' : 'Finish'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

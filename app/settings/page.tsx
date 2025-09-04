"use client";

import { useEffect, useState } from 'react';
import { useNotifications } from '@/utils/notifications';
import { useSession } from 'next-auth/react';
import { getReliableTimeZone, mapOffsetToIana } from '@/utils/timezone';

type Units = 'metric' | 'us';
type Theme = 'system' | 'light' | 'dark';

export default function SettingsPage() {
  const { data: session } = useSession();

  const [units, setUnits] = useState<Units>('metric');
  const [theme, setTheme] = useState<Theme>('system');
  // server-backed timezone preference
  const [timezone, setTimezone] = useState<string>('');
  const [tzLoading, setTzLoading] = useState<boolean>(true);
  const [tzSaving, setTzSaving] = useState<boolean>(false);
  const { enabled: notifications, status: notifStatus, pending, enable, disable } = useNotifications();
  const [isNativeCapacitor, setIsNativeCapacitor] = useState(false);
  const [devicePending, setDevicePending] = useState(false);
  const [deviceEnabled, setDeviceEnabled] = useState<boolean>(false);
  const [broadcastPending, setBroadcastPending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        const native = !!Capacitor?.isNativePlatform?.();
        setIsNativeCapacitor(native);
        if (native) {
          try {
            const { PushNotifications } = await import('@capacitor/push-notifications');
            const perm = await PushNotifications.checkPermissions();
            setDeviceEnabled(perm.receive === 'granted');
          } catch {}
        }
      } catch {}
    })();
  }, []);

  // load from localStorage
  useEffect(() => {
    try {
      const lu = (localStorage.getItem('pref_units') as Units) || 'metric';
      const lt = (localStorage.getItem('pref_theme') as Theme) || 'system';
      setUnits(lu);
      setTheme(lt);
      // notifications state comes from hook; keep localStorage for backward compat
      applyTheme(lt);
    } catch {}
  }, []);

  // Load timezone from server preferences; if missing, default to device tz and persist
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!session) return;
        const res = await fetch('/api/preferences', { cache: 'no-store' });
        const j = await res.json();
        if (cancelled) return;
        const tz = j?.profile?.timezone as string | undefined;
        if (tz) {
          setTimezone(tz);
        } else {
          const guessed = getReliableTimeZone();
          setTimezone(guessed);
          // Persist device timezone to server so it's not UTC by default in PWAs
          try {
            const isIana = /\//.test(guessed) || guessed === 'UTC';
            let toSave = guessed;
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
          } catch {}
        }
      } catch {
        setTimezone(getReliableTimeZone());
      } finally {
        if (!cancelled) setTzLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  // helpers
  const applyTheme = (t: Theme) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const desired = t === 'system' ? (prefersDark ? 'dark' : 'light') : t;
    root.classList.toggle('dark', desired === 'dark');
  };

  const onChangeUnits = (u: Units) => {
    setUnits(u);
    localStorage.setItem('pref_units', u);
  };

  const onChangeTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem('pref_theme', t);
    applyTheme(t);
  };

  // dietary preferences are currently disabled in UI

  useEffect(() => {
    try {
      if (notifications) localStorage.setItem('pref_notifications', '1');
      else localStorage.setItem('pref_notifications', '0');
    } catch {}
  }, [notifications]);

  // Native (device) push helpers
  const ensureAndroidChannel = async () => {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await (PushNotifications as any).createChannel?.({
        id: 'default',
        name: 'Default',
        description: 'General notifications',
        importance: 4,
        visibility: 1,
        lights: true,
        vibration: true,
      });
    } catch {}
  };

  const enableDevicePush = async () => {
    setDevicePending(true);
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const perm = await PushNotifications.checkPermissions();
      let granted = perm.receive === 'granted';
      if (!granted) {
        const req = await PushNotifications.requestPermissions();
        granted = req.receive === 'granted';
      }
      if (!granted) {
        setDeviceEnabled(false);
        return;
      }
      await ensureAndroidChannel();
      // One-time listener to store token after register
      const once = (handler: any) => {
        const wrapped = (t: any) => { try { handler(t); } finally { PushNotifications.removeAllListeners?.(); } };
        return wrapped;
      };
      await PushNotifications.addListener('registration', once(async (token: any) => {
        try {
          await fetch('/api/store-fcm-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token.value, platform: 'android' }),
          });
          setDeviceEnabled(true);
        } catch {}
      }));
      await PushNotifications.register();
    } catch {
      // keep disabled on error
      setDeviceEnabled(false);
    } finally {
      setDevicePending(false);
    }
  };

  const disableDevicePush = async () => {
    setDevicePending(true);
    try {
      // Remove from our server so broadcasts won't target this device
      await fetch('/api/delete-fcm-token', { method: 'POST' });
      setDeviceEnabled(false);
    } catch {
    } finally {
      setDevicePending(false);
    }
  };

  const onToggleNotifications = async (v: boolean) => {
    if (isNativeCapacitor) {
      if (v) await enableDevicePush(); else await disableDevicePush();
    } else {
      if (v) await enable(); else await disable();
    }
  };

  const saveTimezone = async () => {
    if (!timezone) return;
    setTzSaving(true);
    try {
      const isIana = /\//.test(timezone) || timezone === 'UTC';
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: isIana ? timezone : 'UTC' }),
      });
      if (!res.ok) throw new Error('Failed to save timezone');
    } catch {
      // no-op; could toast
    } finally {
      setTzSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Settings</h1>
      <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
        {session ? (
          <>
            <p className="text-sm text-gray-700 dark:text-gray-300">Signed in as {session.user?.email}</p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Timezone (server preference) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Timezone</label>
                <div className="mt-1 flex items-center gap-2">
                  <select
                    className="input !px-3 !py-2 text-sm"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={tzLoading}
                  >
                    {/* Lightweight curated list + detected */}
                    {(() => {
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
                      return list.map((tz) => (
                        <option key={tz} value={tz}>{tz}{tz===detected?' (device)':''}</option>
                      ));
                    })()}
                  </select>
                  <button
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-600 text-white disabled:opacity-60"
                    onClick={saveTimezone}
                    disabled={tzSaving || tzLoading}
                  >
                    {tzSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Used to schedule reminders at local times.</p>
              </div>
              {/* Units */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Units</label>
                  <div className="inline-flex rounded-md border overflow-hidden border-gray-200 dark:border-gray-700">
                    <button
                      className={`px-3 py-1.5 text-sm ${units==='metric' ? 'bg-gray-900 text-white' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200'}`}
                      onClick={() => onChangeUnits('metric')}
                    >Metric</button>
                    <button
                      className={`px-3 py-1.5 text-sm border-l border-gray-200 dark:border-gray-700 ${units==='us' ? 'bg-gray-900 text-white' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200'}`}
                      onClick={() => onChangeUnits('us')}
                    >US</button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Applies to food inputs and displays.</p>
              </div>

              {/* Theme */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Theme</label>
                  <div className="inline-flex rounded-md border overflow-hidden border-gray-200 dark:border-gray-700">
                    {(['system','light','dark'] as Theme[]).map((t) => (
                      <button key={t}
                        className={`px-3 py-1.5 text-sm ${theme===t ? 'bg-gray-900 text-white' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200'} ${t!=='system' ? 'border-l border-gray-200 dark:border-gray-700' : ''}`}
                        onClick={() => onChangeTheme(t)}
                      >{t[0].toUpperCase()+t.slice(1)}</button>
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Instantly applied, respects system preference.</p>
              </div>

              {/* Dietary preferences */}
              {/* <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Dietary preferences</label>
                <input className="mt-1 input w-full" placeholder="e.g., vegetarian, low-carb" value={dietary} onChange={(e)=>onChangeDietary(e.target.value)} />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Used to tailor suggestions.</p>
              </div> */}

              {/* Notifications */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-200">Notifications</div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Reminders for logging meals and habits.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        (isNativeCapacitor ? deviceEnabled : !!notifications) ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'
                      }`}
                      onClick={() => onToggleNotifications(!(isNativeCapacitor ? deviceEnabled : !!notifications))}
                      disabled={isNativeCapacitor ? devicePending : pending}
                      aria-busy={isNativeCapacitor ? devicePending : pending}
                      aria-pressed={isNativeCapacitor ? deviceEnabled : !!notifications}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                        (isNativeCapacitor ? deviceEnabled : !!notifications) ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {(isNativeCapacitor ? devicePending : pending)
                        ? 'Working…'
                        : isNativeCapacitor
                        ? (deviceEnabled ? 'Enabled (device)' : 'Tap to enable (device)')
                        : notifStatus === 'unsupported'
                        ? 'Not supported'
                        : `Permission: ${notifStatus}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Developer: temporary link to Push Debug */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-200">Developer</div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Temporary debug tools.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href="/debug/push"
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-purple-600 text-white hover:bg-purple-700"
                    >
                      Open Push Debug
                    </a>
                    <button
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                      disabled={broadcastPending}
                      onClick={async () => {
                        try {
                          setBroadcastPending(true);
                          setBroadcastResult(null);
                          const res = await fetch('/api/admin/send-test-broadcast', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ limit: 3, dryRun: false }),
                          });
                          const json = await res.json();
                          setBroadcastResult(res.ok ? `Sent to ${json?.tokens ?? '?'} tokens` : json?.error || 'Error');
                        } catch (e: any) {
                          setBroadcastResult(e?.message || 'Error');
                        } finally {
                          setBroadcastPending(false);
                        }
                      }}
                    >
                      {broadcastPending ? 'Sending…' : 'Test Broadcast (3)'}
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-60"
                      disabled={broadcastPending}
                      onClick={async () => {
                        try {
                          setBroadcastPending(true);
                          setBroadcastResult(null);
                          const res = await fetch('/api/admin/send-test-broadcast', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ limit: 3, dryRun: true }),
                          });
                          const json = await res.json();
                          setBroadcastResult(res.ok ? `Dry run: would send to ${json?.tokenCount ?? '?'} tokens` : json?.error || 'Error');
                        } catch (e: any) {
                          setBroadcastResult(e?.message || 'Error');
                        } finally {
                          setBroadcastPending(false);
                        }
                      }}
                    >
                      {broadcastPending ? 'Testing…' : 'Dry Run (3)'}
                    </button>
                  </div>
                </div>
                {broadcastResult && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{broadcastResult}</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">Sign in to manage your preferences.</p>
        )}
      </div>
    </div>
  );
}

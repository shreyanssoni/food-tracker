"use client";
import { useEffect, useState } from 'react';
import { useNotifications } from '@/utils/notifications';
import { useSession } from 'next-auth/react';

type Units = 'metric' | 'us';
type Theme = 'system' | 'light' | 'dark';

export default function SettingsPage() {
  const { data: session } = useSession();

  const [units, setUnits] = useState<Units>('metric');
  const [theme, setTheme] = useState<Theme>('system');
  const [dietary, setDietary] = useState('');
  const { enabled: notifications, status: notifStatus, pending, toggle, enable, disable } = useNotifications();

  // load from localStorage
  useEffect(() => {
    try {
      const lu = (localStorage.getItem('pref_units') as Units) || 'metric';
      const lt = (localStorage.getItem('pref_theme') as Theme) || 'system';
      const ld = localStorage.getItem('pref_dietary') || '';
      const ln = localStorage.getItem('pref_notifications') === '1';
      setUnits(lu);
      setTheme(lt);
      setDietary(ld);
      // notifications state comes from hook; keep localStorage for backward compat
      applyTheme(lt);
    } catch {}
  }, []);

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

  const onChangeDietary = (v: string) => {
    setDietary(v);
    localStorage.setItem('pref_dietary', v);
  };

  useEffect(() => {
    try {
      if (notifications) localStorage.setItem('pref_notifications', '1');
      else localStorage.setItem('pref_notifications', '0');
    } catch {}
  }, [notifications]);

  const onToggleNotifications = async (v: boolean) => {
    if (v) await enable(); else await disable();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Settings</h1>
      <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
        {session ? (
          <>
            <p className="text-sm text-gray-700 dark:text-gray-300">Signed in as {session.user?.email}</p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Dietary preferences</label>
                <input className="mt-1 input w-full" placeholder="e.g., vegetarian, low-carb" value={dietary} onChange={(e)=>onChangeDietary(e.target.value)} />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Used to tailor suggestions.</p>
              </div>

              {/* Notifications */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-200">Notifications</div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Reminders for logging meals and habits.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notifications ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'}`}
                      onClick={() => toggle()}
                      disabled={pending}
                      aria-busy={pending}
                      aria-pressed={!!notifications}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${notifications ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {pending ? 'Working…' : notifStatus === 'unsupported' ? 'Not supported' : `Permission: ${notifStatus}`}
                    </span>
                  </div>
                </div>
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

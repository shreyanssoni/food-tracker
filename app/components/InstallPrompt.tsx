'use client';

import { useEffect, useState } from 'react';

// Minimal install prompt helper for Android Chrome
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const isMobileCheck = () => {
      try {
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        const narrow = window.matchMedia('(max-width: 1024px)').matches;
        return coarse || narrow;
      } catch {
        return false;
      }
    };

    const onBeforeInstall = (e: any) => {
      // Only handle on mobile; let desktop behave normally
      if (!isMobileCheck()) return;
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall as any);

    // Some browsers fire appinstalled; hide if installed
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    const onResize = () => setIsMobile(isMobileCheck());
    onResize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall as any);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  if (!isMobile || !visible || !deferred) return null;

  const install = async () => {
    try {
      deferred.prompt();
      const choice = await deferred.userChoice;
      // Regardless of outcome, hide prompt; browser decides cooldown
      setVisible(false);
      setDeferred(null);
      // Optional: console.log('install choice', choice);
    } catch {
      setVisible(false);
      setDeferred(null);
    }
  };

  const dismiss = () => {
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)]"
      role="dialog"
      aria-live="polite"
      aria-label="Add app to home screen"
    >
      <div className="mx-auto w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 backdrop-blur shadow-lg shadow-black/10 dark:shadow-black/40">
        <div className="flex items-start gap-3 p-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Add app to Home Screen</p>
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">Get quick access like a native app.</p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="shrink-0 p-2 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.9a1 1 0 0 0 1.41-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/>
            </svg>
          </button>
        </div>
        <div className="px-4 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={install}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm px-4 py-2.5 rounded-lg"
            >
              Install
            </button>
            <button
              onClick={dismiss}
              className="inline-flex items-center justify-center text-sm px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

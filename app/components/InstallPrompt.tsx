'use client';

import { useEffect, useState } from 'react';

// Minimal install prompt helper for Android Chrome
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: any) => {
      // Prevent auto prompt, stash it and show our UI
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

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall as any);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!visible || !deferred) return null;

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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 bg-gray-900 text-white text-sm px-3 py-2 rounded-full shadow-lg border border-gray-800">
        <span>Add app to home screen?</span>
        <button onClick={install} className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2 py-1 rounded">Install</button>
        <button onClick={dismiss} className="text-gray-300 hover:text-white text-xs">Dismiss</button>
      </div>
    </div>
  );
}

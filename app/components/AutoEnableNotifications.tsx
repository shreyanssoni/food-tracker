'use client';

import { useEffect } from 'react';
import { useNotifications, syncSubscriptionWithServer } from '@/utils/notifications';

// Auto-enable or sync notifications after login. This prompts users by default
// but avoids nagging by remembering a per-browser flag in localStorage.
export default function AutoEnableNotifications() {
  const { enabled, status, enable, refresh } = useNotifications();

  useEffect(() => {
    let disposed = false;

    const run = async () => {
      try {
        if (typeof window === 'undefined') return;
        // Quick refresh of current state
        await refresh();

        // If already granted, ensure server has the current subscription
        if (status === 'granted') {
          await syncSubscriptionWithServer();
          return;
        }

        // If permission undecided, try prompting once per browser install.
        if (status === 'default' && !enabled) {
          const key = 'notif_auto_prompt_v1';
          const last = window.localStorage.getItem(key);
          if (!last) {
            // Delay a touch so it doesn't block immediate UI
            setTimeout(async () => {
              try {
                await enable();
                window.localStorage.setItem(key, String(Date.now()));
              } catch {}
            }, 1200);
          }
        }
      } catch {}
    };

    run();
    return () => { disposed = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, enabled]);

  return null;
}

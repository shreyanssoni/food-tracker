import { useEffect, useState, useCallback } from 'react';

export type NotifStatus = 'granted' | 'denied' | 'default' | 'unsupported';

const EVT = 'notifications-changed';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Ensure the server has the current subscription associated to the signed-in user.
// Useful after sign-in when permission is already granted and a subscription exists.
export async function syncSubscriptionWithServer() {
  try {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const payload = sub.toJSON();
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
      // notify any listeners that subscription may have changed
      try { window.dispatchEvent(new Event(EVT)); } catch {}
    }
  } catch {}
}

async function getIsSubscribed(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return Boolean(sub);
  } catch { return false; }
}

export function useNotifications() {
  const [enabled, setEnabled] = useState<null | boolean>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<NotifStatus>('default');

  // initialize
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (typeof window === 'undefined') return;
        if (!('Notification' in window)) {
          if (!alive) return;
          setStatus('unsupported');
          setEnabled(false);
          return;
        }
        setStatus(Notification.permission as NotifStatus);
        const sub = await getIsSubscribed();
        if (!alive) return;
        setEnabled(sub);
      } catch {
        if (!alive) return;
        setEnabled(false);
      }
    })();

    // listen for cross-component changes
    const onChange = async () => {
      setStatus((typeof window !== 'undefined' && 'Notification' in window) ? (Notification.permission as NotifStatus) : 'unsupported');
      setEnabled(await getIsSubscribed());
    };
    window.addEventListener(EVT, onChange);
    return () => { alive = false; window.removeEventListener(EVT, onChange); };
  }, []);

  const enable = useCallback(async () => {
    if (pending) return;
    setPending(true);
    setEnabled(true); // optimistic
    try {
      if (!('serviceWorker' in navigator)) {
        setEnabled(false);
        return;
      }
      const permission = await Notification.requestPermission();
      setStatus(permission as NotifStatus);
      if (permission !== 'granted') {
        setEnabled(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string;
      if (!key) {
        setEnabled(false);
        alert('Missing VAPID public key (NEXT_PUBLIC_VAPID_PUBLIC_KEY)');
        return;
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
      const current = await reg.pushManager.getSubscription();
      setEnabled(!!current);
    } catch (e) {
      console.error('enable notifications failed', e);
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const current = await reg?.pushManager.getSubscription();
        setEnabled(!!current);
      } catch {}
    } finally {
      setPending(false);
      window.dispatchEvent(new Event(EVT));
    }
  }, [pending]);

  const disable = useCallback(async () => {
    if (pending) return;
    setPending(true);
    setEnabled(false); // optimistic
    try {
      if (!('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const raw = sub.toJSON();
        await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: raw.endpoint }) }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      const current = await reg.pushManager.getSubscription();
      setEnabled(!!current);
    } catch (e) {
      console.error('disable notifications failed', e);
    } finally {
      setPending(false);
      window.dispatchEvent(new Event(EVT));
    }
  }, [pending]);

  const toggle = useCallback(async () => {
    if (enabled) await disable(); else await enable();
  }, [enabled, enable, disable]);

  const refresh = useCallback(async () => {
    setEnabled(await getIsSubscribed());
    setStatus('Notification' in window ? (Notification.permission as NotifStatus) : 'unsupported');
  }, []);

  return { enabled, status, pending, enable, disable, toggle, refresh } as const;
}

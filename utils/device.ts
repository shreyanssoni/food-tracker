// Utility to manage per-device identifiers and read current push endpoint
// Stores a stable UUID in localStorage as device_id

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  const KEY = 'ft_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export async function getCurrentPushEndpoint(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint || null;
  } catch {
    return null;
  }
}

// utils/analytics.ts
// Lightweight client-safe analytics helper. Fire-and-forget.

const ANALYTICS_URL = '/api/analytics';

function sendBeaconOrFetch(payload: unknown) {
  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      // Ignore result; sendBeacon returns boolean but we don't need it
      (navigator as any).sendBeacon(ANALYTICS_URL, blob);
      return;
    }
  } catch {}
  // Fallback to fetch (keepalive allows background send on unload)
  try {
    fetch(ANALYTICS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function track(event: string, props?: Record<string, any>) {
  const body = { event, ts: Date.now(), ...(props || {}) };
  sendBeaconOrFetch(body);
}

export function trackMany(events: Array<{ event: string } & Record<string, any>>) {
  const now = Date.now();
  const batch = events.map((e) => ({ ts: e.ts ?? now, ...e }));
  sendBeaconOrFetch(batch);
}

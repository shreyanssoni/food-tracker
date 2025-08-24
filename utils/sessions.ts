import { getDeviceId, getCurrentPushEndpoint } from '@/utils/device';

export async function sendSessionHeartbeat(): Promise<{ ok: boolean; expired?: boolean }>
{
  try {
    const device_id = getDeviceId();
    const push_endpoint = await getCurrentPushEndpoint();
    const res = await fetch('/api/session/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id, push_endpoint }),
    });
    if (res.status === 401) return { ok: false, expired: true };
    if (!res.ok) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

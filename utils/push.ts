import webpush from 'web-push';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:you@example.com';

let configured = false;
function ensureConfigured() {
  if (!configured) {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      throw new Error('Missing VAPID keys. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY');
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    configured = true;
  }
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

// Minimal subscription shape expected by web-push
export interface WebPushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function sendWebPush(subscription: WebPushSubscription, payload: PushPayload) {
  ensureConfigured();
  const stripFences = (s: string | undefined) => {
    const raw = (s || '').trim();
    if (!raw) return '';
    if (raw.startsWith('```')) {
      const firstFenceEnd = raw.indexOf('\n');
      const rest = firstFenceEnd >= 0 ? raw.slice(firstFenceEnd + 1) : raw;
      const secondFence = rest.indexOf('```');
      if (secondFence >= 0) return rest.slice(0, secondFence).trim();
    }
    return raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  };
  const safe = {
    title: stripFences(payload.title).slice(0, 60) || 'Nourish',
    body: stripFences(payload.body).slice(0, 160),
    url: payload.url || '/',
  };
  const data = JSON.stringify(safe);
  try {
    const res = await webpush.sendNotification(subscription as any, data);
    return { ok: true as const, res };
  } catch (err: any) {
    const status = err?.statusCode;
    return { ok: false as const, statusCode: status, error: err };
  }
}

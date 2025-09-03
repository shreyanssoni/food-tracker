export type FcmMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';

export async function sendFcmToTokens(tokens: string[], msg: FcmMessage) {
  const key = process.env.FCM_SERVER_KEY;
  if (!key) throw new Error('Missing FCM_SERVER_KEY');
  if (!tokens.length) return { success: 0 } as const;

  const payload = {
    registration_ids: tokens,
    notification: {
      title: msg.title,
      body: msg.body,
    },
    data: msg.data ?? {},
    android: {
      priority: 'high',
      notification: { channel_id: 'default' },
    },
  };

  const res = await fetch(FCM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `key=${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FCM error: ${res.status} ${text}`);
  }
  return res.json();
}

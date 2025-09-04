export type FcmMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

const FCM_LEGACY_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// HTTP v1 endpoint: https://fcm.googleapis.com/v1/projects/PROJECT_ID/messages:send
function fcmV1Endpoint(projectId: string) {
  return `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
}

function base64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessTokenFromServiceAccount() {
  const clientEmail = process.env.FIREBASE_V1_CLIENT_EMAIL;
  // Normalize the private key from env: handle escaped newlines, quotes, and base64-only payloads
  let rawKey = (process.env.FIREBASE_V1_PRIVATE_KEY || '').trim();
  // Strip wrapping quotes if present (some hosts include surrounding quotes)
  if ((rawKey.startsWith('"') && rawKey.endsWith('"')) || (rawKey.startsWith("'") && rawKey.endsWith("'"))) {
    rawKey = rawKey.slice(1, -1);
  }
  // Replace literal \n with real newlines
  rawKey = rawKey.replace(/\\n/g, '\n');

  // If key is a single line without PEM markers, try to treat it as base64 and wrap into PKCS8 PEM
  const hasPemMarkers = rawKey.includes('BEGIN PRIVATE KEY') || rawKey.includes('BEGIN RSA PRIVATE KEY');
  if (!hasPemMarkers) {
    const b64 = rawKey.replace(/\s+/g, '');
    const chunked = b64.match(/.{1,64}/g)?.join('\n') || b64;
    rawKey = `-----BEGIN PRIVATE KEY-----\n${chunked}\n-----END PRIVATE KEY-----\n`;
  }
  const privateKey = rawKey;
  if (!clientEmail || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const toSign = `${encodedHeader}.${encodedPayload}`;

  const crypto = await import('node:crypto');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(toSign);
  // Parse key via createPrivateKey to avoid OpenSSL unsupported errors due to formatting
  let keyObject: any;
  try {
    keyObject = crypto.createPrivateKey({ key: privateKey, format: 'pem' as any });
  } catch (e) {
    throw new Error(`Invalid FIREBASE_V1_PRIVATE_KEY: ${(e as Error).message}`);
  }
  const signature = signer.sign(keyObject);
  const jwt = `${toSign}.${base64url(signature)}`;

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token error: ${res.status} ${text}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

async function sendViaLegacy(tokens: string[], msg: FcmMessage) {
  const key = process.env.FCM_SERVER_KEY;
  if (!key) return null;
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

  const res = await fetch(FCM_LEGACY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `key=${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FCM legacy error: ${res.status} ${text}`);
  }
  return res.json();
}

async function sendViaV1(tokens: string[], msg: FcmMessage) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  if (!tokens.length) return { success: 0 } as const;

  const accessToken = await getAccessTokenFromServiceAccount();
  if (!accessToken) return null;

  // For multiple tokens, send as multicast by batching individual messages
  // HTTP v1 supports send via batch endpoints, but we'll loop for simplicity
  const results: any[] = [];
  for (const token of tokens) {
    const message = {
      message: {
        token,
        notification: {
          title: msg.title,
          body: msg.body,
        },
        data: msg.data ?? {},
        android: {
          priority: 'HIGH',
          notification: { channel_id: 'default' },
        },
      },
    };

    const res = await fetch(fcmV1Endpoint(projectId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      const text = await res.text();
      results.push({ ok: false, status: res.status, error: text });
    } else {
      results.push(await res.json());
    }
  }
  return { ok: true, results };
}

export async function sendFcmToTokens(tokens: string[], msg: FcmMessage) {
  // Try legacy if configured
  if (process.env.FCM_SERVER_KEY) {
    return sendViaLegacy(tokens, msg);
  }
  // Else try HTTP v1 via service account
  const v1 = await sendViaV1(tokens, msg);
  if (v1) return v1;

  throw new Error(
    'FCM not configured. Provide either FCM_SERVER_KEY (legacy) or FIREBASE_PROJECT_ID + FIREBASE_V1_CLIENT_EMAIL + FIREBASE_V1_PRIVATE_KEY (HTTP v1).'
  );
}

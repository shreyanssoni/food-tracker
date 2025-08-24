import { createClient } from '@/utils/supabase/server';
import { geminiText } from '@/utils/ai';
import { sendWebPush, type WebPushSubscription, type PushPayload } from '@/utils/push';

const SLOT_VALUES = ['morning','midday','evening','night'] as const;
export type Slot = typeof SLOT_VALUES[number];

export function slotFromHour(hour: number): Slot {
  if (hour >= 6 && hour <= 10) return 'morning';
  if (hour >= 11 && hour <= 14) return 'midday';
  if (hour >= 17 && hour <= 20) return 'evening';
  return 'night';
}

// Normalize common IANA aliases to a single canonical form, while preserving accepted aliases
function normalizeTimezone(tz: string): { canonical: string; accepted: string[] } {
  const inStr = (tz || '').trim();
  const lower = inStr.toLowerCase();
  // Known alias: Asia/Calcutta -> Asia/Kolkata
  if (lower === 'asia/calcutta') {
    return { canonical: 'Asia/Kolkata', accepted: ['Asia/Kolkata', 'Asia/Calcutta'] };
  }
  // Add more aliases here if needed
  return { canonical: inStr || 'Asia/Kolkata', accepted: [inStr || 'Asia/Kolkata'] };
}

function buildPrompt(slot: Slot, timezone: string) {
  return `You are an empathetic nutrition coach. Write a concise push notification (title + body) for the ${slot} slot.
Audience: busy professionals in timezone ${timezone}.
Constraints:
- Title <= 45 chars, imperative or inviting
- Body <= 120 chars, actionable and positive
- Focus on protein-forward, hydration, and a tiny habit
- No emojis
Return JSON with keys: title, body, url (path starting with /).`;
}

export async function generateMessageFor(slot: Slot, timezone: string) {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0,10);
  const { canonical: tz } = normalizeTimezone(timezone || 'Asia/Kolkata');

  // Use cache first
  const { data: cached } = await supabase
    .from('push_message_cache')
    .select('*')
    .eq('date', today)
    .eq('slot', slot)
    .eq('timezone', tz)
    .maybeSingle();

  if (cached) {
    const stripFences = (s: string | null | undefined) => {
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
    const cleanTitle = stripFences(cached.title).slice(0, 60) || 'Healthy nudge';
    const cleanBody = stripFences(cached.body).slice(0, 160);
    const cleanUrl = (typeof cached.url === 'string' && cached.url.startsWith('/')) ? cached.url : '/';
    // If we had to clean, update cache in background (no await to avoid latency)
    if (cleanTitle !== cached.title || cleanBody !== cached.body || cleanUrl !== (cached.url || '/')) {
      void (async () => {
        try {
          await supabase.from('push_message_cache').upsert({
            date: today,
            slot,
            timezone: tz,
            title: cleanTitle,
            body: cleanBody,
            url: cleanUrl,
          }, { onConflict: 'date,slot,timezone' });
        } catch {}
      })();
    }
    return { title: cleanTitle, body: cleanBody, url: cleanUrl } as PushPayload;
  }

  // Generate fresh
  const prompt = buildPrompt(slot, tz);
  const text = await geminiText(prompt);

  let title = 'Healthy nudge';
  let body = text?.slice(0, 120) || 'Stay hydrated and add a lean protein to your next meal!';
  let url = '/suggestions';
  try {
    // Attempt to robustly parse JSON even if wrapped in markdown code fences
    const cleaned = (() => {
      const raw = (text || '').trim();
      if (!raw) return raw;
      // If fenced, try to grab the content inside the first fence pair
      if (raw.startsWith('```')) {
        const firstFenceEnd = raw.indexOf('\n');
        const rest = firstFenceEnd >= 0 ? raw.slice(firstFenceEnd + 1) : raw;
        const secondFence = rest.indexOf('```');
        if (secondFence >= 0) return rest.slice(0, secondFence).trim();
      }
      // Strip any lingering fences markup
      return raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    })();

    let parsed: any = null;
    try {
      parsed = cleaned ? JSON.parse(cleaned) : null;
    } catch {
      // Fallback: extract first JSON object substring
      const m = (cleaned || '').match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch {}
      }
    }

    if (parsed) {
      if (parsed?.title) title = String(parsed.title).slice(0, 60);
      if (parsed?.body) body = String(parsed.body).slice(0, 160);
      if (parsed?.url && typeof parsed.url === 'string' && parsed.url.startsWith('/')) url = parsed.url;
    } else {
      // If parsing failed, at least remove fences from body preview
      body = cleaned.slice(0, 160) || body;
    }
  } catch {}

  await supabase.from('push_message_cache').upsert({
    date: today,
    slot,
    timezone: tz,
    title,
    body,
    url,
  }, { onConflict: 'date,slot,timezone' });

  return { title, body, url } as PushPayload;
}

export async function broadcastToTimezone(slot: Slot, timezone: string) {
  const supabase = createClient();
  const { canonical: tz, accepted } = normalizeTimezone(timezone || 'Asia/Kolkata');
  const payload = await generateMessageFor(slot, tz);

  // Get users in timezone
  const { data: users, error: uErr } = await supabase
    .from('user_preferences')
    .select('user_id')
    .in('timezone', accepted);
  if (uErr) throw uErr;
  const ids = (users || []).map(u => u.user_id);
  if (!ids.length) return { sent: 0 };

  // Get subscriptions for those users
  const { data: subs, error: sErr } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth, expiration_time')
    .in('user_id', ids);
  if (sErr) throw sErr;

  let sent = 0;
  for (const row of subs || []) {
    const subscription: WebPushSubscription = {
      endpoint: row.endpoint,
      expirationTime: row.expiration_time ?? null,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
    const res = await sendWebPush(subscription, payload);
    if (!res.ok) {
      const status = res.statusCode;
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
      }
      await supabase.from('push_sends').insert({
        user_id: row.user_id,
        slot,
        title: payload.title,
        body: payload.body,
        url: payload.url || '/',
        success: false,
        status_code: status ?? null,
      });
    } else {
      sent += 1;
      await supabase.from('push_sends').insert({
        user_id: row.user_id,
        slot,
        title: payload.title,
        body: payload.body,
        url: payload.url || '/',
        success: true,
        status_code: 201,
      });
    }
  }

  return { sent };
}

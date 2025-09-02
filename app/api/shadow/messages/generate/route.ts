import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCurrentUser } from '@/utils/auth';
import { geminiText } from '@/utils/ai';

// POST /api/shadow/messages/generate
// Auth:
//  - If header x-cron-secret or ?secret= matches CRON_SECRET, can target any user or all users.
//  - Otherwise must be authenticated and may only target self.
// Body options:
//  {
//    userId?: string         // target specific user (requires cron secret unless equals current user)
//    all?: boolean           // when true, generate for all users with a shadow_profile (cron-only)
//    debug?: boolean         // optional: include debug details in response
//  }
export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient();

    const secret = process.env.CRON_SECRET;
    const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
    const hasSecret = Boolean(secret && provided && secret === provided);

    const bodyFromJson = (await req.json().catch(() => ({}))) as Partial<{
      userId: string;
      all: boolean;
      debug: boolean;
    }>;
    // Fallback to query params if body is empty
    const sp = req.nextUrl.searchParams;
    const body: Partial<{ userId: string; all: boolean; debug: boolean }> = {
      userId: (bodyFromJson.userId || sp.get('userId') || undefined) as any,
      all: Boolean(bodyFromJson.all ?? (sp.get('all') === '1')),
      debug: Boolean(bodyFromJson.debug ?? (sp.get('debug') === '1')),
    };

    // Resolve caller and target scope
    let sessionUserId: string | null = null;
    if (!hasSecret) {
      const me = await getCurrentUser();
      sessionUserId = me?.id ?? null;
      if (!sessionUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (body.userId && body.userId !== sessionUserId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (body.all) {
        return NextResponse.json({ error: 'Forbidden: all requires cron secret' }, { status: 403 });
      }
    }

    const targetUsers: string[] = [];
    if (hasSecret && body.all) {
      // All users that have a shadow_profile row
      const { data: profiles, error: pErr } = await admin
        .from('shadow_profile')
        .select('user_id')
        .order('updated_at', { ascending: false })
        .limit(5000);
      if (pErr) throw pErr;
      for (const p of profiles || []) {
        const uid = String((p as any).user_id || '').trim();
        if (uid) targetUsers.push(uid);
      }
    } else {
      const uid = body.userId || sessionUserId;
      if (!uid) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
      targetUsers.push(uid);
    }

    const results: any[] = [];
    for (const uid of targetUsers) {
      const r = await generateOneForUser(uid, admin).catch((e: any) => ({ ok: false, error: e?.message || 'error' }));
      results.push({ userId: uid, ...r });
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, processed: results.length, success: okCount, results: (body?.debug ? results : undefined) });
  } catch (e) {
    console.error('[shadow/messages/generate] error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Core per-user generator
async function generateOneForUser(userId: string, admin: ReturnType<typeof createAdminClient>) {
  const now = new Date();
  const expiry = new Date(now.getTime() + 3 * 60 * 60 * 1000); // +3 hours

  // Load shadow_profile for persona and timezone
  const { data: profile, error: profErr } = await admin
    .from('shadow_profile')
    .select('id, user_id, persona_type, timezone, preferences')
    .eq('user_id', userId)
    .maybeSingle();
  if (profErr) throw profErr;
  if (!profile) return { ok: false, error: 'No shadow_profile' };

  const persona: string = String((profile as any).persona_type || 'neutral');
  const tz: string = String((profile as any).timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata');

  // Fetch tasks and schedules similar to /api/tasks/today, but using admin client and limited fields
  const { data: tasks, error: tErr } = await admin
    .from('tasks')
    .select('id, user_id, title, active')
    .eq('user_id', userId)
    .eq('active', true);
  if (tErr) throw tErr;
  const ids = (tasks || []).map((t: any) => t.id);

  let schedules: any[] = [];
  if (ids.length) {
    const { data: scheds, error: sErr } = await admin
      .from('task_schedules')
      .select('task_id, frequency, byweekday, timezone, start_date, end_date')
      .in('task_id', ids);
    if (sErr) throw sErr;
    schedules = scheds || [];
  }

  const schedByTask: Record<string, any> = {};
  for (const s of schedules) schedByTask[s.task_id as string] = s;

  // Helpers copied from /api/tasks/today
  const normalizeTz = (tzIn?: string | null) => {
    const t = String(tzIn || '').trim();
    return t || (process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata');
  };
  const dateStrInTZ = (tzIn?: string | null, at?: Date) => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: normalizeTz(tzIn),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(at || now);
  };
  const dowInTZ = (tzIn?: string | null, at?: Date) => {
    try {
      const wd = new Intl.DateTimeFormat('en-US', { timeZone: normalizeTz(tzIn), weekday: 'short' }).format(at || now);
      const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return map[wd as keyof typeof map] ?? (at || now).getDay();
    } catch {
      return (at || now).getDay();
    }
  };

  const isDueToday = (taskId: string) => {
    const s = schedByTask[taskId];
    if (!s) return false;
    const todayStr = dateStrInTZ(s.timezone, now);
    if (s.start_date) {
      const start = String(s.start_date || '').slice(0, 10);
      const end = s.end_date ? String(s.end_date).slice(0, 10) : null;
      if (s.frequency === 'once') return todayStr === start;
      if (end) {
        if (!(todayStr >= start && todayStr <= end)) return false;
      } else {
        if (!(todayStr >= start)) return false;
      }
    }
    if (s.frequency === 'once') return false;
    if (s.frequency === 'daily') return true;
    if (s.frequency === 'weekly') {
      const d = dowInTZ(s.timezone, now);
      const hasDays = Array.isArray(s.byweekday) && (s.byweekday as any[]).length > 0;
      return hasDays ? (s.byweekday as any[]).includes(d) : true;
    }
    if (s.frequency === 'custom') {
      const d = dowInTZ(s.timezone, now);
      return Array.isArray(s.byweekday) && s.byweekday.includes(d);
    }
    return false;
  };

  const due = (tasks || []).filter((t: any) => isDueToday(t.id));

  // Decide tone and type
  const type: 'taunt' | 'encouragement' | 'neutral' =
    persona === 'strict' ? 'taunt' : persona === 'mentor' || persona === 'playful' ? 'encouragement' : 'neutral';

  let text = '';
  if (due.length > 0) {
    const titles = due.slice(0, 3).map((t: any) => t.title).filter(Boolean);
    const list = titles.join(', ');
    const prompt = `Persona: ${persona}. Timezone: ${tz}. Generate a short ${type} message (max 180 chars) addressing the user's upcoming tasks today: ${list}. Keep it practical and motivating; avoid emojis.`;
    try {
      text = (await geminiText(prompt)) || '';
    } catch {}
    if (!text || text.startsWith('We are rate-limited')) {
      text = fallbackFor(type, titles);
    }
  } else {
    const prompt = `Persona: ${persona}. Timezone: ${tz}. The user has no scheduled tasks today. Generate a short ${type} message (max 180 chars) to ${type === 'taunt' ? 'lightly challenge their inactivity' : type === 'encouragement' ? 'encourage them to create a small habit or task' : 'neutrally suggest starting something simple'}. Avoid emojis.`;
    try {
      text = (await geminiText(prompt)) || '';
    } catch {}
    if (!text || text.startsWith('We are rate-limited')) {
      text = fallbackNoTasks(type);
    }
  }

  // Insert into shadow_messages
  const { data: inserted, error: iErr } = await admin
    .from('shadow_messages')
    .insert({ user_id: userId, type, text, expiry: expiry.toISOString() })
    .select('id, created_at')
    .maybeSingle();
  if (iErr) throw iErr;

  // Focused notification (inbox)
  const title = 'Shadow sent a message';
  await admin
    .from('user_messages')
    .insert({ user_id: userId, title, body: text, url: '/dashboard' });

  // Web push via internal route
  try {
    const base = process.env.PUBLIC_BASE_URL || '';
    const secret = process.env.CRON_SECRET || '';
    if (base && secret) {
      await fetch(`${base}/api/push/send-to-user?secret=${encodeURIComponent(secret)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title, body: text, url: '/dashboard' }),
      }).catch(() => {});
    }
  } catch {}

  return { ok: true, messageId: inserted?.id || null, type };
}

function fallbackFor(type: 'taunt' | 'encouragement' | 'neutral', titles: string[]): string {
  const list = titles.slice(0, 3).join(', ');
  if (type === 'taunt') return `Still stalling? Knock out: ${list}. Prove it now.`;
  if (type === 'encouragement') return `You’ve got this. Start with: ${list}. One small win first.`;
  return `On deck today: ${list}. Pick one and start.`;
}

function fallbackNoTasks(type: 'taunt' | 'encouragement' | 'neutral'): string {
  if (type === 'taunt') return 'No plans? Set one now. Even a 5‑minute task beats excuses.';
  if (type === 'encouragement') return 'No tasks yet—create one tiny step for today. Momentum > perfection.';
  return 'Nothing scheduled. Add one simple task to move forward today.';
}

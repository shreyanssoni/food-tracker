import { createAdminClient } from '@/utils/supabase/admin';

export type ShadowMetrics = {
  lead_now: number; // positive means shadow leads
  idle_minutes: number; // minutes since last user completion
};

export async function getTodayTauntCount(user_id: string, tz: string = process.env.DEFAULT_TIMEZONE || 'UTC'): Promise<number> {
  const admin = createAdminClient();
  // Count by UTC day by default; if tz provided, use date range in that tz
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const start = new Date(`${todayStr}T00:00:00`);
  const end = new Date(`${todayStr}T23:59:59.999`);
  const { count } = await admin
    .from('ai_taunts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user_id)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());
  return count || 0;
}

export async function computeMetrics(user_id: string, tz: string = process.env.DEFAULT_TIMEZONE || 'UTC'): Promise<ShadowMetrics> {
  const admin = createAdminClient();
  // lead_now from today's shadow_progress_daily if available
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const { data: daily } = await admin
    .from('shadow_progress_daily')
    .select('date, lead')
    .eq('user_id', user_id)
    .eq('date', todayStr)
    .maybeSingle();
  const lead_now = Number(daily?.lead ?? 0);

  // idle minutes since last completion (any recent row)
  const { data: lastComp } = await admin
    .from('task_completions')
    .select('completed_at')
    .eq('user_id', user_id)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let idle_minutes = 1e9; // if never, treat as very idle
  if (lastComp?.completed_at) {
    const last = new Date(lastComp.completed_at);
    idle_minutes = Math.max(0, Math.floor((Date.now() - last.getTime()) / 60000));
  }

  return { lead_now, idle_minutes };
}

export function isCritical(m: ShadowMetrics): boolean {
  return m.lead_now > 3 || m.idle_minutes >= 120; // shadow ahead a lot OR idle >= 2h
}

export function inRandomSlot(now = new Date(), tz: string = process.env.DEFAULT_TIMEZONE || 'UTC'): boolean {
  // Slots: 10:00, 15:00, 20:00 in tz, fire within +/- 10 minutes
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = fmt.formatToParts(now);
  const hh = Number(parts.find(p => p.type === 'hour')?.value || '00');
  const mm = Number(parts.find(p => p.type === 'minute')?.value || '00');
  const minutesOfDay = hh * 60 + mm;
  const windows = [10 * 60, 15 * 60, 20 * 60];
  return windows.some(slot => Math.abs(minutesOfDay - slot) <= 10);
}

export function pickTauntMessage(kind: 'random' | 'critical', m: ShadowMetrics): { intensity: 'low' | 'medium' | 'high', message: string } {
  if (kind === 'critical') {
    if (m.lead_now > 6) return { intensity: 'high', message: `Shadow is flying — ${m.lead_now.toFixed(0)} steps ahead now!` };
    if (m.idle_minutes >= 240) return { intensity: 'high', message: `Shadow went on without you — been ${Math.floor(m.idle_minutes/60)}h idle.` };
    return { intensity: 'medium', message: m.lead_now > 3 ? `Shadow is pulling away (${m.lead_now.toFixed(0)} ahead).` : `It's been ${m.idle_minutes}m. Ready to move?` };
  }
  // random slot
  if (m.lead_now <= -1 && m.idle_minutes < 45) {
    return { intensity: 'low', message: `Neck and neck. One push tilts it.` };
  }
  if (m.lead_now > 1) {
    return { intensity: 'medium', message: `Shadow’s a step ahead already.` };
  }
  if (m.idle_minutes >= 45) {
    return { intensity: 'medium', message: `Shadow went on without you.` };
  }
  return { intensity: 'low', message: `Shadow watches. Keep rolling.` };
}

export async function maybeGenerateTaunt(user_id: string, opts?: { forceCritical?: boolean; tz?: string; adminInsertAlsoToUserMessages?: boolean; }): Promise<{ created: boolean; reason?: string; payload?: any }> {
  const tz = opts?.tz || process.env.DEFAULT_TIMEZONE || 'UTC';
  const cap = 3; // daily cap
  const count = await getTodayTauntCount(user_id, tz);
  if (count >= cap) return { created: false, reason: 'cap_reached' };

  const m = await computeMetrics(user_id, tz);
  const critical = opts?.forceCritical || isCritical(m);
  const now = new Date();
  const randomSlot = inRandomSlot(now, tz);

  let kind: 'random' | 'critical' | null = null;
  if (critical) {
    kind = 'critical';
  } else if (randomSlot) {
    // baseline triggers only if behind/idle
    if (m.lead_now > 1 || m.idle_minutes >= 45) kind = 'random';
  }
  if (!kind) return { created: false, reason: 'no_trigger' };

  const { intensity, message } = pickTauntMessage(kind, m);
  const admin = createAdminClient();
  const { error } = await admin.from('ai_taunts').insert({
    user_id,
    intensity,
    outcome: null,
    message,
    meta: { kind, metrics: m },
  } as any);
  if (error) return { created: false, reason: 'insert_failed', payload: { error: error.message } };

  if (opts?.adminInsertAlsoToUserMessages) {
    try {
      await admin.from('user_messages').insert({ user_id, title: 'Shadow taunt', body: message, url: '/shadow' });
    } catch {}
  }

  return { created: true, payload: { kind, intensity, message, metrics: m } };
}

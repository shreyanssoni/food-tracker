import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';
import { getShadowConfig, logDryRun } from '@/utils/shadow/config';

function todayInTz(tz: string): string {
  // Format YYYY-MM-DD in the given IANA timezone
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    const cfg = await getShadowConfig(user.id);

    // Resolve timezone: user preference -> DEFAULT_TIMEZONE -> Asia/Kolkata
    let tz = 'Asia/Kolkata';
    try {
      const { data: pref } = await supabase
        .from('user_preferences')
        .select('timezone')
        .eq('user_id', user.id)
        .maybeSingle();
      tz = String(pref?.timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata');
    } catch {}

    const today = todayInTz(tz);

    // Count today's completions for base user tasks (exclude shadow-owned tasks)
    // Join to tasks to ensure we only count base tasks
    const { data: rows, error } = await supabase
      .from('task_completions')
      .select('task_id')
      .eq('user_id', user.id)
      .eq('completed_on', today);
    if (error) throw error;

    // Fetch owner_type for these task_ids and filter out shadow tasks
    const ids = Array.from(new Set((rows || []).map((r: any) => r.task_id)));
    let completedTaskIds: string[] = [];
    if (ids.length) {
      const { data: ts, error: tErr } = await supabase
        .from('tasks')
        .select('id, owner_type')
        .in('id', ids as any);
      if (tErr) throw tErr;
      completedTaskIds = (ts || [])
        .filter((t: any) => (t.owner_type ?? 'user') === 'user')
        .map((t: any) => t.id as string);
    }

    const completedToday = completedTaskIds.length;
    // Target pace: prefer explicit shadow_speed_target; fallback to base_speed; floor to integer per day
    const targetToday = Math.max(0, Math.round((cfg.shadow_speed_target ?? cfg.base_speed)));
    const delta = completedToday - targetToday;

    const payload = { tz, today, completedToday, targetToday, delta, completedTaskIds };
    await logDryRun(user.id, 'race_update', payload);

    return NextResponse.json(payload);
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

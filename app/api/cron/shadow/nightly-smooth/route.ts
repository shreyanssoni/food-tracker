import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

// POST /api/cron/shadow/nightly-smooth
// Secured by header: x-cron-secret === process.env.CRON_SECRET
// Iterates enabled users and applies EMA smoothing and taunt insertion
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-cron-secret');
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();

    const { data: cfgRows, error: cErr } = await admin
      .from('shadow_config')
      .select('user_id')
      .eq('enabled_race', true);
    if (cErr) throw cErr;

    const users = (cfgRows || []).map((r: any) => r.user_id as string);
    const results: Array<any> = [];

    for (const user_id of users) {
      try {
        const { data: rows, error } = await admin
          .from('shadow_progress_daily')
          .select('date, user_speed_avg, shadow_speed_target, lead')
          .eq('user_id', user_id)
          .order('date', { ascending: false })
          .limit(7);
        if (error) throw error;

        const series = (rows || []).reverse();
        if (!series.length) {
          results.push({ user_id, ok: false, reason: 'no_rows' });
          continue;
        }

        const alpha = 0.25;
        let ema = Number(series[0].user_speed_avg || 0);
        for (let i = 1; i < series.length; i++) {
          const x = Number(series[i].user_speed_avg || ema);
          ema = alpha * x + (1 - alpha) * ema;
        }
        const minClamp = 0.5, maxClamp = 5.0;
        const smoothed = Math.max(minClamp, Math.min(maxClamp, Number(ema.toFixed(2))));

        const latest = series[series.length - 1];
        const { error: upErr } = await admin
          .from('shadow_progress_daily')
          .update({ shadow_speed_target: smoothed })
          .eq('user_id', user_id)
          .eq('date', latest.date);
        if (upErr) throw upErr;

        const lead = Number(latest.lead || 0);
        let title = 'Shadow Update';
        let body = '';
        if (lead > 2) {
          title = 'Shadow Taunt: Catch me if you can';
          body = `Your shadow is ahead by ${lead.toFixed(1)}. New target set to ${smoothed}. Tomorrow is your move.`;
        } else if (lead < -2) {
          title = 'Shadow Taunt: Feeling the heat?';
          body = `You are ahead by ${(-lead).toFixed(1)}. Shadow bumps pace to ${smoothed}. Keep the lead.`;
        } else {
          title = 'Shadow Taunt: Neck and neck';
          body = `It’s close. Shadow sets pace ${smoothed}. One push tilts the race.`;
        }

        // rate-limited write
        let blocked: string | undefined;
        try {
          const todayIso = new Date().toISOString().slice(0, 10);
          const { data: msgsToday } = await admin
            .from('user_messages')
            .select('id, created_at')
            .eq('user_id', user_id)
            .gte('created_at', `${todayIso}T00:00:00.000Z`);
          const countToday = (msgsToday || []).length;
          if (countToday < 20) {
            await admin.from('user_messages').insert({ user_id, title, body, url: '/shadow' });
          } else {
            blocked = 'rate_limit_daily';
          }
        } catch (e) {
          blocked = blocked || 'write_error';
        }

        results.push({ user_id, ok: true, smoothed, blocked });
      } catch (e: any) {
        results.push({ user_id, ok: false, error: e?.message || 'failed' });
      }
    }

    return NextResponse.json({ ok: true, total: users.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { createClient } from '@/utils/supabase/server';

// Phase 6B: Nightly EMA smoothing + optional taunt enqueue
// Computes a smoothed shadow_speed_target using EMA of recent user_speed signals and writes a subtle taunt
export async function POST() {
  try {
    const user = await requireUser();
    const supabase = createClient();

    // Pull last N days of daily rows
    const N = 7;
    const { data: rows, error } = await supabase
      .from('shadow_progress_daily')
      .select('date, user_speed_avg, shadow_speed_target, lead')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(N);
    if (error) throw error;

    const series = (rows || []).reverse();
    if (!series.length) return NextResponse.json({ error: 'No progress rows' }, { status: 404 });

    // EMA over user_speed_avg to set tomorrow's target
    const alpha = 0.25; // slower, nightly smoothing
    let ema = Number(series[0].user_speed_avg || 0);
    for (let i = 1; i < series.length; i++) {
      const x = Number(series[i].user_speed_avg || ema);
      ema = alpha * x + (1 - alpha) * ema;
    }
    const minClamp = 0.5, maxClamp = 5.0;
    const smoothed = Math.max(minClamp, Math.min(maxClamp, Number(ema.toFixed(2))));

    // Update the most recent row's target as baseline for tomorrow (or maintain a separate field if available)
    const latest = series[series.length - 1];
    const { error: upErr } = await supabase
      .from('shadow_progress_daily')
      .update({ shadow_speed_target: smoothed })
      .eq('user_id', user.id)
      .eq('date', latest.date);
    if (upErr) throw upErr;

    // Optional taunt based on latest lead
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

    // Write taunt into user_messages (non-blocking error handling)
    try {
      const { error: msgErr } = await supabase
        .from('user_messages')
        .insert({ user_id: user.id, title, body, url: '/shadow' });
      if (msgErr) console.error('taunt insert error', msgErr);
    } catch (e) { console.error('taunt write caught', e); }

    return NextResponse.json({ ok: true, smoothed_target: smoothed, latest_date: latest.date });
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

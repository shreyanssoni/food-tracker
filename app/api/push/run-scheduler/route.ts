import { NextRequest, NextResponse } from 'next/server';
import { broadcastToTimezone, slotFromExactHour, type Slot } from '@/utils/broadcast';
import { createClient } from '@/utils/supabase/server';

function hourInTimezone(tz: string) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz });
    const parts = fmt.formatToParts(new Date());
    const hourStr = parts.find(p => p.type === 'hour')?.value || '0';
    return parseInt(hourStr, 10);
  } catch {
    return new Date().getUTCHours();
  }
}

export async function GET(req: NextRequest) {
  try {
    // Auth: allow either CRON_SECRET or Vercel Cron header
    const secret = process.env.CRON_SECRET;
    const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
    const isVercelCron = req.headers.get('x-vercel-cron');
    if (!isVercelCron && secret && secret !== provided) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch distinct timezones
    const supabase = createClient();
    const { data: rows, error } = await supabase.from('user_preferences').select('timezone');
    if (error) throw error;
    const tzs = Array.from(new Set((rows || []).map((r: any) => String(r?.timezone || '').trim()).filter(Boolean)));
    const finalTzs = tzs.length ? tzs : [process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata'];

    const results: Array<{ timezone: string; slot: Slot; sent: number }> = [];
    for (const tz of finalTzs) {
      const hour = hourInTimezone(tz);
      const minute = new Date().getMinutes();
      const slot = minute >= 56 || minute < 5 ? slotFromExactHour(hour) : null;
      if (!slot) continue; // only send at exact hours 8-22:56, 23:00-23:04
      const res = await broadcastToTimezone(slot, tz);
      results.push({ timezone: tz, slot, sent: res.sent });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error('run-scheduler GET error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Auth: allow either CRON_SECRET or Vercel Cron header
    const secret = process.env.CRON_SECRET;
    const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
    const isVercelCron = req.headers.get('x-vercel-cron');
    if (!isVercelCron && secret && secret !== provided) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    let tzs: string[] = Array.isArray(body?.timezones) ? body.timezones : (body?.timezone ? [body.timezone] : []);
    const slotParam: Slot | undefined = body?.slot;

    if (tzs.length === 0) {
      // Auto-fetch distinct timezones from user preferences
      const supabase = createClient();
      const { data: rows, error } = await supabase
        .from('user_preferences')
        .select('timezone');
      if (error) throw error;
      const uniq = new Set<string>();
      for (const r of rows || []) {
        const tz = (r as any)?.timezone;
        if (typeof tz === 'string' && tz.trim()) uniq.add(tz.trim());
      }
      if (uniq.size === 0) {
        const fallback = process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
        tzs = [fallback];
      } else {
        tzs = Array.from(uniq);
      }
    }

    const results: Array<{ timezone: string; slot: Slot; sent: number }> = [];

    for (const tz of tzs) {
      const hour = hourInTimezone(tz);
      const derived = slotFromExactHour(hour);
      const slot = slotParam || derived;
      if (!slot) continue; // skip if not an exact-hour window and no explicit slot provided
      const res = await broadcastToTimezone(slot, tz);
      results.push({ timezone: tz, slot, sent: res.sent });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error('run-scheduler error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { maybeGenerateTaunt } from '@/utils/shadow/tauntEngine';

// POST /api/cron/shadow/taunt-maybe
// Secured by header: x-cron-secret === process.env.CRON_SECRET
// Iterates enabled users and runs taunt engine with daily cap + random slots
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

    const users = (cfgRows || []).map((r: any) => r.user_id as string).filter(Boolean);
    const results: Array<any> = [];

    for (const user_id of users) {
      try {
        const r = await maybeGenerateTaunt(user_id, { adminInsertAlsoToUserMessages: true });
        results.push({ user_id, ...r });
      } catch (e: any) {
        results.push({ user_id, created: false, error: e?.message || 'failed' });
      }
    }

    return NextResponse.json({ ok: true, total: users.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';
import { broadcastToTimezone, type Slot } from '@/utils/broadcast';

const SLOT_VALUES = ['morning','midday','evening','night'] as const;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    // Restrict to admins outside dev
    const { data: me } = await supabase.from('app_users').select('is_sys_admin').eq('id', user.id).maybeSingle();
    if (process.env.NODE_ENV !== 'development' && !me?.is_sys_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const timezone = (body?.timezone || 'Asia/Kolkata') as string;
    let slot: Slot | null = null as any;

    if (body?.slot) {
      if (!SLOT_VALUES.includes(body.slot)) {
        return NextResponse.json({ error: 'Invalid slot' }, { status: 400 });
      }
      slot = body.slot as Slot;
    } else {
      const now = new Date();
      const hour = now.getHours();
      slot = (hour >= 6 && hour <= 10) ? 'morning' : (hour >= 11 && hour <= 14) ? 'midday' : (hour >= 17 && hour <= 20) ? 'evening' : 'night';
    }

    const res = await broadcastToTimezone(slot!, timezone);
    return NextResponse.json({ ok: true, ...res, slot, timezone });
  } catch (e) {
    console.error('broadcast error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

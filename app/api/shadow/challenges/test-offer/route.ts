import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCurrentUser } from '@/utils/auth';

// GET /api/shadow/challenges/test-offer
// Optional query params:
//  - title: task title
//  - description: task description
//  - base_ep: integer, default 10
//  - createMessage: '1' to also create a focused notification pointing to the offer
export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const title = (req.nextUrl.searchParams.get('title') || 'Challenge Task').slice(0, 80);
    const description = (req.nextUrl.searchParams.get('description') || 'Shadow challenge task').slice(0, 200);
    const baseEpRaw = req.nextUrl.searchParams.get('base_ep');
    const base_ep = Number.isFinite(Number(baseEpRaw)) ? Number(baseEpRaw) : 10;
    const createMessage = req.nextUrl.searchParams.get('createMessage') === '1';

    const admin = createAdminClient();

    // Ensure shadow_profile exists for this user (idempotent upsert on user_id)
    const { data: sp, error: spErr } = await admin
      .from('shadow_profile')
      .upsert({ user_id: me.id }, { onConflict: 'user_id' })
      .select('id')
      .maybeSingle();
    if (spErr || !sp?.id) {
      return NextResponse.json(
        { error: 'DB error (shadow_profile upsert)', debug: { code: (spErr as any)?.code, message: (spErr as any)?.message, details: (spErr as any)?.details, hint: (spErr as any)?.hint } },
        { status: 500 }
      );
    }
    const shadowProfileId = sp.id as string;

    // Create the offered challenge with minimal template
    const task_template = { title, description } as const;
    const due_time = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: ch, error: chErr } = await admin
      .from('challenges')
      .insert({
        user_id: me.id,
        shadow_profile_id: shadowProfileId,
        state: 'offered',
        win_condition_type: 'before_time',
        base_ep,
        reward_multiplier: 1,
        generated_by: 'rule',
        task_template: task_template as any,
        due_time,
      })
      .select('id')
      .maybeSingle();
    if (chErr) {
      return NextResponse.json(
        { error: 'DB error (challenge create)', debug: { code: (chErr as any)?.code, message: (chErr as any)?.message, details: (chErr as any)?.details, hint: (chErr as any)?.hint } },
        { status: 500 }
      );
    }

    let messageId: string | null = null;
    if (createMessage && ch?.id) {
      const url = `/shadow/challenges/${ch.id}?challenge_id=${ch.id}`;
      const { data: msg, error: msgErr } = await admin
        .from('user_messages')
        .insert({ user_id: me.id, title: '[HIGH] Challenge Offer', body: description, url })
        .select('id')
        .maybeSingle();
      if (!msgErr) messageId = (msg?.id as string) || null;
      // If message insert failed, include debug in response payload but don't fail the whole endpoint
      // (Focused message is optional for test-offer flow.)
    }

    return NextResponse.json({ ok: true, id: ch?.id, messageId });
  } catch (e) {
    console.error('[test-offer] error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

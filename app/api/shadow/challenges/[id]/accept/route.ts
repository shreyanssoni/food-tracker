import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();

    // Load challenge
    const { data: challenge, error: cErr } = await supabase
      .from('challenges')
      .select('id, user_id, shadow_profile_id, state, base_ep, reward_multiplier, task_template, start_time, due_time')
      .eq('id', params.id)
      .single();
    if (cErr) throw cErr;
    if (!challenge || challenge.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (challenge.state !== 'offered') {
      return NextResponse.json({ error: 'Challenge not in offered state' }, { status: 400 });
    }

    const tpl = challenge.task_template || {};
    const title = tpl.title || 'Challenge Task';
    const description = tpl.description || tpl.summary || 'Shadow challenge task';
    const ep_value = Number(challenge.base_ep || 10);

    // Create the user task for this challenge (non-breaking: use existing schema fields)
    const { data: task, error: tErr } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title,
        description,
        ep_value,
        min_level: 1,
        // new columns (safe to include; additive in schema)
        owner_type: 'user',
        owner_id: user.id,
        origin: 'ai_shadow',
        category: 'challenge',
        challenge_id: challenge.id,
      } as any)
      .select('id')
      .single();
    if (tErr) throw tErr;

    // Create the shadow twin task (parent_task_id -> user task)
    const { data: shadowTask, error: sErr } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id, // keep user ownership for RLS; owner_type/owner_id carries shadow identity
        title: `${title} (Shadow)`,
        description,
        ep_value,
        min_level: 1,
        owner_type: 'shadow',
        owner_id: challenge.shadow_profile_id,
        origin: 'ai_shadow',
        category: 'challenge',
        challenge_id: challenge.id,
        parent_task_id: task.id,
      } as any)
      .select('id')
      .single();
    if (sErr) throw sErr;

    // If challenge has a due_time, create one-time schedules for both tasks
    if (challenge.due_time) {
      const due = new Date(challenge.due_time as any);
      const start_date = due.toISOString().slice(0, 10);
      const at_time = due.toISOString().slice(11, 16);
      const timezone = process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';

      // user task schedule
      const { error: usErr } = await supabase
        .from('task_schedules')
        .insert({ task_id: task.id, frequency: 'once', byweekday: null, at_time, timezone, start_date, end_date: start_date });
      if (usErr) throw usErr;

      // shadow task schedule
      const { error: ssErr } = await supabase
        .from('task_schedules')
        .insert({ task_id: shadowTask.id, frequency: 'once', byweekday: null, at_time, timezone, start_date, end_date: start_date });
      if (ssErr) throw ssErr;
    }

    // Update challenge state and linkage
    const { error: uErr } = await supabase
      .from('challenges')
      .update({ state: 'accepted', linked_user_task_id: task.id, linked_shadow_task_id: shadowTask.id })
      .eq('id', challenge.id);
    if (uErr) throw uErr;

    return NextResponse.json({ ok: true, user_task_id: task.id, shadow_task_id: shadowTask.id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

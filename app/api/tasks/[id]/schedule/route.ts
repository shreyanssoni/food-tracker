import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();
    const body = await req.json();
    const { frequency, byweekday = null, at_time = null, timezone = 'UTC', start_date = null, end_date = null } = body || {};

    if (!['daily', 'weekly', 'custom'].includes(frequency)) {
      return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
    }

    // Ensure task belongs to user
    const { data: task, error: tErr } = await supabase
      .from('tasks')
      .select('id, user_id')
      .eq('id', params.id)
      .single();
    if (tErr) throw tErr;
    if (!task || task.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Upsert schedule (PK = task_id)
    const { data, error } = await supabase
      .from('task_schedules')
      .upsert({ task_id: params.id, frequency, byweekday, at_time, timezone, start_date, end_date }, { onConflict: 'task_id' })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

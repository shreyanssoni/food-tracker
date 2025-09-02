import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCurrentUser } from '@/utils/auth';

// GET /api/shadow/challenges?view=active|history
// Returns challenges for the current user with minimal metadata and linked task refs
export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const view = (req.nextUrl.searchParams.get('view') || 'active').toLowerCase();

    // Map view to states (must match enum challenge_state defined in schema)
    // Keep 'declined' in active so it remains visible until it expires
    const activeStates = ['offered', 'accepted', 'declined'];
    const historyStates = ['completed_win', 'completed_loss', 'expired'];

    const states = view === 'history' ? historyStates : activeStates;

    const { data, error } = await admin
      .from('challenges')
      .select('id, user_id, shadow_profile_id, state, created_at, due_time, linked_user_task_id, linked_shadow_task_id, task_template, updated_at, created_at')
      .eq('user_id', me.id)
      .in('state', states)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    return NextResponse.json({ challenges: data || [] });
  } catch (e) {
    console.error('shadow challenges list error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

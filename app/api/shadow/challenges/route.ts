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

    // If requesting history, also include resolved daily shadow_challenges mapped into the same shape
    if (view === 'history') {
      const { data: sh, error: shErr } = await admin
        .from('shadow_challenges')
        .select('id, user_id, challenge_text, deadline, status, resolved_at, created_at')
        .eq('user_id', me.id)
        .neq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100);
      if (shErr) throw shErr;

      const mapped = (sh || []).map((r: any) => ({
        id: `shadow-${r.id}`,
        user_id: r.user_id,
        shadow_profile_id: null,
        state: r.status === 'won' ? 'completed_win' : (r.status === 'lost' ? 'completed_loss' : 'expired'),
        created_at: r.created_at,
        updated_at: r.updated_at ?? r.resolved_at ?? r.deadline,
        due_time: r.deadline,
        linked_user_task_id: null,
        linked_shadow_task_id: null,
        task_template: { title: r.challenge_text },
      }));

      const merged = [...(data || []), ...mapped].sort((a, b) => {
        const at = new Date(a.updated_at || a.created_at || a.due_time || 0).getTime();
        const bt = new Date(b.updated_at || b.created_at || b.due_time || 0).getTime();
        return bt - at;
      });

      return NextResponse.json({ challenges: merged });
    }

    return NextResponse.json({ challenges: data || [] });
  } catch (e) {
    console.error('shadow challenges list error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// POST /api/admin/users/resolve
// Body: { email?: string }
// Returns: { user_id: string } if found
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    const { data: meRow } = await supabase
      .from('app_users')
      .select('is_sys_admin')
      .eq('id', me.id)
      .maybeSingle();

    if (process.env.NODE_ENV !== 'development' && !meRow?.is_sys_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body?.email;
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

    const { data: userRow, error } = await supabase
      .from('app_users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    return NextResponse.json({ user_id: userRow.id });
  } catch (e: any) {
    console.error('admin users resolve error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

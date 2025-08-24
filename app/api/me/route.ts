import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ user: null }, { status: 200 });

    const supabase = createClient();
    const { data, error } = await supabase
      .from('app_users')
      .select('id, email, name, is_sys_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('me error', error);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    return NextResponse.json({ user: { id: user.id, ...data } });
  } catch (e) {
    console.error('me route error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

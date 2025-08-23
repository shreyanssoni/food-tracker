import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Server not configured for admin delete' }, { status: 500 });
    }

    const supabase = createSupabaseClient(url, serviceKey);

    // Fetch row to verify ownership
    const { data: row, error: fetchErr } = await supabase
      .from('food_logs')
      .select('id, user_id')
      .eq('id', params.id)
      .single();

    if (fetchErr || !row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (String(row.user_id) !== String(session.user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error: delErr } = await supabase.from('food_logs').delete().eq('id', params.id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message || 'Failed to delete' }, { status: 400 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

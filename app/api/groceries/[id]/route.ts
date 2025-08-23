import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createClient } from '@/utils/supabase/server';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = params;
  const body = await request.json();
  const supabase = createClient();
  const patch: any = {};
  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.qty !== 'undefined') patch.qty = Number(body.qty) || 0;
  if (typeof body.unit === 'string') patch.unit = body.unit;
  const { data, error } = await supabase
    .from('groceries')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select('*')
    .single();
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = params;
  const supabase = createClient();
  const { error } = await supabase
    .from('groceries')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

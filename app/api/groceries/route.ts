import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });
  const supabase = createClient();
  const { data, error } = await supabase
    .from('groceries')
    .select('*')
    .eq('user_id', session.user.id)
    .order('updated_at', { ascending: false });
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });
  const body = await request.json();
  const { name, qty, unit } = body || {};
  if (!name) return new NextResponse('Name required', { status: 400 });
  const supabase = createClient();
  const { data, error } = await supabase
    .from('groceries')
    .insert({ user_id: session.user.id, name, qty: Number(qty) || 1, unit: unit || 'unit' })
    .select('*')
    .single();
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json(data);
}

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('collectibles')
      .select('*')
      .order('rarity', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ items: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

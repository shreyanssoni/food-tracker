import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(req: Request) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Find user by verification token
    const { data: user, error: findErr } = await supabase
      .from('app_users')
      .select('id, email_verified')
      .eq('verification_token', token)
      .maybeSingle();

    if (findErr) {
      console.error('verify: lookup error', findErr);
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
    }

    if (user.email_verified) {
      return NextResponse.json({ success: true, message: 'Email already verified' });
    }

    const { error: updateErr } = await supabase
      .from('app_users')
      .update({ email_verified: true, verification_token: null, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateErr) {
      console.error('verify: update error', updateErr);
      return NextResponse.json({ error: 'Failed to verify email' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Email verified successfully' });
  } catch (e) {
    console.error('verify: unexpected error', e);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

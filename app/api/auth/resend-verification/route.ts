import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { isValidEmail } from '@/utils/auth/password';
import { sendVerificationEmail } from '@/utils/email';
import { randomBytes } from 'crypto';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Please provide a valid email address' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Look up user for email/password auth
    const { data: user, error: userError } = await supabase
      .from('app_users')
      .select('id, email, name, email_verified, verification_token')
      .eq('email', email.toLowerCase())
      .eq('auth_provider', 'email')
      .maybeSingle();

    if (userError) {
      console.warn('resend-verification: lookup error', userError);
      // Don't leak info; respond success anyway
      return NextResponse.json({ success: true, message: 'If this email is registered, a verification email will be sent.' });
    }

    // If no user or already verified, silently succeed
    if (!user || user.email_verified) {
      return NextResponse.json({ success: true, message: 'If this email is registered, a verification email will be sent.' });
    }

    // Ensure a verification token exists
    const token = user.verification_token || randomBytes(32).toString('hex');

    if (!user.verification_token) {
      const { error: updateErr } = await supabase
        .from('app_users')
        .update({ verification_token: token, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateErr) {
        console.error('resend-verification: update error', updateErr);
        return NextResponse.json({ error: 'Failed to initiate verification' }, { status: 500 });
      }
    }

    // Send verification email with the token
    try {
      const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?token=${token}`;
      await sendVerificationEmail(user.email, user.name, verifyUrl);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail the request if email fails
    }

    return NextResponse.json({ success: true, message: 'Verification email sent if the account exists.' });
  } catch (e) {
    console.error('resend-verification: unexpected error', e);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

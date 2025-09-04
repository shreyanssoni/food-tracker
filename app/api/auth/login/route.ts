import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifyPassword } from '@/utils/auth/password';
import { signIn } from '@/auth';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Get user by email
    const { data: user, error: userError } = await supabase
      .from('app_users')
      .select('id, email, password_hash, email_verified, name')
      .eq('email', email.toLowerCase())
      .eq('auth_provider', 'email')
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const isPasswordValid = await verifyPassword(
      password,
      user.password_hash || ''
    );

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if email is verified
    if (!user.email_verified) {
      return NextResponse.json(
        { 
          error: 'Please verify your email before logging in',
          requiresVerification: true,
          email: user.email
        },
        { status: 403 }
      );
    }

    // Sign in with NextAuth
    try {
      await signIn('credentials', {
        email: user.email,
        password,
        redirect: false,
      });

      return NextResponse.json({ 
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      });
    } catch (authError) {
      console.error('Auth sign-in error:', authError);
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

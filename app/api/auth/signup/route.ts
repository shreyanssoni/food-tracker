import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { hashPassword, isValidEmail, validatePassword } from '@/utils/auth/password';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  try {
    const { 
      email, 
      password, 
      name, 
      timezone,
      dateOfBirth,
      gender,
      height,
      weight,
      activityLevel,
      dietaryRestrictions,
      healthGoals
    } = await req.json();

    // Validate required input
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Please provide a valid email address' },
        { status: 400 }
      );
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { error: passwordValidation.message },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('app_users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);
    const userId = uuidv4();
    const verificationToken = require('crypto').randomBytes(32).toString('hex');

    // Create user in database with additional information
    const { error } = await supabase.from('app_users').insert({
      id: userId,
      email: email.toLowerCase(),
      name,
      password_hash: hashedPassword,
      auth_provider: 'email',
      email_verified: false,
      verification_token: verificationToken,
      timezone: timezone || 'UTC',
      date_of_birth: dateOfBirth || null,
      gender: gender || null,
      height: height ? parseInt(height) : null,
      weight: weight ? parseFloat(weight) : null,
      activity_level: activityLevel || null,
      dietary_restrictions: dietaryRestrictions || [],
      health_goals: healthGoals || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Error creating user:', error);
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    // Create user preferences
    try {
      await supabase.from('user_preferences').insert({
        user_id: userId,
        timezone: timezone || 'UTC',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (prefError) {
      console.error('Error creating user preferences:', prefError);
      // Don't fail the signup if preferences fail
    }

    // TODO: Send verification email
    // await sendVerificationEmail(email, verificationToken);

    return NextResponse.json({ 
      success: true,
      message: 'User created successfully. Please check your email to verify your account.'
    });

  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { hashPassword, isValidEmail, validatePassword } from '@/utils/auth/password';
import { sendVerificationEmail } from '@/utils/email';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';

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
    const verificationToken = randomBytes(32).toString('hex');

    // Create user in app_users table
    const { error } = await supabase.from('app_users').insert({
      id: userId,
      email: email.toLowerCase(),
      name,
      password_hash: hashedPassword,
      auth_provider: 'email',
      email_verified: false,
      verification_token: verificationToken,
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

    // Create user preferences with profile data
    try {
      const prefsData: any = {
        user_id: userId,
        timezone: timezone || 'UTC',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Add optional profile fields if provided
      if (dateOfBirth) {
        const birthDate = new Date(dateOfBirth);
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear() - 
          (today.getMonth() < birthDate.getMonth() || 
           (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate()) ? 1 : 0);
        prefsData.age = age;
      }
      
      if (gender) prefsData.gender = gender;
      if (height) prefsData.height_cm = parseFloat(height);
      if (weight) prefsData.weight_kg = parseFloat(weight);
      if (activityLevel) prefsData.activity_level = activityLevel;
      if (dietaryRestrictions && dietaryRestrictions.length > 0) {
        prefsData.dietary_restrictions = dietaryRestrictions;
      }
      
      // Note: healthGoals is not stored in the current schema but could be added later

      await supabase.from('user_preferences').insert(prefsData);
    } catch (prefError) {
      console.error('Error creating user preferences:', prefError);
      // Don't fail the signup if preferences fail
    }

    // Send verification email
    try {
      const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?token=${verificationToken}`;
      await sendVerificationEmail(email, name, verifyUrl);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail signup if email fails
    }

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

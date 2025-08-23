import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Return only the necessary user data
    const { id, name, email, image } = session.user;
    return NextResponse.json({
      user: { id, name, email, image }
    });
    
  } catch (error) {
    console.error('Error getting user session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

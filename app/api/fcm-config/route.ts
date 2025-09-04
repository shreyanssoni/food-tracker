import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = {
      fcmServerKey: !!process.env.FCM_SERVER_KEY,
      firebaseProjectId: !!process.env.FIREBASE_PROJECT_ID,
      firebaseClientEmail: !!process.env.FIREBASE_V1_CLIENT_EMAIL,
      firebasePrivateKey: !!process.env.FIREBASE_V1_PRIVATE_KEY,
      cronSecret: !!process.env.CRON_SECRET,
    };

    return NextResponse.json({ 
      ok: true, 
      config,
      message: 'Check the config object to see which FCM environment variables are configured'
    });
  } catch (e) {
    console.error('[fcm-config] error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

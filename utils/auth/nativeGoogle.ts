import { Capacitor } from '@capacitor/core';
import { signIn } from 'next-auth/react';

export function isAndroidNative() {
  return Capacitor.getPlatform() === 'android';
}

// Minimal helper: trigger native Google account picker only (no NextAuth call)
export async function triggerNativeGooglePickerOnly() {
  if (!isAndroidNative()) {
    throw new Error('Native Google sign-in is only available on Android builds.');
  }
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  try { await FirebaseAuthentication.signOut(); } catch {}
  try {
    const result = await FirebaseAuthentication.signInWithGoogle();
    // eslint-disable-next-line no-console
    console.log('Signed in user:', result.user);
    return result;
  } catch (e: any) {
    const code = e?.code || e?.error || 'unknown_error';
    const msg = e?.message || String(e);
    throw new Error(`Native-only Google sign-in failed [${code}]: ${msg}`);
  }
}

export async function signInWithGoogleNative() {
  if (!isAndroidNative()) {
    throw new Error('Native Google sign-in is only available on Android builds.');
  }

  // Trigger native Google sign-in via Firebase Authentication
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  // Ensure the OS account chooser is shown (avoid silent reuse of previous session)
  try {
    await FirebaseAuthentication.signOut();
  } catch {}
  let user: any, credential: any;
  try {
    const serverClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || undefined;
    // eslint-disable-next-line no-console
    console.log('[NativeSignIn] Platform=android, hasServerClientId=', !!serverClientId);
    const res = await FirebaseAuthentication.signInWithGoogle({
      scopes: ['openid', 'email', 'profile'],
      // Request an ID token for the Web client so NextAuth audience matches
      // This is the Web OAuth client ID (NEXT_PUBLIC_GOOGLE_CLIENT_ID)
      serverClientId,
    } as any);
    user = res.user;
    credential = res.credential;
  } catch (e: any) {
    const code = e?.code || e?.error || 'unknown_error';
    const msg = e?.message || String(e);
    throw new Error(`Native Google sign-in failed [${code}]: ${msg}`);
  }

  const idToken = credential?.idToken || null;
  if (!idToken) {
    throw new Error('No ID token returned from native Google sign-in. Check Firebase Android config, google-services.json, and SHA-1.');
  }

  // Forward the ID token to NextAuth Credentials provider (google-onetap)
  const res = await signIn('google-onetap', {
    id_token: idToken,
    redirect: false,
  });

  if (res?.error) {
    throw new Error(res.error);
  }

  return { ok: true, user } as const;
}

export async function signOutNative() {
  if (!isAndroidNative()) return;
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  await FirebaseAuthentication.signOut();
  await import('next-auth/react').then(({ signOut: nextAuthSignOut }) => nextAuthSignOut({ redirect: false }));
}

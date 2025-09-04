import { Capacitor } from '@capacitor/core';
import { signIn } from 'next-auth/react';

export function isAndroidNative() {
  return Capacitor.getPlatform() === 'android';
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
  const { user, credential } = await FirebaseAuthentication.signInWithGoogle({
    scopes: ['openid', 'email', 'profile'],
  });

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

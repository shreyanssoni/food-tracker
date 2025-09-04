import { Capacitor } from '@capacitor/core';
import { signIn, signOut as nextAuthSignOut } from 'next-auth/react';

export function isAndroidNative() {
  return Capacitor.isNativePlatform?.() ? Capacitor.getPlatform() === 'android' : Capacitor.getPlatform() === 'android';
}

export async function signInWithGoogleNative() {
  if (!isAndroidNative()) {
    throw new Error('Native Google sign-in is only available on Android builds.');
  }

  // Trigger native Google sign-in via Firebase Authentication
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  const { user, credential } = await FirebaseAuthentication.signInWithGoogle({
    // idToken & accessToken are returned in credential
    // You can also request extra scopes if you need them:
    // scopes: ['email', 'profile', 'openid']
  });

  const idToken = credential?.idToken || null;
  if (!idToken) {
    throw new Error('No ID token returned from native Google sign-in.');
  }

  // Forward the ID token to NextAuth Credentials provider (google-onetap)
  const res = await signIn('google-onetap', {
    id_token: idToken,
    redirect: false,
  });

  if (res?.error) {
    throw new Error(res.error);
  }

  return { user, ok: res?.ok ?? true };
}

export async function signOutNative() {
  if (isAndroidNative()) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      await FirebaseAuthentication.signOut();
    } catch {}
  }
  await nextAuthSignOut({ redirect: false });
}


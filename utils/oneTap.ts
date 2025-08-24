import { signIn } from 'next-auth/react';

let scriptLoaded = false;

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (scriptLoaded || (window as any).google?.accounts?.id) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => { scriptLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
}

export async function initGoogleOneTap(): Promise<void> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string;
  if (!clientId) return;
  await loadGisScript();
  const google = (window as any).google;
  if (!google?.accounts?.id) return;

  google.accounts.id.initialize({
    client_id: clientId,
    auto_select: true,
    cancel_on_tap_outside: false,
    callback: async (response: any) => {
      const id_token = response?.credential;
      if (!id_token) return;
      await signIn('google-onetap', { id_token, redirect: false });
    },
  });

  try {
    google.accounts.id.prompt();
  } catch {
    // no-op
  }
}

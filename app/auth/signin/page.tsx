'use client';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

export default function SignIn() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const baseFromEnv = (process.env.NEXT_PUBLIC_AUTH_URL || '').replace(/\/$/, '');
  const absoluteAuthHref = baseFromEnv
    ? `${baseFromEnv}/api/auth/signin/google?callbackUrl=${encodeURIComponent(baseFromEnv + '/')}`
    : '';

  const handleGoogle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const platform = Capacitor.getPlatform();
      // eslint-disable-next-line no-console
      console.log('Sign-in clicked. Capacitor platform:', platform);
      if (platform === 'android') {
        // Deterministic absolute navigation to NextAuth Google sign-in
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const base = (process.env.NEXT_PUBLIC_AUTH_URL || origin || '').replace(/\/$/, '');
        const authUrl = `${base}/api/auth/signin/google?callbackUrl=${encodeURIComponent(base + '/')}`;
        toast.message('Opening Google sign-in…');
        // eslint-disable-next-line no-console
        console.log('Android absolute auth navigation to:', authUrl, 'origin:', origin, 'env base:', process.env.NEXT_PUBLIC_AUTH_URL);
        window.location.assign(authUrl);
        return;
      } else {
        const res = await signIn('google', { callbackUrl: '/', redirect: false });
        // eslint-disable-next-line no-console
        console.log('Web sign-in result', res);
        if (res?.url) {
          toast.message('Opening Google sign-in…');
          // eslint-disable-next-line no-console
          console.log('Redirecting browser to NextAuth URL:', res.url);
          window.location.assign(res.url);
          return;
        }
        if (!res?.error) {
          toast.success('Signed in');
          router.replace('/');
        } else {
          toast.error(res.error || 'Google sign-in failed.');
        }
      }
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('Google sign-in failed', e);
      const msg = e?.message || 'Google sign-in failed. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-lg shadow">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            Sign in to Nourish
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Track your meals and get AI-powered insights
          </p>
        </div>
        <div className="mt-8 space-y-6">
          <div>
            <button
              type="button"
              onClick={handleGoogle}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900"
              disabled={loading}
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                <svg className="h-5 w-5 text-blue-200 group-hover:text-blue-100" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.545 10.239v3.821h5.445c-0.712 2.315-2.647 3.972-5.445 3.972-3.332 0-6.033-2.701-6.033-6.032s2.701-6.032 6.033-6.032c1.498 0 2.866 0.549 3.921 1.453l2.814-2.814c-1.85-1.726-4.318-2.768-6.735-2.768-5.522 0-10 4.479-10 10s4.478 10 10 10c8.396 0 10-7.194 10-10 0-0.672-0.067-1.422-0.167-2.094h-9.833z" />
                </svg>
              </span>
              {loading ? 'Signing in…' : 'Continue with Google'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
            <div className="text-xs text-gray-400">or</div>
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          </div>
          <div className="space-y-2">
            {absoluteAuthHref ? (
              <a
                href={absoluteAuthHref}
                className="block w-full text-center py-2 px-3 rounded-md border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                Debug: Open Google sign-in (absolute, no JS)
              </a>
            ) : (
              <div className="text-xs text-amber-600 dark:text-amber-400">
                Set NEXT_PUBLIC_AUTH_URL to enable absolute debug link. Using relative fallback below.
              </div>
            )}
            <a
              href="/api/auth/signin/google?callbackUrl=%2F"
              className="block w-full text-center py-2 px-3 rounded-md border border-gray-200 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              Debug: Open Google sign-in (relative, no JS)
            </a>
          </div>
          <div className="text-center text-sm text-gray-500 dark:text-gray-400">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </div>
        </div>
      </div>
    </div>
  );
}


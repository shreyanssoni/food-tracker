'use client';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { isAndroidNative, signInWithGoogleNative } from '@/utils/auth/nativeGoogle';

export default function SignIn() {
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (isAndroidNative()) {
        await signInWithGoogleNative();
      } else {
        await signIn('google', { callbackUrl: '/' });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Google sign-in failed', e);
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
          <div className="text-center text-sm text-gray-500 dark:text-gray-400">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </div>
        </div>
      </div>
    </div>
  );
}


'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Loader2, CheckCircle, XCircle, Mail } from 'lucide-react';

import { Button } from '../../../components/ui/button';

export default function VerifyEmail() {
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token');

  useEffect(() => {
    if (!token) {
      setError('Invalid verification link');
      setIsLoading(false);
      return;
    }

    verifyEmail(token);
  }, [token]);

  const verifyEmail = async (verificationToken: string) => {
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: verificationToken }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsVerified(true);
        toast.success('Email verified successfully!');
      } else {
        setError(data.error || 'Verification failed');
        toast.error(data.error || 'Verification failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = () => {
    router.push('/auth/signin');
  };

  const handleResendVerification = async () => {
    // We don't have the email here, so redirect to sign-in where they can try again
    toast.message('Please try signing in again to resend verification email');
    router.push('/auth/signin');
  };

  return (
    <div className="min-h-screen flex flex-col justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow-xl rounded-xl sm:px-10 border border-gray-200 dark:border-gray-700">
          <div className="text-center">
            {isLoading ? (
              <>
                <Loader2 className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Verifying your email...
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Please wait while we verify your email address.
                </p>
              </>
            ) : isVerified ? (
              <>
                <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Email Verified!
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Your email has been successfully verified. You can now sign in to your account.
                </p>
                <Button
                  onClick={handleSignIn}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Sign In
                </Button>
              </>
            ) : (
              <>
                <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Verification Failed
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  {error || 'Unable to verify your email address.'}
                </p>
                <div className="space-y-3">
                  <Button
                    onClick={handleResendVerification}
                    variant="outline"
                    className="w-full"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Try Sign In Again
                  </Button>
                  <Link
                    href="/auth/signup"
                    className="block text-center text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Create a new account
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>

        {!isLoading && (
          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-sm text-gray-600 hover:text-gray-500 dark:text-gray-400 dark:hover:text-gray-300"
            >
              ← Back to home
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

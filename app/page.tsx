"use client";
import { signIn, useSession } from 'next-auth/react';
import Link from 'next/link';

export default function HomePage() {
  const { data: session, status } = useSession();

  return (
    <div className="space-y-8">
      <section className="bg-white shadow-soft rounded-xl p-6">
        <h1 className="text-2xl font-bold mb-2">Nourish — Track food and mood with AI</h1>
        <p className="text-gray-600 mb-4">
          Log meals by typing naturally or snapping a photo. Get gentle, personalized insights powered by AI.
        </p>
        {status !== 'authenticated' ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Continue with Google
            </button>
            <Link
              href="/auth/signin"
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              Other sign-in options
            </Link>
          </div>
        ) : (
          <div className="flex gap-3">
            <Link href="/food" className="btn">Go to Food Log</Link>
            <Link href="/dashboard" className="btn-outline">Open Dashboard</Link>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-soft">
          <h2 className="font-semibold mb-1">Chat-based logging</h2>
          <p className="text-sm text-gray-600">Say “2 eggs and toast at 9am” and we’ll parse it for you.</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-soft">
          <h2 className="font-semibold mb-1">Private and secure</h2>
          <p className="text-sm text-gray-600">Your data is stored securely with Supabase and NextAuth.</p>
        </div>
      </section>
    </div>
  );
}

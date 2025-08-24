"use client";
import { signIn, useSession } from 'next-auth/react';
import Link from 'next/link';

export default function HomePage() {
  const { data: session, status } = useSession();

  return (
    <div className="space-y-8">
      {/* Hero / Large Top App Bar */}
      <section className="relative overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800 bg-gradient-to-br from-blue-600/10 via-sky-500/10 to-cyan-400/10 dark:from-blue-900/20 dark:via-sky-800/10 dark:to-cyan-800/10 p-6 sm:p-8">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <header className="relative z-10 space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Nourish
          </h1>
          <p className="text-slate-600 dark:text-slate-300 max-w-2xl">
            Track food and mood with AI. Log naturally, get gentle insights, and build consistent habits.
          </p>
        </header>
        <div className="relative z-10 mt-5 flex flex-col sm:flex-row gap-3">
          {status !== 'authenticated' ? (
            <>
              <button
                onClick={() => signIn('google', { callbackUrl: '/me' })}
                className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
              >
                Continue with Google
              </button>
              <Link
                href="/auth/signin"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-slate-800 dark:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-900/60 backdrop-blur-sm"
              >
                Other sign-in options
              </Link>
            </>
          ) : (
            <>
              <Link
                href={{ pathname: '/me' }}
                className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
              >
                Open Me
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-slate-800 dark:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-900/60 backdrop-blur-sm"
              >
                Open Dashboard
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Feature Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <article className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/70 dark:bg-gray-950/60 backdrop-blur-sm p-4 shadow-sm">
          <h2 className="font-semibold mb-1">Chat-based logging</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Say “2 eggs and toast at 9am” and we’ll parse it for you.</p>
        </article>
        <article className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/70 dark:bg-gray-950/60 backdrop-blur-sm p-4 shadow-sm">
          <h2 className="font-semibold mb-1">Private and secure</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Your data stays with you. NextAuth + Supabase for auth & storage.</p>
        </article>
        <article className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/70 dark:bg-gray-950/60 backdrop-blur-sm p-4 shadow-sm">
          <h2 className="font-semibold mb-1">Gentle nudges</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Smart pushes with short, positive prompts to keep you on track.</p>
        </article>
      </section>
    </div>
  );
}

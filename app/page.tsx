"use client";
import { useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TypewriterSearch from "@/components/TypewriterSearch";

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();

  // Redirect authenticated users straight to the dashboard
  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800 bg-gradient-to-br from-sky-500/10 via-blue-600/10 to-emerald-500/10 dark:from-sky-900/20 dark:via-blue-900/20 dark:to-emerald-900/20 p-6 sm:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <header className="relative z-10 space-y-3">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Track food & life with kindness
          </h1>
          <p className="text-base sm:text-lg text-slate-700 dark:text-slate-300 max-w-2xl">
            Log naturally with AI. Receive gentle insights and supportive nudges
            that help you stay consistent—without guilt.
          </p>
          <div className="mt-2">
            <TypewriterSearch />
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => signIn()}
              className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
            >
              Get Started Free
            </button>
            {/* <Link
              href="/me"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 px-6 py-3 text-slate-800 dark:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-900/60 backdrop-blur-sm"
            >
              See a Live Demo
            </Link> */}
          </div>
        </header>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <article className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/70 dark:bg-gray-950/60 backdrop-blur p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className="text-blue-600 mt-0.5"
            >
              <path
                d="M4 12h16M4 7h16M4 17h10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <div>
              <h2 className="font-semibold mb-1">Natural logging</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Say “2 eggs and toast at 9am” or snap a photo—we’ll parse it for
                you.
              </p>
            </div>
          </div>
        </article>
        <article className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/70 dark:bg-gray-950/60 backdrop-blur p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className="text-emerald-600 mt-0.5"
            >
              <path
                d="M12 3l7 4v6c0 4.418-3.582 8-8 8S3 17.418 3 13V7l9-4z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <h2 className="font-semibold mb-1">Private by design</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Your data stays with you. Modern auth and secure storage.
              </p>
            </div>
          </div>
        </article>
        <article className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/70 dark:bg-gray-950/60 backdrop-blur p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className="text-sky-600 mt-0.5"
            >
              <path
                d="M12 8v4l3 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <h2 className="font-semibold mb-1">Gentle nudges</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Short, positive reminders to help you keep going—at your pace.
              </p>
            </div>
          </div>
        </article>
      </section>

      {/* How it works */}
      <section className="rounded-2xl border border-gray-100 dark:border-gray-800 p-6 sm:p-8 bg-white/60 dark:bg-gray-950/50 backdrop-blur">
        <h3 className="text-lg font-semibold mb-4">How it works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white text-sm">
                1
              </span>
              <div>
                <div className="font-medium">Log naturally</div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Type it or snap a photo. We’ll do the rest.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white text-sm">
                2
              </span>
              <div>
                <div className="font-medium">Get gentle insights</div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Small reflections that support—not shame.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-white text-sm">
                3
              </span>
              <div>
                <div className="font-medium">Build steady habits</div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Celebrate consistency and real-life progress.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Impact band */}
      <section className="rounded-2xl border border-gray-100 dark:border-gray-800 p-6 sm:p-8 bg-gradient-to-r from-blue-600/10 to-emerald-500/10 dark:from-blue-900/20 dark:to-emerald-900/20">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Tiny steps. Big change.</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 max-w-2xl">
              30 days of gentle consistency beats intense bursts. Nourish keeps
              you moving forward—kindly.
            </p>
          </div>
          <button
            onClick={() => signIn()}
            className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700"
          >
            Get Started Free
          </button>
        </div>
      </section>
    </div>
  );
}

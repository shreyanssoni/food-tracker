"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sparkles, Gem, Flame, ShoppingBag, MessageCircleHeart } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

interface PrefsResp {
  profile: {
    has_seen_onboarding?: boolean;
    [k: string]: any;
  } | null;
}

type Step = { title: string; desc: ReactNode; icon: any };

const steps: Step[] = [
  {
    title: "Welcome to Nourish",
    desc: (
      <div className="space-y-1 text-sm">
        <p>Track food and workouts, build habits, and get empathetic AI coaching.</p>
        <p>Use the top navigation (desktop) or bottom bar (mobile) to switch tabs.</p>
      </div>
    ),
    icon: Sparkles,
  },
  {
    title: "Dashboard, EP, Diamonds",
    desc: (
      <ul className="list-disc pl-5 space-y-1 text-sm">
        <li><strong>Dashboard</strong> shows your progress, EP, level, streak, and quick actions.</li>
        <li><strong>EP</strong> (Experience Points) come from completing tasks and habits.</li>
        <li><strong>Diamonds</strong> are earned via progress and can be spent in the Shop.</li>
        <li>See your <strong>top badge</strong> and <strong>diamonds</strong> in the navbar summary.</li>
        <li>Notifications appear in your profile menu’s bell — check updates there.</li>
      </ul>
    ),
    icon: Flame,
  },
  {
    title: "Tasks & Goals",
    desc: (
      <ul className="list-disc pl-5 space-y-1 text-sm">
        <li>Plan actions in <code>/tasks</code>. Completing tasks grants EP (and sometimes diamonds).</li>
        <li>Define long-term objectives in <code>/goals</code> and track progress over time.</li>
      </ul>
    ),
    icon: Flame,
  },
  {
    title: "Food, Workouts, Suggestions",
    desc: (
      <ul className="list-disc pl-5 space-y-1 text-sm">
        <li>Log meals quickly in <code>/food</code> (text or photo). Targets adapt from your profile.</li>
        <li>Plan or generate routines in <code>/workouts</code>.</li>
        <li>Explore AI-curated ideas in <code>/suggestions</code> to stay consistent.</li>
      </ul>
    ),
    icon: Sparkles,
  },
  {
    title: "Rewards, Collectibles, Shop",
    desc: (
      <ul className="list-disc pl-5 space-y-1 text-sm">
        <li>Claim milestones in <code>/rewards</code>.</li>
        <li>Browse items in <code>/collectibles/shop</code> and view owned items in <code>/collectibles</code>.</li>
        <li>Some items unlock with level or specific badges — keep progressing!</li>
      </ul>
    ),
    icon: ShoppingBag,
  },
  {
    title: "Coach, Groceries, Settings",
    desc: (
      <ul className="list-disc pl-5 space-y-1 text-sm">
        <li>Chat for motivation or guidance in <code>/chat</code>.</li>
        <li>Track pantry items in <code>/groceries</code> to plan your meals.</li>
        <li>Update profile and preferences in <code>/profile</code> and <code>/settings</code>.</li>
      </ul>
    ),
    icon: MessageCircleHeart,
  },
];

export default function Onboarding() {
  const { status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);

  // Avoid showing repeatedly if user closes before POST returns
  const [localGuard, setLocalGuard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Only run in browser
        if (typeof window === "undefined") return;
        // Only for authenticated users and not on auth pages
        if (status !== "authenticated") return;
        if (pathname?.startsWith("/auth/")) return;
        // quick client guard for the current tab
        if (window.sessionStorage.getItem("nourish:onboarding:done") === "1") {
          return;
        }
        const res = await fetch("/api/preferences", { cache: "no-store" });
        const j: PrefsResp = await res.json().catch(() => ({ profile: null }));
        if (cancelled) return;
        const seen = Boolean(j?.profile?.has_seen_onboarding);
        setOpen(!seen);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
  }, [status, pathname]);

  const finish = async () => {
    try {
      setLocalGuard(true);
      window.sessionStorage.setItem("nourish:onboarding:done", "1");
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ has_seen_onboarding: true }),
      });
    } catch {}
    finally {
      setOpen(false);
    }
  };

  const skip = finish;

  if (loading || !open || status !== "authenticated" || pathname?.startsWith("/auth/")) return null;

  const StepIcon = steps[idx].icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={skip} aria-hidden />
      <div className="relative w-[92%] max-w-md rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white/90 dark:bg-gray-900/90 backdrop-blur shadow-xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white grid place-items-center">
            <StepIcon className="h-5 w-5" />
          </div>
          <div className="text-lg font-semibold leading-tight">{steps[idx].title}</div>
        </div>
        <div className="text-gray-700 dark:text-gray-300 mb-4">{steps[idx].desc}</div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-4">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-blue-600" : "w-2 bg-gray-300 dark:bg-gray-700"}`} />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={skip}
            className="text-[13px] px-3 py-1.5 rounded-full border border-gray-200/70 dark:border-gray-800/70 hover:bg-gray-100/70 dark:hover:bg-white/5"
            disabled={localGuard}
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {idx > 0 && (
              <button
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                className="text-[13px] px-3 py-1.5 rounded-full border border-gray-200/70 dark:border-gray-800/70 hover:bg-gray-100/70 dark:hover:bg-white/5"
              >
                Back
              </button>
            )}
            {idx < steps.length - 1 ? (
              <button
                onClick={() => setIdx((i) => Math.min(steps.length - 1, i + 1))}
                className="text-[13px] px-3 py-1.5 rounded-full border border-transparent bg-gradient-to-r from-blue-600 to-emerald-500 text-white"
              >
                Next
              </button>
            ) : (
              <button
                onClick={finish}
                className="text-[13px] px-3 py-1.5 rounded-full border border-transparent bg-gradient-to-r from-blue-600 to-emerald-500 text-white"
                disabled={localGuard}
              >
                Let’s start
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

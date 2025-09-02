"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sparkles, Gem, Flame, ShoppingBag, MessageCircleHeart } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

interface PrefsResp {
  profile: {
    has_seen_onboarding?: boolean;
    [k: string]: any;
  } | null;
}

type Step = { title: string; desc: ReactNode; icon: any; art?: ReactNode };

const steps: Step[] = [
  {
    title: "Your Story Begins",
    desc: (
      <div className="space-y-1 text-sm">
        <p>You’ve always known there’s a stronger version of you waiting to emerge.</p>
        <p>The one with control, discipline, energy, and pride.</p>
        <p>Today, you step into a world built to bring that version to life.</p>
      </div>
    ),
    icon: Sparkles,
    art: (
      <svg viewBox="0 0 400 140" className="w-full h-28 sm:h-32 rounded-xl bg-gradient-to-r from-indigo-600/20 to-emerald-500/20">
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.9"/>
          </linearGradient>
        </defs>
        <circle cx="60" cy="80" r="28" fill="url(#g1)" opacity="0.7"/>
        <rect x="120" y="40" width="200" height="60" rx="12" fill="url(#g1)" opacity="0.25"/>
        <path d="M20 120 Q200 20 380 120" stroke="url(#g1)" strokeWidth="3" fill="none" opacity="0.6"/>
      </svg>
    ),
  },
  {
    title: "EP – The Fuel of Growth",
    desc: (
      <div className="space-y-1 text-sm">
        <p>Every action — finishing a workout, logging a meal, sticking to a habit — earns you EP.</p>
        <p>EP isn’t just points. It’s proof you’re moving closer to the person you promised yourself to become.</p>
      </div>
    ),
    icon: Flame,
    art: (
      <svg viewBox="0 0 400 140" className="w-full h-28 sm:h-32 rounded-xl bg-gradient-to-r from-orange-500/20 to-pink-500/20">
        <defs>
          <radialGradient id="g2" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#f59e0b"/>
            <stop offset="100%" stopColor="#ec4899"/>
          </radialGradient>
        </defs>
        <circle cx="80" cy="70" r="36" fill="url(#g2)" opacity="0.8"/>
        <rect x="150" y="46" width="210" height="48" rx="10" fill="#ffffff10" stroke="#ffffff30"/>
        <path d="M160 70 h160" stroke="#ffffff70" strokeWidth="3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    title: "Diamonds – The Proof You Endure",
    desc: (
      <div className="space-y-1 text-sm">
        <p>Diamonds are rare. They’re not bought, only earned through consistency and resilience.</p>
        <p>Every diamond is a reminder: you showed up when it mattered.</p>
      </div>
    ),
    icon: Gem,
    art: (
      <svg viewBox="0 0 400 140" className="w-full h-28 sm:h-32 rounded-xl bg-gradient-to-r from-cyan-500/20 to-violet-500/20">
        <polygon points="200,30 240,70 220,110 180,110 160,70" fill="#06b6d4" opacity="0.75"/>
        <polygon points="200,30 240,70 200,70" fill="#22d3ee" opacity="0.9"/>
        <polygon points="200,30 160,70 200,70" fill="#7dd3fc" opacity="0.9"/>
      </svg>
    ),
  },
  {
    title: "See Who You’re Becoming",
    desc: (
      <div className="space-y-1 text-sm">
        <p>Your dashboard isn’t stats. It’s a mirror.</p>
        <p>Every streak, every level, every badge — it reflects the life you’re building, day by day.</p>
      </div>
    ),
    icon: Sparkles,
    art: (
      <svg viewBox="0 0 400 140" className="w-full h-28 sm:h-32 rounded-xl bg-gradient-to-r from-slate-500/20 to-blue-500/20">
        <rect x="60" y="30" width="280" height="80" rx="12" fill="#ffffff10" stroke="#ffffff30"/>
        <circle cx="110" cy="70" r="20" fill="#60a5fa" opacity="0.7"/>
        <rect x="150" y="55" width="160" height="10" rx="5" fill="#ffffff60"/>
        <rect x="150" y="75" width="100" height="10" rx="5" fill="#ffffff30"/>
      </svg>
    ),
  },
  {
    title: "Explore & Unlock",
    desc: (
      <div className="space-y-1 text-sm">
        <p>Your journey opens new paths:</p>
        <ul className="list-disc pl-5">
          <li>Food & workouts fuel your strength.</li>
          <li>Suggestions spark new ideas.</li>
          <li>Collectibles & shop reward your discipline.</li>
        </ul>
        <p>This world grows as you do.</p>
      </div>
    ),
    icon: ShoppingBag,
    art: (
      <svg viewBox="0 0 400 140" className="w-full h-28 sm:h-32 rounded-xl bg-gradient-to-r from-emerald-500/20 to-lime-500/20">
        <rect x="40" y="40" width="90" height="60" rx="8" fill="#10b981" opacity="0.4"/>
        <rect x="150" y="30" width="90" height="70" rx="8" fill="#84cc16" opacity="0.35"/>
        <rect x="260" y="50" width="90" height="50" rx="8" fill="#22c55e" opacity="0.4"/>
      </svg>
    ),
  },
  {
    title: "You’re Not Alone",
    desc: (
      <div className="space-y-1 text-sm">
        <p>Every hero has a guide.</p>
        <p>Your AI coach is here for motivation, reminders, and even tough love when you need it.</p>
        <p>You bring the effort. We bring the support.</p>
      </div>
    ),
    icon: MessageCircleHeart,
    art: (
      <svg viewBox="0 0 400 140" className="w-full h-28 sm:h-32 rounded-xl bg-gradient-to-r from-rose-500/20 to-fuchsia-500/20">
        <path d="M100 70 Q120 40 140 70 T180 70" fill="none" stroke="#f472b6" strokeWidth="4"/>
        <circle cx="210" cy="70" r="22" fill="#fb7185" opacity="0.6"/>
        <rect x="250" y="50" width="100" height="40" rx="8" fill="#ffffff10" stroke="#ffffff30"/>
      </svg>
    ),
  },
  {
    title: "Your Next Chapter",
    desc: (
      <div className="space-y-1 text-sm">
        <p>This isn’t about apps. It’s about you.</p>
        <p>Every tap, every task, every streak is a choice:</p>
        <ul className="list-disc pl-5">
          <li>Do you stay the same?</li>
          <li>Or do you rise into the strongest version of yourself?</li>
        </ul>
        <p>The story starts now.</p>
      </div>
    ),
    icon: Sparkles,
    art: (
      <svg viewBox="0 0 400 140" className="w-full h-28 sm:h-32 rounded-xl bg-gradient-to-r from-blue-600/20 to-emerald-500/20">
        <path d="M20 110 H380" stroke="#93c5fd" strokeWidth="2"/>
        <circle cx="60" cy="110" r="6" fill="#60a5fa"/>
        <circle cx="200" cy="110" r="6" fill="#34d399"/>
        <circle cx="340" cy="110" r="6" fill="#10b981"/>
        <path d="M60 110 Q200 30 340 110" stroke="#34d399" strokeWidth="3" fill="none"/>
      </svg>
    ),
  },
  // Final interactive step is rendered separately below, not in this static array
];

export default function Onboarding() {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);

  // Create-task dialog state (triggered from final step)
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskCreating, setTaskCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
        // If we're in the middle of the post-task flow, suppress onboarding until shadow explain completes
        const suspended = window.sessionStorage.getItem("nourish:onboarding:suspended") === "1";
        const toTasks = window.sessionStorage.getItem("nourish:showShadowIntroAfterTasks") === "1";
        const explainPending = window.sessionStorage.getItem("nourish:shadowExplainPending") === "1";
        if (suspended || toTasks || explainPending) {
          setOpen(false);
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
    return () => {
      cancelled = true;
    };
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

  // Total steps are static narrative; last action opens create-task dialog
  const totalSteps = steps.length;
  const isLast = idx === totalSteps - 1;
  const StepIcon = steps[idx].icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={skip} aria-hidden />
      <div className="relative w-[92%] max-w-md rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl shadow-2xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white grid place-items-center">
            <StepIcon className="h-5 w-5" />
          </div>
          <div className="text-lg font-semibold leading-tight">{steps[idx].title}</div>
        </div>
        <div className="space-y-3 mb-4">
          <>
            <div className="text-gray-700 dark:text-gray-300">{steps[idx].desc}</div>
            {steps[idx].art && (
              <div className="overflow-hidden rounded-xl border border-gray-200/60 dark:border-gray-800/60">
                {steps[idx].art}
              </div>
            )}
          </>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-blue-600" : "w-2 bg-gray-300 dark:bg-gray-700"}`}
            />
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
            {!isLast ? (
              <button
                onClick={() => setIdx((i) => Math.min(totalSteps - 1, i + 1))}
                className="text-[13px] px-3 py-1.5 rounded-full border border-transparent bg-gradient-to-r from-blue-600 to-emerald-500 text-white"
              >
                Next
              </button>
            ) : (
              <button
                onClick={() => setShowTaskDialog(true)}
                className="text-[13px] px-3 py-1.5 rounded-full border border-transparent bg-gradient-to-r from-blue-600 to-emerald-500 text-white"
                disabled={localGuard}
              >
                Create and continue
              </button>
            )}
          </div>
        </div>
      </div>
    {/* Create Task Dialog */}
    {showTaskDialog && (
      <div className="fixed inset-0 z-[110] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowTaskDialog(false)} aria-hidden />
        <div className="relative w-[92%] max-w-md rounded-xl border border-gray-200/70 dark:border-gray-800/70 bg-white dark:bg-gray-900 p-4">
          <div className="text-base font-semibold mb-2">Create your first task</div>
          {errorMsg && <div className="text-[12px] text-red-600 dark:text-red-400 mb-2">{errorMsg}</div>}
          <div className="space-y-2">
            <label className="block text-[12px] text-gray-600 dark:text-gray-400">Title</label>
            <input
              autoFocus
              type="text"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 10-minute walk after lunch"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              disabled={taskCreating}
            />
          </div>
          <p className="mt-2 text-[11px] text-gray-500">We’ll set it as a daily task. You can edit schedule later.</p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button onClick={()=>setShowTaskDialog(false)} className="text-[13px] px-3 py-1.5 rounded-lg border border-gray-200/70 dark:border-gray-800/70">Cancel</button>
            <button
              disabled={taskCreating || !taskTitle.trim()}
              onClick={async () => {
                try {
                  setErrorMsg(null);
                  setTaskCreating(true);
                  const res = await fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: taskTitle.trim(), ep_value: 10, schedule: { frequency: 'daily' } }),
                  });
                  const j = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(j?.error || 'Failed to create');
                  // Indicate that Tasks page should show Shadow intro next
                  try {
                    window.sessionStorage.setItem('nourish:showShadowIntroAfterTasks','1');
                    window.sessionStorage.setItem('nourish:onboarding:suspended','1');
                  } catch {}
                  setShowTaskDialog(false);
                  setOpen(false);
                  router.push('/tasks');
                } catch (e:any) {
                  setErrorMsg(e?.message || 'Something went wrong');
                } finally {
                  setTaskCreating(false);
                }
              }}
              className="text-[13px] px-3 py-1.5 rounded-full border border-transparent bg-blue-600 text-white disabled:opacity-60"
            >{taskCreating ? 'Creating…' : 'Create task'}</button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

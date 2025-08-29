"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import {
  useNotifications,
  syncSubscriptionWithServer,
} from "@/utils/notifications";
import { sendSessionHeartbeat } from "@/utils/sessions";
import { initGoogleOneTap } from "@/utils/oneTap";
import { Loader2, Sparkles, Gem, Search } from "lucide-react";
import { toast } from "sonner";
import { Caveat } from "next/font/google";

const caveat = Caveat({ subsets: ["latin"], weight: ["400", "700"] });

// Define route types as string literals
type NavPath =
  | "/dashboard"
  | "/motivation"
  | "/tasks"
  | "/rewards"
  | "/food"
  | "/groceries"
  | "/suggestions"
  | "/chat"
  | "/workouts"
  | "/collectibles"
  | "/collectibles/shop"
  | "/goals";
type DropdownPath = "/profile" | "/settings";
type AuthPath = "/auth/signin";

// Navigation items
interface NavItem {
  path: NavPath;
  label: string;
}

// Dropdown items
interface DropdownItem {
  path: DropdownPath;
  label: string;
}

// Auth items
interface AuthItem {
  path: AuthPath;
  label: string;
  className: string;
}

// Primary nav (visible) and secondary nav (in "More") to avoid clutter
const primaryNav: NavItem[] = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/tasks", label: "Tasks" },
  { path: "/rewards", label: "Rewards" },
  { path: "/goals", label: "Goals" },
  { path: "/collectibles/shop", label: "Shop" },
];
const moreNav: NavItem[] = [
  { path: "/motivation", label: "Motivation" },
  { path: "/food", label: "Food Log" },
  { path: "/groceries", label: "Groceries" },
  { path: "/workouts", label: "Workouts" },
  { path: "/suggestions", label: "Suggestions" },
  { path: "/collectibles", label: "My Collectibles" },
  { path: "/chat", label: "Coach" },
];

// Dropdown items
const dropdownItems: DropdownItem[] = [
  { path: "/profile", label: "Your Profile" },
  { path: "/settings", label: "Settings" },
];

// Auth items
const authItems: Record<string, AuthItem> = {
  signin: {
    path: "/auth/signin",
    label: "Sign in",
    className: "bg-blue-600 text-white hover:bg-blue-700",
  },
};

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (path: string) => pathname === path;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const {
    enabled: notifEnabled,
    pending: notifPending,
    enable: enableNotifications,
    disable: disableNotifications,
  } = useNotifications();
  const [isAdmin, setIsAdmin] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState<{
    level: number;
    ep: number;
    ep_required: number;
    diamonds?: number;
  } | null>(null);
  const [progLoading, setProgLoading] = useState(false);
  const [topBadge, setTopBadge] = useState<{
    name: string;
    icon?: string;
  } | null>(null);
  const [lifeStreak, setLifeStreak] = useState<{
    current: number;
    longest?: number;
  } | null>(null);
  const [unreadMsgs, setUnreadMsgs] = useState<
    Array<{
      id: string;
      title: string;
      body: string;
      url?: string | null;
      created_at: string;
    }>
  >([]);

  // Handwritten typewriter phrases for logged-out faux search bar
  const phrases = [
    "i am growing 1% daily",
    "loggin my food",
    "walked 10000 steps today",
    "vibin'n to music",
  ];
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [pause, setPause] = useState(false);

  useEffect(() => {
    if (status === "authenticated") return; // only run when logged out
    if (pause) {
      const t = setTimeout(() => setPause(false), 1200);
      return () => clearTimeout(t);
    }
    const current = phrases[phraseIndex % phrases.length];
    const speed = deleting ? 40 : 70;
    const timer = setTimeout(() => {
      if (!deleting) {
        const next = current.slice(0, text.length + 1);
        setText(next);
        if (next === current) {
          setPause(true);
          setDeleting(true);
        }
      } else {
        const next = current.slice(0, text.length - 1);
        setText(next);
        if (next.length === 0) {
          setDeleting(false);
          setPhraseIndex((i) => (i + 1) % phrases.length);
          setPause(true);
        }
      }
    }, speed);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, deleting, pause, phraseIndex, status]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  // Throttle guard for unread refreshes to avoid spamming API
  const lastUnreadFetchRef = useRef<number>(0);
  const unreadInFlightRef = useRef<boolean>(false);

  // Helper: refresh unread count
  const refreshUnreadCount = async () => {
    if (typeof window === "undefined") return;
    if (status !== "authenticated") {
      setUnreadCount(0);
      return;
    }
    // Throttle: no more than once every 10s
    const now = Date.now();
    if (unreadInFlightRef.current || now - lastUnreadFetchRef.current < 10000)
      return;
    unreadInFlightRef.current = true;
    try {
      const res = await fetch("/api/notifications/messages?unread=1", {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j.messages))
        setUnreadCount(j.messages.length);
      else setUnreadCount(0);
    } catch {
      setUnreadCount(0);
    } finally {
      lastUnreadFetchRef.current = Date.now();
      unreadInFlightRef.current = false;
    }
  };

  // Focused notifications: load unread when dropdown opens
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status !== "authenticated") {
      setUnreadMsgs([]);
      return;
    }
    if (!dropdownOpen && !mobileOpen) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingMsgs(true);
        // Reuse throttled fetch for count, but fetch full list here (once per open)
        const res = await fetch("/api/notifications/messages?unread=1", {
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && Array.isArray(j.messages)) {
          setUnreadMsgs(j.messages);
          setUnreadCount(j.messages.length);
        } else {
          setUnreadMsgs([]);
          setUnreadCount(0);
        }
      } catch {
        setUnreadMsgs([]);
      } finally {
        if (!cancelled) setLoadingMsgs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dropdownOpen, mobileOpen, status]);

  // Handlers: mark individual/all notifications as read
  const markMsgRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/messages/${id}/read`, { method: "POST" });
      setUnreadMsgs((prev) => prev.filter((m) => m.id !== id));
      setUnreadCount((c) => Math.max(0, c - 1));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("notifications:updated"));
      }
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/messages/read-all", { method: "POST" });
      setUnreadMsgs([]);
      setUnreadCount(0);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("notifications:updated"));
      }
    } catch {}
  };

  // Keep unread indicator updated periodically and on visibility
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status !== "authenticated") {
      setUnreadCount(0);
      return;
    }
    let mounted = true;
    // initial fetch
    void refreshUnreadCount();
    // visibility handler
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshUnreadCount();
    };
    document.addEventListener("visibilitychange", onVis);
    // poll every 60s
    const t = setInterval(() => {
      if (mounted) void refreshUnreadCount();
    }, 60000);
    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(t);
    };
  }, [status]);

  // Listen for global notifications updates to refresh badge/dropdown immediately
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUpdated = async () => {
      await refreshUnreadCount();
      if (dropdownOpen && status === "authenticated") {
        try {
          setLoadingMsgs(true);
          const res = await fetch("/api/notifications/messages?unread=1", {
            cache: "no-store",
          });
          const j = await res.json().catch(() => ({}));
          if (res.ok && Array.isArray(j.messages)) {
            setUnreadMsgs(j.messages);
            setUnreadCount(j.messages.length);
          }
        } finally {
          setLoadingMsgs(false);
        }
      }
    };
    window.addEventListener(
      "notifications:updated",
      onUpdated as EventListener
    );
    return () =>
      window.removeEventListener(
        "notifications:updated",
        onUpdated as EventListener
      );
  }, [dropdownOpen, status]);

  // Navigation link component
  const NavLink = ({ path, label }: NavItem) => (
    <Link
      href={path as unknown as Route}
      className={`inline-flex items-center px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
        isActive(path)
          ? "bg-gradient-to-tr from-blue-600 to-emerald-500 text-white shadow-sm"
          : "text-gray-700/90 dark:text-gray-200/90 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/70 dark:hover:bg-white/5"
      }`}
    >
      {label}
    </Link>
  );

  // Dropdown link component
  const DropdownLink = ({ path, label }: DropdownItem) => (
    <Link
      href={path as unknown as Route}
      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
      role="menuitem"
    >
      {label}
    </Link>
  );

  // Auth link component
  const AuthLink = ({ path, label, className }: AuthItem) => (
    <Link
      href={path as unknown as Route}
      className={`inline-flex items-center px-4 py-2 border text-sm font-medium rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${className}`}
    >
      {label}
    </Link>
  );

  // Close menus on route change
  useEffect(() => {
    setMobileOpen(false);
    setDropdownOpen(false);
  }, [pathname]);

  // Outside click to close profile dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!dropdownOpen) return;
      const t = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(t)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  // Outside click to close More dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!moreOpen) return;
      const t = e.target as Node;
      if (moreRef.current && !moreRef.current.contains(t)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [moreOpen]);

  // Outside click to close mobile menu (overlay handles this as well)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!mobileOpen) return;
      const t = e.target as Node;
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(t)) {
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileOpen]);

  // When mobile menu is open, lock background scroll
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (mobileOpen) {
      // Prevent background scroll/touch
      const prevOverflow = body.style.overflow;
      const prevTouch = (body.style as any).touchAction || "";
      body.style.overflow = "hidden";
      (body.style as any).touchAction = "none";
      return () => {
        body.style.overflow = prevOverflow;
        (body.style as any).touchAction = prevTouch;
      };
    }
    // restore if closed
    body.style.overflow = "";
    (body.style as any).touchAction = "";
  }, [mobileOpen]);

  // Fetch admin flag and auto-logout if the app user record is missing
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (status === "authenticated") {
      (async () => {
        try {
          // Start/refresh device session; if expired -> logout
          const hb = await sendSessionHeartbeat();
          if (!hb.ok && hb.expired) {
            try {
              await disableNotifications();
            } catch {}
            await signOut({ callbackUrl: "/" });
            return;
          }

          const res = await fetch("/api/me");
          // Only force logout for explicit auth/user errors
          if (res.status === 401 || res.status === 404) {
            try {
              await disableNotifications();
            } catch {}
            await signOut({ callbackUrl: "/" });
            return;
          }
          if (!res.ok) {
            // For transient errors like 429/500, keep the session and skip logout
            setIsAdmin(false);
            return;
          }
          const j = await res.json().catch(() => ({}));
          if (!j?.user) {
            try {
              await disableNotifications();
            } catch {}
            await signOut({ callbackUrl: "/" });
            return;
          }
          setIsAdmin(Boolean(j.user.is_sys_admin));
        } catch {
          setIsAdmin(false);
        }
      })();
    } else {
      setIsAdmin(false);
    }
  }, [status]);

  // Fetch Life Streak for compact display
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status !== "authenticated") {
      setLifeStreak(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/life-streak");
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && j?.lifeStreak) {
          setLifeStreak({
            current: j.lifeStreak.current,
            longest: j.lifeStreak.longest,
          });
        } else {
          setLifeStreak(null);
        }
      } catch {
        setLifeStreak(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  // Initialize Google One Tap for quick login when logged out
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status !== "unauthenticated") return;
    if (pathname?.startsWith("/auth/")) return; // don't show on sign-in page
    // Small delay so UI settles
    const t = setTimeout(() => {
      void initGoogleOneTap();
    }, 400);
    return () => clearTimeout(t);
  }, [status, pathname]);

  // After auth, associate any existing browser push subscription with the user (once)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status !== "authenticated") return;
    void syncSubscriptionWithServer();
  }, [status]);

  // Fetch user progress (level/EP) for quick glance in Navbar
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status !== "authenticated") {
      setProgress(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setProgLoading(true);
        const res = await fetch("/api/progress");
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && j?.progress) {
          setProgress({
            level: j.progress.level,
            ep: j.progress.ep,
            ep_required: j.progress.ep_required,
            diamonds: j.progress.diamonds ?? 0,
          });
        } else {
          setProgress(null);
        }
      } catch {
        setProgress(null);
      } finally {
        if (!cancelled) setProgLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  // Fetch user's badges and compute highest/latest to show in Navbar
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status !== "authenticated") {
      setTopBadge(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/collectibles/mine");
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !Array.isArray(j.items)) {
          setTopBadge(null);
          return;
        }
        const items = j.items as Array<{
          name: string;
          icon?: string;
          is_badge?: boolean;
          acquired_at?: string;
        }>;
        const badges = items.filter((it) => it.is_badge);
        if (!badges.length) {
          setTopBadge(null);
          return;
        }
        const rank = (n: string) => {
          const s = (n || "").toLowerCase();
          if (s.includes("gold")) return 3;
          if (s.includes("silver")) return 2;
          if (s.includes("bronze")) return 1;
          return 0;
        };
        badges.sort((a, b) => {
          const r = rank(b.name) - rank(a.name);
          if (r !== 0) return r;
          const ta = a.acquired_at ? new Date(a.acquired_at).getTime() : 0;
          const tb = b.acquired_at ? new Date(b.acquired_at).getTime() : 0;
          return tb - ta;
        });
        const best = badges[0];
        setTopBadge({ name: best.name, icon: best.icon });
      } catch {
        setTopBadge(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  // Send heartbeat when tab becomes visible to refresh expiry window
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status !== "authenticated") return;
    const onVis = async () => {
      if (document.visibilityState === "visible") {
        const hb = await sendSessionHeartbeat();
        if (!hb.ok && hb.expired) {
          try {
            await disableNotifications();
          } catch {}
          await signOut({ callbackUrl: "/" });
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    // Remove immediate call to avoid double heartbeat on mount; it'll run on first visibility change
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [status]);

  // Auto-prompt on sign-in/open if not granted/denied (once per session)
  const promptedRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (status !== "authenticated") return;
    if (promptedRef.current) return;
    if (Notification.permission === "default") {
      promptedRef.current = true;
      // Fire and forget; errors are handled inside
      enableNotifications();
    }
  }, [status]);

  const sendTest = async () => {
    try {
      const res = await fetch("/api/push/send-test-admin", { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Send failed");
      }
      toast.success("Test notification sent");
    } catch (e) {
      console.error("sendTest error", e);
      toast.error("Failed to send test");
    }
  };
  
  if (status === "loading") {
    return null;
  }

  return (
    <nav className="sticky top-0 z-40 bg-white/70 dark:bg-gray-950/60 backdrop-blur supports-[backdrop-filter]:bg-white/50 dark:supports-[backdrop-filter]:bg-gray-950/50 border-b border-gray-200/70 dark:border-gray-800/60 shadow-[0_1px_0_0_rgba(0,0,0,0.04)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Left: Brand */}
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-xl font-bold bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent"
            >
              Nourish
            </Link>
            {status === "authenticated" && (
              <div className="hidden sm:flex items-center gap-2 min-w-0">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap pr-1">
                  {primaryNav.map((item) => (
                    <NavLink key={item.path} {...item} />
                  ))}
                </div>
                {/* More dropdown for overflow */}
                <div className="relative" ref={moreRef}>
                  <button
                    type="button"
                    onClick={() => setMoreOpen((v) => !v)}
                    className={`inline-flex items-center px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                      moreOpen
                        ? "bg-gradient-to-tr from-blue-600 to-emerald-500 text-white shadow-sm"
                        : "text-gray-700/90 dark:text-gray-200/90 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/70 dark:hover:bg-white/5"
                    }`}
                    aria-expanded={moreOpen}
                    aria-haspopup="true"
                  >
                    More
                  </button>
                  {moreOpen && (
                    <div className="absolute left-0 mt-2 w-56 rounded-xl shadow-xl bg-white/90 dark:bg-gray-900/90 backdrop-blur border border-gray-200/70 dark:border-gray-800/70 z-20">
                      <div className="py-1">
                        {moreNav.map((item) => (
                          <DropdownLink key={item.path} {...(item as any)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right side */}
          <div className="hidden sm:flex items-center gap-3">
            {status === "authenticated" && (
              <div className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-gray-200/80 dark:border-gray-800/80 bg-white/70 dark:bg-gray-900/70">
                <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-500 text-white flex items-center justify-center">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                  Lv {progress?.level ?? "--"}
                </div>
                {topBadge && (
                  <div className="ml-1 flex items-center gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={(() => {
                        const ic = topBadge.icon;
                        if (!ic) return "/images/collectibles/default.svg";
                        if (ic.startsWith("http") || ic.startsWith("/"))
                          return ic;
                        return `/images/collectibles/${ic}.svg`;
                      })()}
                      onError={(e) => {
                        const fb = "/images/collectibles/default.svg";
                        // @ts-ignore
                        if (!e.currentTarget.src.endsWith(fb)) {
                          // @ts-ignore
                          e.currentTarget.src = fb;
                        }
                      }}
                      alt={topBadge.name}
                      className="h-5 w-5 rounded-sm"
                    />
                    <span
                      className="text-[11px] text-gray-600 dark:text-gray-300 truncate max-w-[100px]"
                      title={topBadge.name}
                    >
                      {topBadge.name}
                    </span>
                  </div>
                )}
                <div className="ml-1 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full border bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30">
                  <Gem className="h-3.5 w-3.5" />
                  <span className="tabular-nums">
                    {progress?.diamonds ?? 0}
                  </span>
                </div>
                {typeof lifeStreak?.current === "number" && (
                  <div className="ml-1 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full border bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30">
                    <span aria-hidden>🔥</span>
                    <span className="tabular-nums">{lifeStreak.current}</span>
                  </div>
                )}
              </div>
            )}
            {status === "authenticated" && isAdmin && (
              <button
                type="button"
                onClick={sendTest}
                className="px-3 py-1.5 text-sm rounded-full border border-gray-200/80 dark:border-gray-800/80 hover:bg-gray-100/80 dark:hover:bg-white/5"
              >
                Send test
              </button>
            )}
            {status === "authenticated" && isAdmin && (
              <Link
                href={"/admin" as unknown as Route}
                className="px-3 py-1.5 text-sm rounded-full border border-gray-200/80 dark:border-gray-800/80 hover:bg-gray-100/80 dark:hover:bg-white/5"
                title="Admin"
              >
                Admin
              </Link>
            )}
            {status === "authenticated" ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  className="relative bg-white/70 dark:bg-gray-900/70 rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 border border-gray-200/70 dark:border-gray-800/70"
                  aria-haspopup="true"
                  aria-expanded={dropdownOpen}
                  onClick={() => setDropdownOpen((v) => !v)}
                >
                  <span className="sr-only">Open user menu</span>
                  <img
                    className="h-8 w-8 rounded-full"
                    src={session?.user?.image || "/default-avatar.png"}
                    alt={session?.user?.name || "User"}
                  />
                  {status === "authenticated" && unreadCount > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900"
                      aria-hidden
                    />
                  )}
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl shadow-xl bg-white/90 dark:bg-gray-900/90 backdrop-blur border border-gray-200/70 dark:border-gray-800/70 focus:outline-none z-20">
                    <div className="py-1">
                      {/* Focused notifications list */}
                      <div className="px-3 py-2 border-b border-gray-200/70 dark:border-gray-800/70">
                        <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                            Notifications
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={markAllRead}
                              disabled={loadingMsgs || unreadMsgs.length === 0}
                              className="text-[11px] px-2.5 py-1.5 rounded-full border border-gray-200/70 dark:border-gray-800/70 hover:bg-gray-100/70 dark:hover:bg-white/5 disabled:opacity-50"
                            >
                              Mark all read
                            </button>
                            <Link
                              href={"/notifications" as unknown as Route}
                              onClick={() => setDropdownOpen(false)}
                              className="text-[11px] px-2.5 py-1.5 rounded-full border border-gray-200/70 dark:border-gray-800/70 hover:bg-gray-100/70 dark:hover:bg-white/5"
                            >
                              View all
                            </Link>
                          </div>
                        </div>
                        {loadingMsgs ? (
                          <div className="space-y-2" aria-hidden>
                            <div className="skeleton h-14 rounded-xl" />
                            <div className="skeleton h-14 rounded-xl" />
                          </div>
                        ) : unreadMsgs.length === 0 ? (
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            No new notifications
                          </div>
                        ) : (
                          <ul className="space-y-2 max-h-64 overflow-auto">
                            {unreadMsgs.slice(0, 8).map((m) => (
                              <li key={m.id}>
                                <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white/80 dark:bg-gray-900/70 shadow-sm p-3">
                                  <div className="flex items-start gap-2">
                                    <div className="mt-0.5 h-6 w-6 min-w-6 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white flex items-center justify-center text-[12px]">
                                      🔔
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div
                                        className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate"
                                        title={m.title}
                                      >
                                        {m.title}
                                      </div>
                                      <div
                                        className="text-[12px] text-gray-700 dark:text-gray-300 truncate"
                                        title={m.body}
                                      >
                                        {m.body}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2">
                                      {m.url && (
                                        <button
                                          className="text-[12px] px-2 py-1 rounded-full border border-gray-200/70 dark:border-gray-800/70 hover:bg-gray-100/70 dark:hover:bg-white/5 text-blue-600 dark:text-blue-400"
                                          onClick={async () => {
                                            await markMsgRead(m.id);
                                            setDropdownOpen(false);
                                            router.push(m.url as Route);
                                          }}
                                        >
                                          View
                                        </button>
                                      )}
                                      <button
                                        className="text-[12px] px-2 py-1 rounded-full border border-gray-200/70 dark:border-gray-800/70 hover:bg-gray-100/70 dark:hover:bg-white/5"
                                        onClick={() => markMsgRead(m.id)}
                                      >
                                        Mark read
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {/* Notifications toggle */}
                      <button
                        className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50/80 dark:hover:bg:white/5"
                        onClick={async () => {
                          if (notifPending) return;
                          if (notifEnabled) {
                            await disableNotifications();
                          } else {
                            await enableNotifications();
                          }
                        }}
                        disabled={notifPending || notifEnabled === null}
                        aria-busy={notifPending}
                      >
                        <span className="flex items-center">
                          Notifications{" "}
                          {notifPending && (
                            <Loader2 className="h-3 w-3 ml-1 inline-block" />
                          )}
                        </span>
                        <span
                          className={`${notifEnabled ? "bg-blue-600" : "bg-gray-300"} ${notifPending ? "opacity-60" : ""} inline-flex h-5 w-10 items-center rounded-full transition-colors`}
                          aria-hidden
                        >
                          <span
                            className={`${notifEnabled ? "translate-x-5" : "translate-x-1"} inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform`}
                          />
                        </span>
                      </button>
                      {dropdownItems.map((item) => (
                        <DropdownLink key={item.path} {...item} />
                      ))}
                      <button
                        onClick={async () => {
                          try {
                            await disableNotifications();
                          } catch {}
                          await signOut({ callbackUrl: "/" });
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50/80 dark:hover:bg-white/5"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-gray-200/70 dark:border-gray-800/70 bg-white/60 dark:bg-white/5 backdrop-blur">
                  <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-500 text-white flex items-center justify-center">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                    Start your streak
                  </div>
                  <span className="ml-1 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full border bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30">
                    <Gem className="h-3.5 w-3.5" />
                    <span className="tabular-nums">+50</span>
                  </span>
                </div>
                <Link
                  href="/auth/signin"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-white bg-gradient-to-tr from-blue-600 to-emerald-500 shadow-sm hover:shadow transition"
                >
                  Join the Quest
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button (auth only) */}
          {status === "authenticated" && (
            <div className="flex items-center sm:hidden">
              <button
                type="button"
                aria-controls="mobile-menu"
                aria-expanded={mobileOpen}
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                onClick={() => setMobileOpen((v) => !v)}
                className="relative inline-flex items-center justify-center p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text:white hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              >
                <span className="sr-only">Toggle main menu</span>
                <span className="relative block h-5 w-6">
                  <span
                    className={`absolute left-0 top-0 h-0.5 w-6 bg-current rounded transition-all duration-300 ease-out motion-reduce:transition-none ${
                      mobileOpen ? "translate-y-2 rotate-45" : ""
                    }`}
                  />
                  <span
                    className={`absolute left-0 top-2 h-0.5 w-6 bg-current rounded transition-opacity duration-300 ease-out motion-reduce:transition-none ${
                      mobileOpen ? "opacity-0" : "opacity-100"
                    }`}
                  />
                  <span
                    className={`absolute left-0 bottom-0 h-0.5 w-6 bg-current rounded transition-all duration-300 ease-out motion-reduce:transition-none ${
                      mobileOpen ? "-translate-y-2 -rotate-45" : ""
                    }`}
                  />
                </span>
                {status === "authenticated" && unreadCount > 0 && (
                  <span
                    className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900"
                    aria-hidden
                  />
                )}
              </button>
            </div>
          )}
          {status !== "authenticated" && (
            <div className="flex items-center sm:hidden ml-auto">
              <Link
                href="/auth/signin"
                className="inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold text-white bg-gradient-to-tr from-blue-600 to-emerald-500 shadow-sm"
              >
                Join
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile menu (animated) - auth only */}
      {status === "authenticated" && (
        <>
          {/* Backdrop overlay */}
          <div
            className={`fixed inset-0 z-[70] bg-black/50 sm:hidden transition-opacity duration-300 ease-out ${
              mobileOpen
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            }`}
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div
            className={`sm:hidden fixed z-[80] top-16 bottom-0 inset-x-0 transform transition-all duration-300 ease-out bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 shadow-xl ${
              mobileOpen
                ? "opacity-100 translate-y-0 pointer-events-auto"
                : "opacity-0 -translate-y-2 pointer-events-none"
            }`}
            id="mobile-menu"
            ref={mobileMenuRef}
          >
            <div className="max-h-[calc(100vh-4rem)] overflow-y-auto scroll-smooth bg-white dark:bg-gray-950">
              {status === "authenticated" && (
                <div className="px-4 pt-3">
                  <div className="rounded-xl border border-gray-200/80 dark:border-gray-800/80 bg-white dark:bg-gray-900 p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Notifications
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={markAllRead}
                          disabled={loadingMsgs || unreadMsgs.length === 0}
                          className="text-[11px] px-2 py-1 rounded-full border border-gray-200/70 dark:border-gray-800/70 hover:bg-gray-100/70 dark:hover:bg-white/5 disabled:opacity-50"
                        >
                          Mark all read
                        </button>
                        <Link
                          href={"/notifications" as unknown as Route}
                          onClick={() => setMobileOpen(false)}
                          className="text-[11px] px-2 py-1 rounded-full border border-gray-200/70 dark:border-gray-800/70 hover:bg-gray-100/70 dark:hover:bg:white/5"
                        >
                          View all
                        </Link>
                      </div>
                    </div>
                    {loadingMsgs ? (
                      <div className="text-[12px] text-gray-600 dark:text-gray-300">
                        Loading...
                      </div>
                    ) : unreadMsgs.length === 0 ? (
                      <div className="text-[12px] text-gray-600 dark:text-gray-400">
                        No new notifications
                      </div>
                    ) : (
                      <ul className="space-y-1.5 max-h-56 overflow-auto">
                        {unreadMsgs.slice(0, 5).map((m) => (
                          <li key={m.id} className="">
                            <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white dark:bg-gray-900 shadow-sm p-2">
                              <div className="flex gap-2">
                                <div className="mt-0.5 h-4 w-4 min-w-4 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-500 text-white flex items-center justify-center text-[10px]">
                                  🔔
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div
                                    className="text-[12px] font-semibold text-gray-900 dark:text-gray-100 truncate"
                                    title={m.title}
                                  >
                                    {m.title}
                                  </div>
                                  <div
                                    className="text-[11px] text-gray-700 dark:text-gray-300 truncate"
                                    title={m.body}
                                  >
                                    {m.body}
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-2">
                                    {m.url && (
                                      <Link
                                        href={m.url as Route}
                                        className="text-[11px] text-blue-600 dark:text-blue-400 underline hover:no-underline"
                                        onClick={() => setMobileOpen(false)}
                                      >
                                        View
                                      </Link>
                                    )}
                                    <button
                                      className="text-[11px] text-gray-700 dark:text-gray-300 hover:underline"
                                      onClick={() => markMsgRead(m.id)}
                                    >
                                      Mark read
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
              <div className="space-y-1 px-4 pt-2 pb-3 bg-white dark:bg-gray-950 border-b border-gray-200/70 dark:border-gray-800/70">
                {[...primaryNav, ...moreNav].map((item) => (
                  <Link
                    key={item.path}
                    href={item.path as unknown as Route}
                    className={`block px-3 py-2 rounded-full text-sm font-medium ${
                      isActive(item.path)
                        ? "bg-gradient-to-tr from-blue-600/90 to-emerald-500/90 text-white shadow"
                        : "text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/80 dark:hover:bg-white/5"
                    }`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <div className="border-t border-gray-200/70 dark:border-gray-800/70 px-4 py-3 bg-white dark:bg-gray-950">
                {status === "authenticated" ? (
                  <>
                    <div className="flex items-center gap-3">
                      <img
                        className="h-10 w-10 rounded-full"
                        src={session?.user?.image || "/default-avatar.png"}
                        alt={session?.user?.name || "User"}
                      />
                      <div>
                        <div className="text-base font-medium text-gray-800 dark:text-gray-100">
                          {session?.user?.name}
                        </div>
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          {session?.user?.email}
                        </div>
                      </div>
                    </div>
                    {/* Level card */}
                    <div className="mt-3 rounded-xl border border-gray-200/80 dark:border-gray-800/80 bg-white/70 dark:bg-gray-900/70 p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-500 text-white flex items-center justify-center">
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                            Level {progress?.level ?? "--"}
                          </div>
                          {topBadge && (
                            <div className="flex items-center gap-1 min-w-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={(() => {
                                  const ic = topBadge.icon;
                                  if (!ic)
                                    return "/images/collectibles/default.svg";
                                  if (
                                    ic.startsWith("http") ||
                                    ic.startsWith("/")
                                  )
                                    return ic;
                                  return `/images/collectibles/${ic}.svg`;
                                })()}
                                onError={(e) => {
                                  const fb = "/images/collectibles/default.svg";
                                  // @ts-ignore
                                  if (!e.currentTarget.src.endsWith(fb)) {
                                    // @ts-ignore
                                    e.currentTarget.src = fb;
                                  }
                                }}
                                alt={topBadge.name}
                                className="h-5 w-5 rounded-sm"
                              />
                              <span
                                className="text-[12px] text-gray-600 dark:text-gray-300 truncate"
                                title={topBadge.name}
                              >
                                {topBadge.name}
                              </span>
                            </div>
                          )}
                          <span className="ml-1 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full border bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30">
                            <Gem className="h-3.5 w-3.5" />
                            <span className="tabular-nums">
                              {progress?.diamonds ?? 0}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1">
                      {dropdownItems.map((item) => (
                        <Link
                          key={item.path}
                          href={item.path as unknown as Route}
                          className="block px-3 py-2 rounded-full text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/80 dark:hover:bg-white/5"
                          onClick={() => setMobileOpen(false)}
                        >
                          {item.label}
                        </Link>
                      ))}
                      <button
                        onClick={async () => {
                          try {
                            await disableNotifications();
                          } catch {}
                          await signOut({ callbackUrl: "/" });
                        }}
                        className="block w-full text-left px-3 py-2 rounded-full text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text:white hover:bg-gray-100/80 dark:hover:bg-white/5"
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1">
                    <Link
                      href="/auth/signin"
                      className="block w-full px-3 py-2 rounded-full text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text:white hover:bg-gray-100/80 dark:hover:bg-white/5"
                      onClick={() => setMobileOpen(false)}
                    >
                      Sign in
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}

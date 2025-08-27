"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/utils/cn";
import { useState } from "react";
import {
  Home,
  ListTodo,
  Plus,
  Target,
  Sparkles,
  MessageSquareText,
} from "lucide-react";

const items = [
  { href: "/dashboard", label: "Today", icon: Home },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/food", label: "Log", icon: Plus },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/suggestions", label: "Suggest", icon: Sparkles },
  // { href: "/chat", label: "Chat", icon: MessageSquareText },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { status } = useSession();
  const [fabBounce, setFabBounce] = useState(false);
  if (status !== "authenticated") return null;
  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200/70 dark:border-gray-800/70 bg-white/80 dark:bg-gray-950/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-gray-950/60 shadow-[0_-1px_0_0_rgba(0,0,0,0.04)] md:hidden"
    >
      <ul
        className={cn(
          "grid h-[4.75rem] px-2 pb-[env(safe-area-inset-bottom)]",
          (items.length === 5 ? "grid-cols-5" : "grid-cols-6")
        )}
      >
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
          return (
            <li key={href} className="flex items-stretch">
              {href === "/food" ? (
                <div className="flex-1 flex items-end justify-center">
                  <Link
                    href={{ pathname: href }}
                    className="group -translate-y-3 flex flex-col items-center"
                    aria-current={active ? "page" : undefined}
                    onPointerDown={() => {
                      setFabBounce(true);
                      setTimeout(() => setFabBounce(false), 300);
                    }}
                  >
                    <span
                      className={cn(
                        "inline-flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg ring-1 ring-black/5 transition-transform",
                        "bg-gradient-to-tr from-blue-600 to-emerald-500",
                        active ? "scale-105" : "group-active:scale-95"
                      )}
                      style={fabBounce ? ({ animation: "bounce 500ms" } as any) : undefined}
                    >
                      <Icon aria-hidden className="h-6 w-6" strokeWidth={2.2} />
                    </span>
                    <span className="mt-1 text-[10px] leading-none font-medium text-gray-700 dark:text-gray-200">{label}</span>
                  </Link>
                </div>
              ) : (
                <Link
                  href={{ pathname: href }}
                  className={cn(
                    "flex-1 mx-1 my-1 flex flex-col items-center justify-center text-[10px] gap-1 rounded-2xl transition-colors",
                    "hover:bg-gray-100/70 dark:hover:bg-white/5"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    aria-hidden
                    className={cn(
                      "h-[21px] w-[21px]",
                      active
                        ? "text-blue-600 dark:text-emerald-400"
                        : "text-gray-600 dark:text-gray-300"
                    )}
                    strokeWidth={2.2}
                  />
                  <span className={cn(
                    "leading-none font-medium",
                    "text-gray-700 dark:text-gray-200"
                  )}>{label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {/* bounce keyframes for FAB */}
      <style jsx global>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
          60% { transform: translateY(0); }
        }
      `}</style>
    </nav>
  );
}


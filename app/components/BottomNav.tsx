"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/utils/cn";

const items = [
  { href: "/me", label: "Me", icon: HeartIcon },
  { href: "/dashboard", label: "Home", icon: HomeIcon },
  { href: "/food", label: "Log", icon: PlusIcon },
  { href: "/workouts", label: "Workouts", icon: DumbbellIcon },
  { href: "/suggestions", label: "Suggest", icon: SparklesIcon },
  { href: "/chat", label: "Chat", icon: ChatIcon },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200/80 dark:border-gray-800/80 bg-white/90 dark:bg-gray-950/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-gray-950/70 md:hidden"
    >
      <ul className={`grid grid-cols-6 h-16 px-2`}>
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
          return (
            <li key={href} className="flex items-stretch">
              <Link
                href={{ pathname: href }}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center text-xs gap-1",
                  active ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon aria-hidden className={cn("h-6 w-6", active && "fill-blue-50 dark:fill-blue-950")}/>
                <span className="leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M5 11l2-4 2 4 4 2-4 2-2 4-2-4-4-2 4-2Zm10-7l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Zm2 10l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z" className="stroke-current" fill="none" strokeWidth="1.5"/>
    </svg>
  );
}

function HomeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M4 10.5 12 4l8 6.5V20a2 2 0 0 1-2 2h-4v-6H10v6H6a2 2 0 0 1-2-2v-9.5Z" className="stroke-current" fill="none" strokeWidth="1.5"/>
    </svg>
  );
}
function HeartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M12 21s-6.7-3.9-9.3-7.5C.5 10.7 2 7 5.3 6.3c1.8-.4 3.7.3 4.7 1.9 1-1.6 2.9-2.3 4.7-1.9C18 7 19.5 10.7 17.3 13.5 14.7 17.1 12 21 12 21Z" className="stroke-current" fill="none" strokeWidth="1.5"/>
    </svg>
  );
}
function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M12 5v14M5 12h14" className="stroke-current" fill="none" strokeWidth="1.5"/>
    </svg>
  );
}
function ChatIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M4 5h16v10H7l-3 4V5Z" className="stroke-current" fill="none" strokeWidth="1.5"/>
    </svg>
  );
}
function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-5 0-9 3-9 6v2h18v-2c0-3-4-6-9-6Z" className="stroke-current" fill="none" strokeWidth="1.5"/>
    </svg>
  );
}
function SettingsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M10 2h4l.6 2.4 2.2 1.2 2.2-1.2 2 3.4-2 1.2V12l2 1.2-2 3.4-2.2-1.2-2.2 1.2L14 22h-4l-.6-2.4-2.2-1.2-2.2 1.2-2-3.4L5 13V11L3 9.8l2-3.4 2.2 1.2 2.2-1.2L10 2Zm2 7a4 4 0 1 0 4 4 4 4 0 0 0-4-4Z" className="stroke-current" fill="none" strokeWidth="1.5"/>
    </svg>
  );
}

function DumbbellIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M3 9h2v6H3V9Zm4-3h2v12H7V6Zm10 0h-2v12h2V6Zm4 3h-2v6h2V9Zm-13 4h6v-2H8v2Z" className="stroke-current" fill="none" strokeWidth="1.5"/>
    </svg>
  );
}

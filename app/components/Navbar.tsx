'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import type { Route } from 'next';
import { useEffect, useRef, useState } from 'react';

// Define route types as string literals
type NavPath = '/me' | '/dashboard' | '/food' | '/groceries' | '/suggestions' | '/chat' | '/workouts';
type DropdownPath = '/profile' | '/settings';
type AuthPath = '/auth/signin';

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

// Navigation items
const navItems: NavItem[] = [
  { path: '/me', label: 'Motivate' },
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/food', label: 'Food Log' },
  { path: '/groceries', label: 'Groceries' },
  { path: '/workouts', label: 'Workouts' },
  { path: '/suggestions', label: 'Suggestions' },
  { path: '/chat', label: 'Coach' },
];

// Dropdown items
const dropdownItems: DropdownItem[] = [
  { path: '/profile', label: 'Your Profile' },
  { path: '/settings', label: 'Settings' }
];

// Auth items
const authItems: Record<string, AuthItem> = {
  signin: { path: '/auth/signin', label: 'Sign in', className: 'bg-blue-600 text-white hover:bg-blue-700' }
};

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (path: string) => pathname === path;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  
  // Navigation link component
  const NavLink = ({ path, label }: NavItem) => (
    <Link
      href={path as unknown as Route}
      className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        isActive(path)
          ? 'bg-blue-600 text-white'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
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
      className={`inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${className}`}
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
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  // Outside click to close mobile menu (overlay handles this as well)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!mobileOpen) return;
      const t = e.target as Node;
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(t)) {
        setMobileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileOpen]);

  if (status === 'loading') {
    return null;
  }

  return (
    <nav className="bg-white dark:bg-gray-950 shadow-sm border-b border-gray-200 dark:border-gray-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Left: Brand */}
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold text-blue-600">Nourish</Link>
            <div className="hidden sm:flex items-center gap-2">
              {navItems.map((item) => (
                <NavLink key={item.path} {...item} />
              ))}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="hidden sm:flex items-center">
            {status === 'authenticated' ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  className="bg-white dark:bg-gray-900 rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  aria-haspopup="true"
                  aria-expanded={dropdownOpen}
                  onClick={() => setDropdownOpen((v) => !v)}
                >
                  <span className="sr-only">Open user menu</span>
                  <img
                    className="h-8 w-8 rounded-full"
                    src={session.user?.image || '/default-avatar.png'}
                    alt={session.user?.name || 'User'}
                  />
                </button>
                {dropdownOpen && (
                  <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white dark:bg-gray-900 ring-1 ring-black/5 dark:ring-white/10 z-10">
                    {dropdownItems.map((item) => (
                      <DropdownLink key={item.path} {...item} />
                    ))}
                    <button
                      onClick={() => signOut({ callbackUrl: '/' })}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-3">
                {Object.values(authItems).map((item) => (
                  <AuthLink key={item.path} {...item} />
                ))}
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-controls="mobile-menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              <span className="sr-only">Open main menu</span>
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <>
          {/* Backdrop overlay */}
          <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
          <div className="sm:hidden fixed z-50 top-16 inset-x-0" id="mobile-menu" ref={mobileMenuRef}>
          <div className="space-y-1 px-4 pt-2 pb-3 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
            {navItems.map((item) => (
              <Link
                key={item.path}
                href={item.path as unknown as Route}
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  isActive(item.path)
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                }`}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-3 bg-white dark:bg-gray-950">
            {status === 'authenticated' ? (
              <>
                <div className="flex items-center gap-3">
                  <img className="h-10 w-10 rounded-full" src={session.user?.image || '/default-avatar.png'} alt={session.user?.name || 'User'} />
                  <div>
                    <div className="text-base font-medium text-gray-800 dark:text-gray-100">{session.user?.name}</div>
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{session.user?.email}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {dropdownItems.map((item) => (
                    <Link key={item.path} href={item.path as unknown as Route} className="block px-3 py-2 rounded-md text-base font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => setMobileOpen(false)}>
                      {item.label}
                    </Link>
                  ))}
                  <button onClick={() => signOut({ callbackUrl: '/' })} className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800">
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <Link href="/auth/signin" className="block w-full px-3 py-2 rounded-md text-base font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => setMobileOpen(false)}>
                  Sign in
                </Link>
              </div>
            )}
          </div>
          </div>
        </>
      )}
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import type { Route } from 'next';
import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/utils/notifications';

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
  const { enabled: notifEnabled, pending: notifPending, enable: enableNotifications, disable: disableNotifications } = useNotifications();
  const [isAdmin, setIsAdmin] = useState(false);
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

  // Fetch admin flag
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Fetch admin flag when authenticated
    if (status === 'authenticated') {
      fetch('/api/me')
        .then((r) => r.json())
        .then((j) => {
          setIsAdmin(Boolean(j?.user?.is_sys_admin));
        })
        .catch(() => setIsAdmin(false));
    } else {
      setIsAdmin(false);
    }
  }, [status]);

  // Auto-prompt on sign-in/open if not granted/denied
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (status !== 'authenticated') return;
    if (Notification.permission === 'default') {
      // Fire and forget; errors are handled inside
      enableNotifications();
    }
  }, [status]);

  const sendTest = async () => {
    try {
      const res = await fetch('/api/push/send-test-admin', { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Send failed');
      }
      alert('Test notification sent');
    } catch (e) {
      console.error('sendTest error', e);
      alert('Failed to send test');
    }
  };

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
          <div className="hidden sm:flex items-center gap-3">
            {status === 'authenticated' && isAdmin && (
              <button
                type="button"
                onClick={sendTest}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Send test
              </button>
            )}
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
                    src={session?.user?.image || '/default-avatar.png'}
                    alt={session?.user?.name || 'User'}
                  />
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-gray-900 ring-1 ring-black ring-opacity-5 focus:outline-none z-20">
                    <div className="py-1">
                      {/* Notifications toggle */}
                      <button
                        className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
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
                        <span>Notifications {notifPending ? '(working...)' : ''}</span>
                        <span
                          className={`${notifEnabled ? 'bg-blue-600' : 'bg-gray-300'} ${notifPending ? 'opacity-60' : ''} inline-flex h-5 w-10 items-center rounded-full transition-colors`}
                          aria-hidden
                        >
                          <span
                            className={`${notifEnabled ? 'translate-x-5' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                          />
                        </span>
                      </button>
                      {dropdownItems.map((item) => (
                        <DropdownLink key={item.path} {...item} />
                      ))}
                      <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Sign out
                      </button>
                    </div>
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
              aria-controls="mobile-menu"
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            >
              <span className="sr-only">Toggle main menu</span>
              <span className="relative block h-5 w-6">
                <span
                  className={`absolute left-0 top-0 h-0.5 w-6 bg-current rounded transition-all duration-300 ease-out motion-reduce:transition-none ${
                    mobileOpen ? 'translate-y-2 rotate-45' : ''
                  }`}
                />
                <span
                  className={`absolute left-0 top-2 h-0.5 w-6 bg-current rounded transition-opacity duration-300 ease-out motion-reduce:transition-none ${
                    mobileOpen ? 'opacity-0' : 'opacity-100'
                  }`}
                />
                <span
                  className={`absolute left-0 bottom-0 h-0.5 w-6 bg-current rounded transition-all duration-300 ease-out motion-reduce:transition-none ${
                    mobileOpen ? '-translate-y-2 -rotate-45' : ''
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu (animated) */}
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 sm:hidden transition-opacity duration-300 ease-out ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />
      <div
        className={`sm:hidden fixed z-50 top-16 inset-x-0 transform transition-all duration-300 ease-out ${
          mobileOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
        id="mobile-menu"
        ref={mobileMenuRef}
      >
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
    </nav>
  );
}

import './globals.css';
import { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { auth } from '@/auth';
import { Providers } from './providers';
import { Toaster } from 'sonner';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import ProfilePrompt from './components/ProfilePrompt';
import InstallPrompt from './components/InstallPrompt';
import Onboarding from './components/Onboarding';
import TimezoneSetup from './components/TimezoneSetup';
import TimezoneMismatchPrompt from './components/TimezoneMismatchPrompt';
import AutoEnableNotifications from './components/AutoEnableNotifications';
import CapacitorDeepLinkHandler from './components/CapacitorDeepLinkHandler';
import OfflineBanner from './components/OfflineBanner';
import PushInit from './components/PushInit';
import StatusBarInit from './components/StatusBarInit';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Nourish — AI Life Tracker',
  description: 'Log meals by text or photo. Get empathetic coaching. PWA-ready.',
  manifest: '/manifest.json',
  icons: [{ rel: 'icon', url: '/icons/icon-192.svg' }],
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: 'no' as const,
  themeColor: '#ffffff',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  var t = localStorage.getItem('pref_theme') || 'system';
                  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var desired = t === 'system' ? (prefersDark ? 'dark' : 'light') : t;
                  if (desired === 'dark') document.documentElement.classList.add('dark');
                  else document.documentElement.classList.remove('dark');
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} min-h-full flex flex-col bg-background text-foreground pt-[env(safe-area-inset-top)]`}>
        {/* Fixed background layer to avoid any white areas behind content (SSR/PWA) */}
        <div className="fixed inset-0 -z-10 bg-background" aria-hidden />
        <Providers session={session}>
          <StatusBarInit />
          <Navbar />
          <OfflineBanner />
          <PushInit />
          <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <CapacitorDeepLinkHandler>
                {children}
              </CapacitorDeepLinkHandler>
            </div>
          </main>
          <BottomNav />
          {/* Profile prompt modal */}
          <ProfilePrompt />
          {/* PWA install prompt */}
          <InstallPrompt />
          {/* First-time onboarding modal */}
          <Onboarding />
          {/* Timezone setup prompt when missing */}
          <TimezoneSetup />
          {/* Prompt if saved timezone mismatches current device timezone */}
          <TimezoneMismatchPrompt />
          {/* Auto-enable/sync notifications on login */}
          <AutoEnableNotifications />
          {/* Global toaster */}
          <Toaster richColors position="top-center" theme="system" />
          <footer className="hidden md:block bg-surface border-t border-border mt-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <p className="text-center text-sm text-muted">
                &copy; {new Date().getFullYear()} Nourish. All rights reserved.
              </p>
              <p className="mt-2 text-center text-xs text-muted">
                Made with ❤️ — by Shreyans. Be Kind to Yourself.
              </p>
            </div>
          </footer>
          <script 
            dangerouslySetInnerHTML={{ 
              __html: `
                if('serviceWorker' in navigator) {
                  const registerSW = async () => {
                    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
                    // Use the push-capable SW in all environments so notifications show.
                    // The previous prod SW ('/sw.js') is a Workbox precache that doesn't handle 'push'.
                    const swUrl = '/sw-push.js';
                    try {
                      // Unregister any previous SWs that don't match the chosen script
                      try {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        regs.forEach(r => {
                          const url = (r.active && r.active.scriptURL) || '';
                          if (url && !url.endsWith(swUrl)) {
                            r.unregister();
                            console.log('[SW] Unregistered old:', url);
                          }
                        });
                      } catch (e) {}

                      const reg = await navigator.serviceWorker.register(swUrl, { scope: '/' });
                      console.log('[SW] Registered:', swUrl);
                      await navigator.serviceWorker.ready;
                      console.log('[SW] Ready');
                    } catch (err) {
                      console.error('[SW] Registration failed:', err);
                    }
                  };

                  if (document.readyState === 'complete') registerSW();
                  else window.addEventListener('load', registerSW);
                }
              ` 
            }} 
          />
        </Providers>
      </body>
    </html>
  );
}

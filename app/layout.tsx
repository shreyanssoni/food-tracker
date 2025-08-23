import './globals.css';
import { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { auth } from '@/auth';
import { Providers } from './providers';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import ProfilePrompt from './components/ProfilePrompt';
import InstallPrompt from './components/InstallPrompt';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Nourish — AI Food & Mood Tracker',
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
    <html lang="en" className="h-full bg-gray-50 dark:bg-gray-900">
      <head>
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b1220" />
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
      <body className={`${inter.className} min-h-full flex flex-col text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900`}>
        {/* Fixed background layer to avoid any white areas behind content (SSR/PWA) */}
        <div className="fixed inset-0 -z-10 bg-gray-50 dark:bg-gray-900" aria-hidden />
        <Providers session={session}>
          <Navbar />
          <main className="flex-1 pb-20 md:pb-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </div>
          </main>
          <BottomNav />
          {/* Profile prompt modal */}
          <ProfilePrompt />
          {/* PWA install prompt */}
          <InstallPrompt />
          <footer className="hidden md:block bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 mt-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                &copy; {new Date().getFullYear()} Nourish. All rights reserved.
              </p>
              <p className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
                Made with ❤️ — by Shreyans. Be Kind to Yourself.
              </p>
            </div>
          </footer>
          <script 
            dangerouslySetInnerHTML={{ 
              __html: `
                if('serviceWorker' in navigator) {
                  window.addEventListener('load', () => {
                    navigator.serviceWorker.register('/sw.js')
                      .then(registration => {
                        console.log('ServiceWorker registration successful');
                      })
                      .catch(err => {
                        console.error('ServiceWorker registration failed: ', err);
                      });
                  });
                }
              ` 
            }} 
          />
        </Providers>
      </body>
    </html>
  );
}

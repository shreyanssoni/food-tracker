"use client";
import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { useRouter } from 'next/navigation';

export default function CapacitorDeepLinkHandler({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const sub = App.addListener('appUrlOpen', (data: { url: string }) => {
      try {
        const url = new URL(data.url);
        // We accept: nourishme://app/* and https://nourish-me.vercel.app/*
        const path = url.pathname || '/';
        const target = path + (url.search || '');
        (router as any).push(target);
      } catch {}
    });
    return () => { sub.then(s => s.remove()).catch(()=>{}); };
  }, [router]);

  return <>{children}</>;
}

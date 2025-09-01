"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Msg {
  id: string;
  title: string;
  body: string;
  url?: string | null;
  read_at?: string | null;
  created_at: string;
}

export default function NotificationsPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const router = useRouter();
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/notifications/messages?unread=1', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j.messages)) setMessages(j.messages);
      else setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const parseChallengeIdFromUrl = (url?: string | null): string | null => {
    if (!url) return null;
    try {
      const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://app.local');
      const q1 = u.searchParams.get('challenge');
      if (q1) return q1;
      const q2 = u.searchParams.get('challenge_id');
      if (q2) return q2;
      const m = u.pathname.match(/\/shadow\/challenges\/([0-9a-fA-F-]{6,})/);
      if (m && m[1]) return m[1];
    } catch {}
    return null;
  };

  const isValidUuid = (s: string | null | undefined) =>
    !!s && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(s);
  

  const markRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/messages/${id}/read`, { method: 'POST' });
      // Remove from list immediately since we only show unread here
      setMessages((prev) => prev.filter(m => m.id !== id));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('notifications:updated'));
      }
    } catch {}
  };

  const markAllRead = async () => {
    try {
      setMarkingAll(true);
      await fetch('/api/notifications/messages/read-all', { method: 'POST' });
      // Clear list since all are now read
      setMessages([]);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('notifications:updated'));
      }
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Notifications</h1>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={markAllRead}
            disabled={markingAll || loading || messages.length === 0}
            className="px-2.5 py-1 text-xs sm:text-sm rounded-full border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Mark all read
          </button>
          <button
            onClick={() => router.back()}
            className="px-2.5 py-1 text-xs sm:text-sm rounded-full border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Back
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-600 dark:text-gray-300">Loading...</div>
      ) : messages.length === 0 ? (
        <div className="rounded-2xl p-4 sm:p-6 border border-gray-200/70 dark:border-gray-800/70 bg-white/70 dark:bg-gray-900/70 shadow-sm">
          <div className="text-gray-700 dark:text-gray-200 font-medium">You're all caught up</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">No notifications yet.</div>
        </div>
      ) : (
        <div className="space-y-2.5 sm:space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={`rounded-2xl border shadow-sm backdrop-blur bg-white/90 dark:bg-gray-900/80 border-gray-200/70 dark:border-gray-800/70 p-3 sm:p-4 flex gap-2.5`}>
              <div className="mt-0.5 h-5 w-5 min-w-5 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white flex items-center justify-center">🔔</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] sm:text-sm font-semibold text-gray-900 dark:text-gray-100 truncate" title={m.title}>{m.title}</div>
                  <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</div>
                </div>
                <div className="mt-0.5 text-[12px] sm:text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{m.body}</div>
                <div className="mt-1.5 flex items-center gap-2.5 flex-wrap">
                  {m.url && (
                    <Link href={m.url as unknown as Route} className="text-blue-600 dark:text-blue-400 text-[12px] sm:text-sm font-medium underline hover:no-underline">View</Link>
                  )}
                  <button onClick={() => markRead(m.id)} className="text-[12px] sm:text-sm font-medium text-gray-700 dark:text-gray-300 hover:underline">Mark read</button>
                  {/* Inline Accept/Decline when a challenge id is encoded in URL */}
                  {(() => {
                    const chId = parseChallengeIdFromUrl(m.url);
                    if (!chId || !isValidUuid(chId)) return null;
                    const isPending = !!pending[m.id];
                    const doAction = async (action: 'accept' | 'decline') => {
                      try {
                        setPending((p) => ({ ...p, [m.id]: true }));
                        const res = await fetch(`/api/shadow/challenges/${chId}/${action}`, { method: 'POST' });
                        if (!res.ok) {
                          let msg = `${action} failed`;
                          try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
                          throw new Error(msg);
                        }
                        // Read the response once
                        let tid: string | undefined;
                        try { const j = await res.json(); tid = j?.user_task_id as string | undefined; } catch {}
                        await markRead(m.id);
                        if (action === 'accept') {
                          if (tid) router.push((`/tasks/${tid}`) as Route);
                          else router.push('/tasks' as Route);
                        }
                        toast.success(`Challenge ${action === 'accept' ? 'accepted' : 'declined'}`);
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new Event('notifications:updated'));
                        }
                      } catch (e: any) {
                        toast.error(e?.message || `Failed to ${action}`);
                      } finally {
                        setPending((p) => ({ ...p, [m.id]: false }));
                      }
                    };
                    return (
                      <>
                        <button
                          disabled={isPending}
                          onClick={() => doAction('accept')}
                          className="text-[12px] sm:text-sm font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 rounded-full px-2.5 py-0.5 hover:bg-emerald-50/50 disabled:opacity-50"
                        >
                          Accept
                        </button>
                        <button
                          disabled={isPending}
                          onClick={() => doAction('decline')}
                          className="text-[12px] sm:text-sm font-medium text-red-700 dark:text-red-300 border border-red-500/40 rounded-full px-2.5 py-0.5 hover:bg-red-50/50 disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

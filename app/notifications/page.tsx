"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
                <div className="mt-1.5 flex items-center gap-2.5">
                  {m.url && (
                    <Link href={m.url} className="text-blue-600 dark:text-blue-400 text-[12px] sm:text-sm font-medium underline hover:no-underline">View</Link>
                  )}
                  <button onClick={() => markRead(m.id)} className="text-[12px] sm:text-sm font-medium text-gray-700 dark:text-gray-300 hover:underline">Mark read</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

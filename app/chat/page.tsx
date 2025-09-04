/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { AvatarWithFallback } from "../../components/ui/avatar";

type Message = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

export default function ChatPage() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // who am I? needed for admin DELETE requiring user_id
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        setCurrentUserId(d?.user?.id || null);
        setIsAdmin(Boolean(d?.user?.is_sys_admin));
      })
      .catch(() => {
        setCurrentUserId(null);
        setIsAdmin(false);
      });

    fetch("/api/ai/coach")
      .then((r) => r.json())
      .then((data) => setMessages((data?.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      }))))
      .catch(() => {})
      .finally(() => setInitialLoading(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setInput("");
    const userMsg: Message = { role: "user", content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || data?.hint || (res.status === 429 ? "Rate limit reached. Try again in a bit." : "Failed to get coach reply.");
        throw new Error(msg);
      }
      const assistant = data?.message || { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistant]);
    } catch (e: any) {
      const msg = e?.message || "Something went wrong";
      setError(msg);
      setToast(msg);
      setTimeout(() => setToast(null), 2500);
    } finally {
      setLoading(false);
    }
  }

  async function clearHistory() {
    setError(null);
    try {
      if (!currentUserId) {
        throw new Error("Cannot clear: missing user context");
      }
      const url = `/api/ai/coach?user_id=${encodeURIComponent(currentUserId)}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || data?.hint || (res.status === 403 ? "Forbidden: admin required" : "Failed to clear");
        throw new Error(msg);
      }
      setMessages([]);
    } catch (e: any) {
      const msg = e?.message || "Failed to clear";
      setError(msg);
      setToast(msg);
      setTimeout(() => setToast(null), 2500);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-[max(5rem,env(safe-area-inset-bottom))]">
      {/* Toast */}
      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      <header className="sticky top-0 z-20 mb-3 pt-4 pb-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-100/70 dark:border-gray-800/70">
        <div className="flex items-center justify-between gap-3 px-px">
          <div>
            <h1 className="text-lg font-semibold leading-tight bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent">Coach</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Quick, practical guidance for meals, macros, and habits.</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
            <button
              onClick={clearHistory}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200/80 dark:border-gray-800/80 px-3 py-1.5 text-xs hover:bg-gray-100/70 dark:hover:bg-white/5"
              aria-label="Clear conversation"
              aria-busy={initialLoading || undefined}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12Zm13-15h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>
              Clear
            </button>
            )}
          </div>
        </div>
      </header>

      <section className="relative">
        <div
          className="space-y-3 pb-36"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {initialLoading && (
            <div className="space-y-3" aria-hidden>
              <SkeletonBubble />
              <SkeletonBubble align="right" />
              <SkeletonBubble />
            </div>
          )}
          {!initialLoading && messages.length === 0 && (
            <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
              Ask me anything about meals, macros, or recipes.
            </div>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} timestamp={m.created_at} session={session}>
              {m.content}
            </Bubble>
          ))}
          {loading && (
            <div className="flex gap-2 items-end text-sm text-gray-500 dark:text-gray-400">
              <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-blue-950 grid place-items-center text-blue-600 dark:text-blue-300">🤖</div>
              <div className="px-3 py-2 rounded-2xl bg-white/70 dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-800/60 backdrop-blur">
                typing…
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-4 z-50">
          <div className="mx-auto max-w-3xl px-4">
            <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white/80 dark:bg-gray-900/70 backdrop-blur shadow-sm p-2 flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Message coach…"
                aria-label="Message coach"
                className="flex-1 resize-none bg-transparent outline-none p-2 leading-6 text-sm max-h-36"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-tr from-blue-600 to-emerald-500 text-white text-sm font-medium px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[.99] shadow"
                aria-busy={loading || undefined}
                aria-live="polite"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                Send
              </button>
            </div>
            {error && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Bubble({ role, timestamp, children, session }: { role: "user" | "assistant"; timestamp?: string; children: any; session: any }) {
  const isUser = role === "user";
  const ts = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;
  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'} items-end fade-in-up`}>
      {!isUser && (
        <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-blue-950 grid place-items-center text-blue-600 dark:text-blue-300">🤖</div>
      )}
      <div className={`max-w-[82%] md:max-w-[70%] px-3 py-2 rounded-2xl text-sm ${isUser ? 'bg-gradient-to-tr from-blue-600 to-emerald-500 text-white shadow rounded-br-sm' : 'bg-white/80 dark:bg-gray-900/70 text-gray-900 dark:text-gray-50 rounded-bl-sm border border-gray-200/70 dark:border-gray-800/70 backdrop-blur'}`}>
        <p className="whitespace-pre-wrap">{children}</p>
        {ts && <span className={`mt-1 block text-[10px] opacity-75 ${isUser ? 'text-blue-100' : 'text-gray-400'}`}>{ts}</span>}
      </div>
      {isUser && (
        <AvatarWithFallback
          src={session?.user?.image}
          name={session?.user?.name}
          size="sm"
        />
      )}
    </div>
  );
}

function SkeletonBubble({ align = 'left' }: { align?: 'left' | 'right' }) {
  const isRight = align === 'right';
  return (
    <div className={`flex gap-2 items-end ${isRight ? 'justify-end' : 'justify-start'}`}>
      {!isRight && <div className="h-8 w-8 skeleton-circle" />}
      <div className="space-y-2">
        <div className="h-6 w-56 max-w-[70vw] skeleton" />
        <div className="h-3 w-16 skeleton" />
      </div>
      {isRight && <div className="h-8 w-8 skeleton-circle" />}
    </div>
  );
}

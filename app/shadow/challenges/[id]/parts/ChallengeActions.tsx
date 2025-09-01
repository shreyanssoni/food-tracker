"use client";

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { toast } from 'sonner';

export default function ChallengeActions({ challengeId, disabled }: { challengeId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const validId = useMemo(() => {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(challengeId);
  }, [challengeId]);

  const act = async (action: 'accept' | 'decline') => {
    if (pending || disabled || !validId) return;
    try {
      setPending(true);
      const res = await fetch(`/api/shadow/challenges/${challengeId}/${action}`, { method: 'POST' });
      if (!res.ok) {
        let msg = `${action} failed`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      let tid: string | undefined;
      try { const j = await res.json(); tid = j?.user_task_id as string | undefined; } catch {}
      if (action === 'accept') {
        if (tid) router.push((`/tasks/${tid}`) as Route);
        else router.push('/tasks' as Route);
      } else {
        // Decline → go back to tasks list
        router.push('/tasks' as Route);
      }
      toast.success(`Challenge ${action === 'accept' ? 'accepted' : 'declined'}`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('notifications:updated'));
      }
    } catch (e: any) {
      toast.error(e?.message || `Failed to ${action}`);
    } finally {
      setPending(false);
    }
  };

  const common = `px-3 py-1.5 text-sm rounded-full border disabled:opacity-60 disabled:cursor-not-allowed`;

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending || disabled || !validId}
        onClick={() => act('accept')}
        className={`${common} border-emerald-600/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50/50`}
      >
        {pending ? 'Working…' : 'Accept'}
      </button>
      <button
        disabled={pending || disabled || !validId}
        onClick={() => act('decline')}
        className={`${common} border-red-600/40 text-red-700 dark:text-red-300 hover:bg-red-50/50`}
      >
        Decline
      </button>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Swords, Trophy, History, Eye } from 'lucide-react';

type ChallengeItem = {
  id: string;
  state: string;
  created_at: string;
  due_time: string | null;
  linked_user_task_id: string | null;
  linked_shadow_task_id: string | null;
  task_template?: { title?: string; description?: string } | null;
};

export default function ShadowPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hero, setHero] = useState<{ userEP: number; shadowEP: number } | null>(null);
  const [active, setActive] = useState<ChallengeItem[]>([]);
  const [history, setHistory] = useState<ChallengeItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // Setup state
  const [activated, setActivated] = useState<boolean>(false);
  const [showSetupModal, setShowSetupModal] = useState<boolean>(false);
  const [confirmHardWarning, setConfirmHardWarning] = useState<boolean>(false);
  const [prefs, setPrefs] = useState<{ difficulty: 'easy'|'medium'|'hard'; wake_time?: string; sleep_time?: string; focus_areas?: string }>(
    { difficulty: 'medium', wake_time: '', sleep_time: '', focus_areas: '' }
  );
  // Shadow daily challenge UI
  const [todayShadow, setTodayShadow] = useState<{ id: string; challenge_text: string; deadline: string; status: 'pending'|'won'|'lost'; ep_awarded?: number|null } | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        // Setup status first — keep modal open by default until confirmed activated
        try {
          const setupRes = await fetch('/api/shadow/setup', { cache: 'no-store' });
          if (setupRes.ok) {
            const setup = await setupRes.json();
            if (!cancelled) {
              setActivated(!!setup.activated);
              setShowSetupModal(!setup.activated);
              setHero({ userEP: setup.user_ep || 0, shadowEP: setup.shadow_ep || 0 });
            }
          } else {
            // Keep modal open on setup failure
            if (!cancelled) setShowSetupModal(true);
          }
        } catch {
          if (!cancelled) setShowSetupModal(true);
        }

        // Load classic challenges lists (do not override EP from setup)
        const [actRes, histRes] = await Promise.all([
          fetch('/api/shadow/challenges?view=active', { cache: 'no-store' }),
          fetch('/api/shadow/challenges?view=history', { cache: 'no-store' }),
        ]);
        if (!actRes.ok) throw new Error('active failed');
        if (!histRes.ok) throw new Error('history failed');
        const act = await actRes.json();
        const hist = await histRes.json();
        if (!cancelled) {
          setActive(act.challenges || []);
          setHistory(hist.challenges || []);
        }

        // Load today's shadow daily challenge
        try {
          const tRes = await fetch('/api/shadow/challenges/today', { cache: 'no-store' });
          if (tRes.ok) {
            const t = await tRes.json();
            if (!cancelled) setTodayShadow(t.challenge || null);
          }
        } catch {}
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Countdown timer for today's shadow challenge
  useEffect(() => {
    if (!todayShadow?.deadline) return;
    const tick = () => {
      const ms = new Date(todayShadow.deadline).getTime() - Date.now();
      setTimeLeft(ms);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [todayShadow?.deadline]);

  function fmt(ms: number) {
    if (ms <= 0) return 'Expired';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(ss)}`;
  }

  const epAtStake = Math.max(1, todayShadow?.ep_awarded ?? 10);

  const total = Math.max(1, (hero?.userEP || 0) + (hero?.shadowEP || 0));
  const userPct = Math.min(100, Math.max(0, Math.round(((hero?.userEP || 0) / total) * 100)));
  const shadowPct = 100 - userPct;

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-semibold flex items-center gap-2 mb-4"><Swords className="w-5 h-5 text-purple-600"/> Shadow</h1>

      {/* First-time Setup Modal */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-4">
            {!confirmHardWarning ? (
              <div className="space-y-3">
                <div className="text-lg font-semibold">Shadow is not for the weak.</div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  It’s scary, requires crazy discipline, and will push you. Are you sure?
                </p>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700"
                    onClick={() => { setShowSetupModal(false); router.push('/'); }}
                  >No, take me back</button>
                  <button
                    className="px-3 py-1.5 text-sm rounded-lg bg-purple-600 text-white"
                    onClick={() => setConfirmHardWarning(true)}
                  >Yes, continue setup</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-lg font-semibold">Shadow Setup</div>
                <div className="grid grid-cols-1 gap-3">
                  <label className="text-sm">
                    <div className="mb-1">Difficulty</div>
                    <select
                      value={prefs.difficulty}
                      onChange={(e)=> setPrefs(p=> ({...p, difficulty: e.target.value as any}))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <div className="mb-1">Wake time</div>
                    <input type="time" value={prefs.wake_time || ''} onChange={(e)=> setPrefs(p=> ({...p, wake_time: e.target.value}))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm" />
                  </label>
                  <label className="text-sm">
                    <div className="mb-1">Sleep time</div>
                    <input type="time" value={prefs.sleep_time || ''} onChange={(e)=> setPrefs(p=> ({...p, sleep_time: e.target.value}))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm" />
                  </label>
                  <label className="text-sm">
                    <div className="mb-1">Focus areas (comma separated)</div>
                    <input type="text" value={prefs.focus_areas || ''} onChange={(e)=> setPrefs(p=> ({...p, focus_areas: e.target.value}))}
                      placeholder="sleep, water, diet, fitness"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-sm" />
                  </label>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700"
                    onClick={() => { setShowSetupModal(false); router.push('/'); }}
                  >Cancel</button>
                  <button
                    className="px-3 py-1.5 text-sm rounded-lg bg-purple-600 text-white"
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/shadow/setup', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ preferences: prefs })
                        });
                        const j = await res.json();
                        if (!res.ok) throw new Error(j.error || 'Failed to setup');
                        setActivated(true);
                        setShowSetupModal(false);
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                  >Save & Activate</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="rounded-2xl border border-purple-200 dark:border-purple-900/40 bg-gradient-to-br from-gray-900 to-gray-950 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-gray-300"><span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-300 border border-blue-600/30">Your EP</span><span className="text-blue-300 font-medium">{hero?.userEP ?? '—'}</span></div>
          <div className="flex items-center gap-2 text-sm text-gray-300"><span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-600/20 text-purple-300 border border-purple-600/30">Shadow EP</span><span className="text-purple-300 font-medium">{hero?.shadowEP ?? '—'}</span></div>
        </div>
        <div className="h-3 w-full bg-gray-800 rounded-full overflow-hidden border border-gray-700">
          <div className="h-full bg-blue-600" style={{ width: `${userPct}%` }} />
        </div>
        <div className="mt-1 text-[10px] text-gray-500">You {userPct}% • Shadow {shadowPct}%</div>
      </section>

      {/* Today's Shadow Challenge */}
      {todayShadow && (
        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Today's Shadow Challenge</div>
            <div className="text-xs text-gray-500">Deadline: {new Date(todayShadow.deadline).toLocaleTimeString()}</div>
          </div>
          <div className="text-sm mb-2">{todayShadow.challenge_text}</div>
          <div className="flex items-center justify-between text-sm">
            <div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">EP at stake: +{epAtStake}</span>
            </div>
            <div className="font-mono text-gray-700 dark:text-gray-300">{fmt(timeLeft)}</div>
          </div>
          <div className="mt-3 flex items-center justify-end">
            <button
              className="px-3 py-1.5 text-sm rounded-lg bg-purple-600 text-white disabled:opacity-50"
              disabled={todayShadow.status !== 'pending' || timeLeft <= 0}
              onClick={async () => {
                try {
                  const res = await fetch(`/api/shadow/challenges/${todayShadow.id}/complete`, { method: 'POST' });
                  const j = await res.json().catch(()=>({}));
                  if (!res.ok) throw new Error(j.error || 'Failed to settle');
                  // refresh EP and today shadow challenge
                  try {
                    const setupRes = await fetch('/api/shadow/setup', { cache: 'no-store' });
                    if (setupRes.ok) {
                      const setup = await setupRes.json();
                      setHero({ userEP: setup.user_ep || 0, shadowEP: setup.shadow_ep || 0 });
                    }
                  } catch {}
                  try {
                    const tRes = await fetch('/api/shadow/challenges/today', { cache: 'no-store' });
                    if (tRes.ok) {
                      const t = await tRes.json();
                      setTodayShadow(t.challenge || null);
                    }
                  } catch {}
                } catch (e) {
                  console.error(e);
                }
              }}
            >Complete</button>
          </div>
        </section>
      )}

      {/* Active Challenges */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 mb-4">
        <div className="px-4 py-3 flex items-center gap-2 font-semibold"><Trophy className="w-4 h-4"/> Active Challenges</div>
        {loading ? (
          <div className="px-4 pb-4 text-sm text-gray-500">Loading…</div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-900">
            {active.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="font-medium">{c.task_template?.title || 'Challenge'}</div>
                  <div className="text-gray-500 dark:text-gray-400">{c.state}</div>
                  <div className="text-gray-500 dark:text-gray-400">Due: {c.due_time ? new Date(c.due_time).toLocaleString() : '—'}</div>
                </div>
                <div className="text-xs text-gray-500">{new Date(c.created_at).toLocaleString()}</div>
              </li>
            ))}
            {!active.length && <li className="px-4 py-3 text-sm text-gray-500">No active challenges</li>}
          </ul>
        )}
      </section>

      {/* History */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 mb-4">
        <div className="px-4 py-3 flex items-center gap-2 font-semibold"><History className="w-4 h-4"/> History</div>
        {loading ? (
          <div className="px-4 pb-4 text-sm text-gray-500">Loading…</div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-900">
            {history.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="font-medium">{c.task_template?.title || 'Challenge'}</div>
                  <div className="text-gray-500 dark:text-gray-400">{c.state}</div>
                  <div className="text-gray-500 dark:text-gray-400">Ended: {c.due_time ? new Date(c.due_time).toLocaleString() : '—'}</div>
                </div>
                <div className="text-xs text-gray-500">{new Date(c.created_at).toLocaleString()}</div>
              </li>
            ))}
            {!history.length && <li className="px-4 py-3 text-sm text-gray-500">No past challenges</li>}
          </ul>
        )}
      </section>

      {/* Transparency (optional) */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="px-4 py-3 flex items-center gap-2 font-semibold"><Eye className="w-4 h-4"/> Transparency</div>
        <div className="px-4 pb-4 text-sm text-gray-500">Shadow-only tasks will be shown here in a future iteration.</div>
      </section>

      {err && <div className="mt-4 text-sm text-red-600">{err}</div>}
    </div>
  );
}

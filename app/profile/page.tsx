'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

type Activity = 'sedentary' | 'light' | 'moderate' | 'very' | 'super';
type Goal = 'maintain' | 'lose' | 'gain';

interface Profile {
  height_cm: number | null;
  weight_kg: number | null;
  age: number | null;
  gender: 'male' | 'female' | 'other' | null;
  activity_level: Activity | null;
  goal: Goal | null;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    height_cm: null,
    weight_kg: null,
    age: null,
    gender: null,
    activity_level: 'sedentary',
    goal: 'maintain',
  });

  useEffect(() => {
    const load = async () => {
      if (status === 'authenticated') {
        try {
          const r = await fetch('/api/preferences');
          if (!r.ok) throw new Error('Failed to load profile');
          const d = await r.json();
          const p = d?.profile || {};
          setProfile({
            height_cm: p.height_cm ?? null,
            weight_kg: p.weight_kg ?? null,
            age: p.age ?? null,
            gender: p.gender ?? null,
            activity_level: p.activity_level ?? 'sedentary',
            goal: p.goal ?? 'maintain',
          });
        } catch (e: any) {
          setError(e?.message || 'Error');
        } finally {
          setLoading(false);
        }
      } else if (status === 'unauthenticated') {
        setLoading(false);
      }
    };
    load();
  }, [status]);

  const onSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          height_cm: profile.height_cm,
          weight_kg: profile.weight_kg,
          age: profile.age,
          gender: profile.gender,
          activity_level: profile.activity_level,
          goal: profile.goal,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setEditing(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-[50vh] grid place-items-center text-center">
        <div>
          <h2 className="text-xl font-semibold mb-2">Please sign in to view your profile</h2>
          <a href="/auth/signin" className="px-4 py-2 rounded-md bg-blue-600 text-white">Sign in</a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Your Profile</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Manage your body metrics used to compute targets.</p>
        </div>
        {!editing ? (
          <button className="px-3 py-1.5 rounded-md bg-gray-900 text-white" onClick={() => setEditing(true)}>Edit</button>
        ) : (
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-md border" onClick={() => setEditing(false)}>Cancel</button>
            <button className="px-3 py-1.5 rounded-md bg-emerald-600 text-white" onClick={onSave} disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
          </div>
        )}
      </div>

      {error && <div className="text-sm text-red-500">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Height */}
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
          <label className="text-xs uppercase tracking-wide text-gray-500">Height</label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">{profile.height_cm ?? '—'} cm</div>
          ) : (
            <input type="number" className="mt-1 input w-full" value={profile.height_cm ?? ''} onChange={(e)=>setProfile({...profile, height_cm: e.target.value ? Number(e.target.value) : null})} placeholder="cm" />
          )}
        </div>

        {/* Weight */}
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
          <label className="text-xs uppercase tracking-wide text-gray-500">Weight</label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">{profile.weight_kg ?? '—'} kg</div>
          ) : (
            <input type="number" className="mt-1 input w-full" value={profile.weight_kg ?? ''} onChange={(e)=>setProfile({...profile, weight_kg: e.target.value ? Number(e.target.value) : null})} placeholder="kg" />
          )}
        </div>

        {/* Age */}
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
          <label className="text-xs uppercase tracking-wide text-gray-500">Age</label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">{profile.age ?? '—'}</div>
          ) : (
            <input type="number" className="mt-1 input w-full" value={profile.age ?? ''} onChange={(e)=>setProfile({...profile, age: e.target.value ? Number(e.target.value) : null})} placeholder="years" />
          )}
        </div>

        {/* Gender */}
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
          <label className="text-xs uppercase tracking-wide text-gray-500">Gender</label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">{profile.gender ?? '—'}</div>
          ) : (
            <select className="mt-1 input w-full" value={profile.gender ?? 'male'} onChange={(e)=>setProfile({...profile, gender: e.target.value as any})}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          )}
        </div>

        {/* Activity */}
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
          <label className="text-xs uppercase tracking-wide text-gray-500">Activity level</label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">{profile.activity_level}</div>
          ) : (
            <select className="mt-1 input w-full" value={profile.activity_level ?? 'sedentary'} onChange={(e)=>setProfile({...profile, activity_level: e.target.value as Activity})}>
              <option value="sedentary">Sedentary</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="very">Very</option>
              <option value="super">Super</option>
            </select>
          )}
        </div>

        {/* Goal */}
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
          <label className="text-xs uppercase tracking-wide text-gray-500">Goal</label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">{profile.goal}</div>
          ) : (
            <select className="mt-1 input w-full" value={profile.goal ?? 'maintain'} onChange={(e)=>setProfile({...profile, goal: e.target.value as Goal})}>
              <option value="maintain">Maintain</option>
              <option value="lose">Lose</option>
              <option value="gain">Gain</option>
            </select>
          )}
        </div>
      </div>
    </div>
  );
}

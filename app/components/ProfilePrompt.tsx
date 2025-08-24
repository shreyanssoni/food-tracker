"use client";
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

type Activity = 'sedentary' | 'light' | 'moderate' | 'very' | 'super';
type Goal = 'maintain' | 'lose' | 'gain';

type FormState = {
  height_cm: string;
  weight_kg: string;
  age: string;
  gender: 'male' | 'female' | 'other';
  activity_level: Activity;
  goal: Goal;
  workout_level: 'beginner' | 'intermediate' | 'advanced' | 'pro';
};

export default function ProfilePrompt() {
  const { data: session } = useSession();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [form, setForm] = useState<FormState>({
    height_cm: '',
    weight_kg: '',
    age: '',
    gender: 'male',
    activity_level: 'sedentary',
    goal: 'maintain',
    workout_level: 'beginner',
  });

  useEffect(() => {
    if (!session?.user || completed) return;
    // Fetch existing profile
    fetch('/api/preferences')
      .then((r) => r.json())
      .then((d) => {
        const p = d?.profile;
        // Decide visibility based on essential fields to avoid false negatives from computeTargets
        const hasBasics = !!(p?.height_cm && p?.weight_kg);
        const hasWorkout = !!p?.workout_level;
        // Show only if any essential field is missing
        setShow(!(hasBasics && hasWorkout));
        if (p) {
          setForm((prev) => ({
            ...prev,
            height_cm: p.height_cm ? String(p.height_cm) : prev.height_cm,
            weight_kg: p.weight_kg ? String(p.weight_kg) : prev.weight_kg,
            age: p.age ? String(p.age) : prev.age,
            gender: p.gender || prev.gender,
            activity_level: p.activity_level || prev.activity_level,
            goal: p.goal || prev.goal,
            workout_level: p.workout_level || prev.workout_level,
          }));
        }
      })
      .catch(() => {});
  }, [session, completed]);

  if (!session?.user) return null;
  if (!show) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          height_cm: Number(form.height_cm) || null,
          weight_kg: Number(form.weight_kg) || null,
          age: Number(form.age) || null,
          gender: form.gender,
          activity_level: form.activity_level,
          goal: form.goal,
          workout_level: form.workout_level,
        }),
      });
      if (res.ok) {
        setCompleted(true);
        setShow(false);
      } else {
        let msg = 'Failed to save';
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {}
        setError(`${msg} (status ${res.status})`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 p-5 shadow-lg">
        <h2 className="text-lg font-semibold">Tell us about you</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">We use this to personalize your daily calorie and macro targets.</p>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Height (cm)
              <input className="mt-1 w-full border border-gray-200 dark:border-gray-800 rounded-md px-2 py-1 bg-white dark:bg-gray-900" value={form.height_cm} onChange={(e)=>setForm({...form, height_cm: e.target.value})} required />
            </label>
            <label className="text-sm">Weight (kg)
              <input className="mt-1 w-full border border-gray-200 dark:border-gray-800 rounded-md px-2 py-1 bg-white dark:bg-gray-900" value={form.weight_kg} onChange={(e)=>setForm({...form, weight_kg: e.target.value})} required />
            </label>
            <label className="text-sm">Age
              <input className="mt-1 w-full border border-gray-200 dark:border-gray-800 rounded-md px-2 py-1 bg-white dark:bg-gray-900" value={form.age} onChange={(e)=>setForm({...form, age: e.target.value})} required />
            </label>
            <label className="text-sm">Gender
              <select className="mt-1 w-full border border-gray-200 dark:border-gray-800 rounded-md px-2 py-1 bg-white dark:bg-gray-900" value={form.gender} onChange={(e)=>setForm({...form, gender: e.target.value as any})}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-sm">Activity
              <select className="mt-1 w-full border border-gray-200 dark:border-gray-800 rounded-md px-2 py-1 bg-white dark:bg-gray-900" value={form.activity_level} onChange={(e)=>setForm({...form, activity_level: e.target.value as any})}>
                <option value="sedentary">Sedentary</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="very">Very active</option>
                <option value="super">Super active</option>
              </select>
            </label>
            <label className="text-sm">Goal
              <select className="mt-1 w-full border border-gray-200 dark:border-gray-800 rounded-md px-2 py-1 bg-white dark:bg-gray-900" value={form.goal} onChange={(e)=>setForm({...form, goal: e.target.value as any})}>
                <option value="maintain">Maintain</option>
                <option value="lose">Lose</option>
                <option value="gain">Gain</option>
              </select>
            </label>
            <label className="text-sm">Workout intensity
              <select className="mt-1 w-full border border-gray-200 dark:border-gray-800 rounded-md px-2 py-1 bg-white dark:bg-gray-900" value={form.workout_level} onChange={(e)=>setForm({...form, workout_level: e.target.value as any})}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="pro">Pro</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            {error && (
              <div className="mr-auto text-xs text-red-600 dark:text-red-400">{error}</div>
            )}
            <button type="submit" disabled={loading} className="px-3 py-1 rounded-md bg-emerald-600 text-white disabled:opacity-60">{loading ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

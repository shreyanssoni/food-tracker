"use client";

import { useEffect, useRef, useState } from 'react';

type Intensity = 'beginner' | 'intermediate' | 'advanced' | 'pro';

type FormState = {
  type: 'home' | 'gym';
  duration_min: number;
  muscles: string[];
  intensity: Intensity;
  instructions?: string;
};

const MUSCLE_OPTIONS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
];

export default function WorkoutsPage() {
  const [form, setForm] = useState<FormState>({
    type: 'gym',
    duration_min: 45,
    muscles: [],
    intensity: 'beginner',
    instructions: '',
  });
  const [loading, setLoading] = useState(false);
  const [planHtml, setPlanHtml] = useState<string>("");
  const [error, setError] = useState<string>("");
  const planRef = useRef<HTMLDivElement | null>(null);

  // Pull default intensity from preferences (workout_level) if present
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/preferences');
        const d = await r.json();
        const level = d?.profile?.workout_level as Intensity | undefined;
        if (!cancelled && level && ['beginner','intermediate','advanced','pro'].includes(level)) {
          setForm((prev) => ({ ...prev, intensity: level }));
        }
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Minimal sanitizer: remove <script|style> tags and inline event handlers
  const sanitize = (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    // remove scripts and styles
    div.querySelectorAll('script, style').forEach((el) => el.remove());
    // strip on* handlers
    div.querySelectorAll('*').forEach((el) => {
      [...(el as HTMLElement).attributes].forEach((attr) => {
        if (/^on/i.test(attr.name)) (el as HTMLElement).removeAttribute(attr.name);
      });
    });
    return div.innerHTML;
  };

  const toggleMuscle = (m: string) => {
    setForm((prev) => ({
      ...prev,
      muscles: prev.muscles.includes(m)
        ? prev.muscles.filter((x) => x !== m)
        : [...prev.muscles, m],
    }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setPlanHtml("");
    try {
      const res = await fetch('/api/ai/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to generate');
      const html = String(data.plan_html || '');
      setPlanHtml(html);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate workout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold mb-4">Get Workouts</h1>
      <form onSubmit={onSubmit} className="grid gap-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="text-sm">
            Type
            <select
              className="mt-1 w-full border border-gray-200 dark:border-gray-800 rounded-md px-2 py-2 bg-white dark:bg-gray-900"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as any })}
            >
              <option value="home">Home</option>
              <option value="gym">Gym</option>
            </select>
          </label>
          <label className="text-sm">
            Duration (min)
            <input
              type="number"
              min={15}
              max={120}
              className="mt-1 w-full border border-gray-200 dark:border-gray-800 rounded-md px-2 py-2 bg-white dark:bg-gray-900"
              value={form.duration_min}
              onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value || 0) })}
            />
          </label>
          <label className="text-sm">
            Intensity
            <select
              className="mt-1 w-full border border-gray-200 dark:border-gray-800 rounded-md px-2 py-2 bg-white dark:bg-gray-900"
              value={form.intensity}
              onChange={(e) => setForm({ ...form, intensity: e.target.value as Intensity })}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="pro">Pro</option>
            </select>
          </label>
        </div>
        <div>
          <div className="text-sm mb-2">Muscles to train (optional)</div>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_OPTIONS.map((m) => {
              const active = form.muscles.includes(m);
              return (
                <button
                  type="button"
                  key={m}
                  onClick={() => toggleMuscle(m)}
                  className={`px-3 py-1 rounded-full text-sm border ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
        <label className="text-sm">
          Instructions (optional, high priority)
          <textarea
            rows={4}
            placeholder="e.g., Focus on posterior chain; avoid overhead pressing; include a heavy top set then backoffs; keep under 40 minutes."
            className="mt-1 w-full border border-gray-200 dark:border-gray-800 rounded-md px-3 py-2 bg-white dark:bg-gray-900"
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
        </label>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-md bg-blue-600 text-white disabled:opacity-60"
          >
            {loading ? 'Generating…' : 'Generate plan'}
          </button>
          {error && <div className="text-red-600 text-sm self-center">{error}</div>}
        </div>
      </form>

      {planHtml && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const root = planRef.current;
                if (!root) return;
                root.querySelectorAll('details').forEach((d) => { (d as HTMLDetailsElement).open = true; });
              }}
              className="px-3 py-1 rounded-md border border-gray-300 dark:border-gray-700"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => {
                const root = planRef.current;
                if (!root) return;
                root.querySelectorAll('details').forEach((d) => { (d as HTMLDetailsElement).open = false; });
              }}
              className="px-3 py-1 rounded-md border border-gray-300 dark:border-gray-700"
            >
              Collapse all
            </button>
          </div>
          <div
            ref={planRef}
            className="max-w-none border border-gray-200 dark:border-gray-800 rounded-lg p-4"
            dangerouslySetInnerHTML={{ __html: sanitize(planHtml) }}
          />
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from 'react';
import MultiSelect, { type MultiSelectOption } from "../components/MultiSelect";

type Intensity = 'beginner' | 'intermediate' | 'advanced' | 'pro';

type FormState = {
  type: 'home' | 'gym';
  duration_min: number;
  muscles: string[];
  intensity: Intensity;
  instructions?: string;
};

const MUSCLE_OPTIONS = [
  // Upper body — push
  'chest-upper',
  'chest-mid',
  'chest-lower',
  'anterior-delts',
  'medial-delts',
  'posterior-delts',
  'triceps-long-head',
  'triceps-lateral-head',
  'triceps-medial-head',
  // Upper body — pull
  'lats',
  'upper-back',
  'mid-back',
  'lower-back',
  'traps-upper',
  'traps-mid',
  'traps-lower',
  'biceps-long-head',
  'biceps-short-head',
  'forearms',
  // Lower body
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'abductors',
  'calves-gastrocnemius',
  'calves-soleus',
  // Core
  'abs-rectus',
  'obliques',
  'erectors',
];

const MUSCLE_OPTIONS_GROUPED: MultiSelectOption[] = [
  { value: 'chest-upper', label: 'Upper Chest', group: 'Upper — Push' },
  { value: 'chest-mid', label: 'Mid Chest', group: 'Upper — Push' },
  { value: 'chest-lower', label: 'Lower Chest', group: 'Upper — Push' },
  { value: 'anterior-delts', label: 'Front Delts', group: 'Upper — Push' },
  { value: 'medial-delts', label: 'Side Delts', group: 'Upper — Push' },
  { value: 'posterior-delts', label: 'Rear Delts', group: 'Upper — Push' },
  { value: 'triceps-long-head', label: 'Triceps (Long Head)', group: 'Upper — Push' },
  { value: 'triceps-lateral-head', label: 'Triceps (Lateral Head)', group: 'Upper — Push' },
  { value: 'triceps-medial-head', label: 'Triceps (Medial Head)', group: 'Upper — Push' },
  { value: 'lats', label: 'Lats', group: 'Upper — Pull' },
  { value: 'upper-back', label: 'Upper Back', group: 'Upper — Pull' },
  { value: 'mid-back', label: 'Mid Back', group: 'Upper — Pull' },
  { value: 'lower-back', label: 'Lower Back', group: 'Upper — Pull' },
  { value: 'traps-upper', label: 'Traps (Upper)', group: 'Upper — Pull' },
  { value: 'traps-mid', label: 'Traps (Mid)', group: 'Upper — Pull' },
  { value: 'traps-lower', label: 'Traps (Lower)', group: 'Upper — Pull' },
  { value: 'biceps-long-head', label: 'Biceps (Long Head)', group: 'Upper — Pull' },
  { value: 'biceps-short-head', label: 'Biceps (Short Head)', group: 'Upper — Pull' },
  { value: 'forearms', label: 'Forearms', group: 'Upper — Pull' },
  { value: 'glutes', label: 'Glutes', group: 'Lower Body' },
  { value: 'quads', label: 'Quads', group: 'Lower Body' },
  { value: 'hamstrings', label: 'Hamstrings', group: 'Lower Body' },
  { value: 'adductors', label: 'Adductors', group: 'Lower Body' },
  { value: 'abductors', label: 'Abductors', group: 'Lower Body' },
  { value: 'calves-gastrocnemius', label: 'Calves (Gastrocnemius)', group: 'Lower Body' },
  { value: 'calves-soleus', label: 'Calves (Soleus)', group: 'Lower Body' },
  { value: 'abs-rectus', label: 'Abs (Rectus)', group: 'Core' },
  { value: 'obliques', label: 'Obliques', group: 'Core' },
  { value: 'erectors', label: 'Spinal Erectors', group: 'Core' },
];

export default function WorkoutsPage() {
  const [form, setForm] = useState<FormState>({
    type: 'gym',
    duration_min: 60,
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

  // muscles selection handled by MultiSelect

  const adjustDuration = (delta: number) => {
    setForm((prev) => ({
      ...prev,
      duration_min: Math.min(120, Math.max(15, prev.duration_min + delta)),
    }));
  };

  const [changeText, setChangeText] = useState('');
  const requestChanges = async () => {
    if (!planHtml || !changeText.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_plan_html: planHtml,
          change_request: changeText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update');
      setPlanHtml(String(data.plan_html || ''));
      setChangeText('');
    } catch (e: any) {
      setError(e?.message || 'Failed to update plan');
    } finally {
      setLoading(false);
    }
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
          <div className="text-sm">
            Duration (min)
            <div className="mt-1 flex items-center gap-2">
              <button type="button" onClick={() => adjustDuration(-5)} className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-700">-</button>
              <input
                type="range"
                min={15}
                max={120}
                step={5}
                value={form.duration_min}
                onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) })}
                className="flex-1"
              />
              <button type="button" onClick={() => adjustDuration(5)} className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-700">+</button>
              <span className="w-10 text-right text-sm">{form.duration_min}</span>
            </div>
          </div>
          <div className="text-sm">
            Intensity
            <div className="mt-1 flex flex-wrap gap-2">
              {(['beginner','intermediate','advanced','pro'] as Intensity[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setForm({ ...form, intensity: lvl })}
                  className={`px-3 py-1 rounded-full text-sm border ${form.intensity===lvl ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700'}`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="text-sm">
          <div className="mb-1">Muscles to train (optional)</div>
          <MultiSelect
            options={MUSCLE_OPTIONS_GROUPED}
            value={form.muscles}
            onChange={(next) => setForm((p) => ({ ...p, muscles: next }))}
            placeholder="Select body parts…"
            searchPlaceholder="Search muscles or groups…"
            clearText="Clear"
            className="w-full"
            groupsOrder={["Upper — Push","Upper — Pull","Lower Body","Core","Other"]}
          />
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
          <div className="grid gap-2">
            <label className="text-sm">Request changes to this plan</label>
            <textarea
              rows={3}
              placeholder="e.g., I don't have a lat pulldown machine; please swap with a suitable alternative."
              className="w-full border border-gray-200 dark:border-gray-800 rounded-md px-3 py-2 bg-white dark:bg-gray-900"
              value={changeText}
              onChange={(e)=>setChangeText(e.target.value)}
            />
            <div>
              <button type="button" disabled={loading || !changeText.trim()} onClick={requestChanges} className="px-4 py-2 rounded-md bg-emerald-600 text-white disabled:opacity-60">{loading ? 'Updating…' : 'Send request'}</button>
            </div>
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

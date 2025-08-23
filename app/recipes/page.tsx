'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function RecipePage() {
  const params = useSearchParams();
  const router = useRouter();
  const name = (params?.get?.('name') as string | null) ?? '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<null | {
    title: string;
    servings: number;
    cook_time_minutes: number;
    difficulty: 'easy' | 'medium' | string;
    ingredients: Array<{ item: string; amount: string }>;
    steps: string[];
    why?: string;
    notes?: string;
  }>(null);

  useEffect(() => {
    async function load() {
      if (!name) {
        setError('No meal selected.');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const prefRes = await fetch('/api/preferences');
        const preferences = prefRes.ok ? await prefRes.json() : {};
        const invRes = await fetch('/api/groceries');
        const inventory = invRes.ok ? await invRes.json() : [];

        const hours = new Date().getHours();
        const timeOfDay = hours < 12 ? 'morning' : hours < 17 ? 'afternoon' : 'evening';

        const resp = await fetch('/api/ai/recipe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mealName: name,
            preferences,
            inventory,
            targets: preferences?.targets || null,
            timeOfDay,
          }),
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data?.error || 'Failed to generate recipe');
        }
        const data = await resp.json();
        setRecipe(data);
      } catch (e: any) {
        setError(e?.message || 'Failed to load recipe');
        setToast(e?.message || 'Failed to load recipe');
        setTimeout(() => setToast(null), 2500);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [name]);

  return (
    <div className="space-y-6">
      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800">← Back</button>
        <h1 className="text-xl font-semibold">{name || 'Recipe'}</h1>
      </div>

      {loading && (
        <div className="bg-white rounded-xl shadow-soft p-6" aria-hidden>
          <div className="skeleton-line w-1/3 mb-4" />
          <div className="skeleton-line w-2/3 mb-2" />
          <div className="skeleton-line w-1/2" />
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 my-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {recipe && (
        <div className="bg-white rounded-xl shadow-soft p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{recipe.title}</h2>
            <p className="text-sm text-gray-500">Servings: {recipe.servings} · Cook time: {recipe.cook_time_minutes} min · Difficulty: {recipe.difficulty}</p>
          </div>

          {recipe.why && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 text-sm text-blue-900 dark:text-blue-200">
              {recipe.why}
            </div>
          )}

          <div>
            <h3 className="font-medium mb-2">Ingredients</h3>
            <ul className="list-disc pl-6 text-sm space-y-1">
              {recipe.ingredients?.map((ing, i) => (
                <li key={i}>
                  <span className="font-medium">{ing.item}</span>{' '}
                  <span className="text-gray-600">{ing.amount}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-medium mb-2">Steps</h3>
            <ol className="list-decimal pl-6 text-sm space-y-2">
              {recipe.steps?.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>

          {recipe.notes && (
            <div className="text-sm text-gray-700 dark:text-gray-200">
              <h3 className="font-medium mb-1">Notes</h3>
              <p>{recipe.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";
import { useState } from 'react';
import { format } from 'date-fns';
import type { FoodLog } from '@/types';
import { createClient as createBrowserClient } from '@/utils/supabase/client';
import { getMealType } from '@/utils/food';

export function LogCard({
  log,
  onDelete,
  onUpdate,
}: {
  log: FoodLog;
  onDelete?: (id: string) => void;
  onUpdate?: (log: FoodLog) => void;
}) {
  const supabase = createBrowserClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const mealTitle = Array.isArray(log.items)
    ? log.items.map((i: { name: string }) => i.name).join(', ')
    : 'Meal';
  const [form, setForm] = useState({
    itemsTitle: mealTitle,
    calories: String(Number(log.calories) || 0),
    protein_g: String(Number(log.protein_g) || 0),
    carbs_g: String(Number(log.carbs_g) || 0),
    fat_g: String(Number(log.fat_g) || 0),
    note: String((log as any).note || ''),
  });

  const save = async () => {
    setSaving(true);
    try {
      // Convert itemsTitle back into items array. Split by comma or newline.
      const rawTokens = (form.itemsTitle || '').split(/[\n,]+/).map((t) => t.trim()).filter(Boolean);
      const items = (rawTokens.length > 0
        ? rawTokens.map((t) => ({ name: t, quantity: null as number | null }))
        : [{ name: '-', quantity: null as number | null }]) as { name: string; quantity: number | null }[];

      const payload = {
        items,
        calories: Number(form.calories) || 0,
        protein_g: Number(form.protein_g) || 0,
        carbs_g: Number(form.carbs_g) || 0,
        fat_g: Number(form.fat_g) || 0,
        note: form.note,
      } as const;
      const { data, error } = await supabase
        .from('food_logs')
        .update(payload)
        .eq('id', log.id)
        .select()
        .single();
      if (error) throw error;
      onUpdate?.(data as FoodLog);
      setEditing(false);
    } catch (e) {
      // TODO: toast from parent if desired
      console.error('Update failed', e);
    } finally {
      setSaving(false);
    }
  };

  const mealType = getMealType(log.eaten_at);

  return (
    <div className="bg-white/80 dark:bg-gray-950/70 backdrop-blur border border-gray-200/70 dark:border-gray-800/70 shadow-sm rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{mealTitle}</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 border border-gray-200/70 dark:border-gray-800/70">
              {mealType}
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-500">{format(new Date(log.eaten_at), 'PPp')}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onDelete ? (
            <button
              onClick={() => onDelete(log.id)}
              className="text-[11px] text-red-600 border border-red-200 rounded-md px-2 py-1 hover:bg-red-50"
              aria-label="Delete log"
            >
              Delete
            </button>
          ) : null}
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              Edit
            </button>
          ) : null}
        </div>
      </div>

      {!editing ? (
        <div className="mt-2 text-sm text-gray-700 dark:text-gray-200">
          <p>
            {Math.round(Number(log.calories))} kcal • P {Math.round(Number(log.protein_g))}g • C {Math.round(Number(log.carbs_g))}g • F {Math.round(Number(log.fat_g))}g
          </p>
          {log.note ? <p className="text-gray-600 dark:text-gray-300 mt-1">“{log.note}”</p> : null}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] text-gray-500">Food name(s)</label>
            <input
              type="text"
              value={form.itemsTitle}
              onChange={(e) => setForm((f) => ({ ...f, itemsTitle: e.target.value }))}
              className="w-full rounded-md border border-gray-200/70 dark:border-gray-800/70 bg-white/80 dark:bg-gray-900/70 px-2 py-1 text-sm"
              placeholder="e.g., Onion Salad, Grilled Chicken"
            />
            <p className="text-[10px] text-gray-500">Separate multiple items with commas</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['calories','protein_g','carbs_g','fat_g'] as const).map((k) => (
              <div key={k} className="space-y-1">
                <label className="text-[11px] text-gray-500 capitalize">{k.replace('_g','')}</label>
                <input
                  type="number"
                  step="any"
                  value={(form as any)[k]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  className="w-full rounded-md border border-gray-200/70 dark:border-gray-800/70 bg-white/80 dark:bg-gray-900/70 px-2 py-1 text-sm"
                />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-gray-500">note</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="w-full rounded-md border border-gray-200/70 dark:border-gray-800/70 bg-white/80 dark:bg-gray-900/70 px-2 py-1 text-sm"
              placeholder="Optional note"
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => {
                setEditing(false);
                setForm({
                  itemsTitle: mealTitle,
                  calories: String(Number(log.calories) || 0),
                  protein_g: String(Number(log.protein_g) || 0),
                  carbs_g: String(Number(log.carbs_g) || 0),
                  fat_g: String(Number(log.fat_g) || 0),
                  note: String((log as any).note || ''),
                });
              }}
              className="text-[11px] px-2 py-1 rounded-md border border-gray-200/70 dark:border-gray-800/70 hover:bg-gray-50 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className={`text-[11px] px-2 py-1 rounded-md text-white ${saving ? 'bg-emerald-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

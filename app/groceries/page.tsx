"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type Grocery = {
  id: string;
  user_id: string;
  name: string;
  qty: number;
  unit: string;
  updated_at?: string;
};

const units = ["unit", "g", "kg", "ml", "l", "tbsp", "tsp", "cup", "oz", "lb"];

export default function GroceriesPage() {
  const { data: session, status } = useSession();
  const [items, setItems] = useState<Grocery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState<{ name: string; qty: string; unit: string }>({ name: "", qty: "", unit: "unit" });

  useEffect(() => {
    const load = async () => {
      if (status !== "authenticated") { setLoading(false); return; }
      setLoading(true);
      try {
        const resp = await fetch("/api/groceries");
        if (!resp.ok) throw new Error("Failed to load groceries");
        const data = await resp.json();
        setItems(data || []);
      } catch (e: any) {
        setError(e.message || "Failed to load groceries");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [status]);

  async function addItem() {
    if (!newItem.name.trim()) return;
    const body = { name: newItem.name.trim(), qty: Number(newItem.qty) || 1, unit: newItem.unit || "unit" };
    try {
      const resp = await fetch("/api/groceries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!resp.ok) throw new Error("Create failed");
      const created = await resp.json();
      setItems((arr) => [created, ...arr]);
      setNewItem({ name: "", qty: "", unit: "unit" });
    } catch (e: any) {
      setError(e.message || "Failed to add item");
    }
  }

  async function updateItem(id: string, patch: Partial<Grocery>) {
    const prev = items;
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    try {
      const resp = await fetch(`/api/groceries/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!resp.ok) throw new Error("Update failed");
    } catch (e) {
      setItems(prev);
    }
  }

  async function deleteItem(id: string) {
    const prev = items;
    setItems((arr) => arr.filter((it) => it.id !== id));
    try {
      const resp = await fetch(`/api/groceries/${id}`, { method: "DELETE" });
      if (!resp.ok && resp.status !== 204) throw new Error("Delete failed");
    } catch (e) {
      setItems(prev);
    }
  }

  if (status === "loading") return null;
  if (status !== "authenticated") {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <h1 className="text-2xl font-semibold mb-2">Groceries</h1>
        <p className="text-gray-600">Please sign in to manage your groceries.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 pb-[max(6rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Groceries</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Keep your pantry in sync across devices.</p>
        </div>
        <a href="/suggestions" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Use in Suggestions →</a>
      </div>

      {/* Add new item - mobile first stacked */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 mb-6 bg-white dark:bg-gray-950 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <label className="sr-only" htmlFor="new-name">Item</label>
          <input
            id="new-name"
            value={newItem.name}
            onChange={(e) => setNewItem((s) => ({ ...s, name: e.target.value }))}
            placeholder="e.g. Eggs"
            className="sm:col-span-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm"
          />
          <label className="sr-only" htmlFor="new-qty">Quantity</label>
          <input
            id="new-qty"
            inputMode="decimal"
            value={newItem.qty}
            onChange={(e) => setNewItem((s) => ({ ...s, qty: e.target.value }))}
            placeholder="Qty"
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm"
          />
          <label className="sr-only" htmlFor="new-unit">Unit</label>
          <select
            id="new-unit"
            value={newItem.unit}
            onChange={(e) => setNewItem((s) => ({ ...s, unit: e.target.value }))}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm"
          >
            {units.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <button
            onClick={addItem}
            className="rounded-xl bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-700 active:scale-[.99] transition"
          >
            Add
          </button>
        </div>
      </div>

      {/* List / states */}
      {loading ? (
        <ul className="space-y-3" aria-busy>
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="h-14 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 animate-pulse" />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-gray-600 dark:text-gray-400">
          <p className="mb-2">No items yet.</p>
          <p className="text-sm">Add your first ingredient above to personalize suggestions.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-950 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  aria-label="Item name"
                  value={it.name}
                  onChange={(e) => updateItem(it.id, { name: e.target.value })}
                  className="flex-1 rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm focus:border-gray-300 dark:focus:border-gray-700"
                />
                <div className="flex items-center gap-2">
                  <input
                    aria-label="Quantity"
                    type="number"
                    inputMode="decimal"
                    value={Number(it.qty)}
                    onChange={(e) => updateItem(it.id, { qty: Number(e.target.value) })}
                    className="w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-2 text-sm"
                  />
                  <select
                    aria-label="Unit"
                    value={it.unit}
                    onChange={(e) => updateItem(it.id, { unit: e.target.value })}
                    className="w-28 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-2 text-sm"
                  >
                    {units.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => deleteItem(it.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 text-red-600 px-3 py-2 text-xs hover:bg-red-50 active:scale-[.99]"
                    aria-label={`Remove ${it.name}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-4 text-sm text-red-600" role="alert">{error}</div>
      )}
    </div>
  );
}

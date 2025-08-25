'use client';

import { useEffect, useState } from 'react';

interface Reward {
  reward_id: string;
  kind: 'diamond' | 'collectible';
  amount: number | null;
  collectible_id: string | null;
  collectible_name?: string | null;
  collectible_icon?: string | null;
  collectible_rarity?: string | null;
  unlock_rule: 'level' | 'total_ep';
  unlock_level: number | null;
  unlock_ep: number | null;
}

interface Collectible {
  id: string;
  name: string;
  icon: string | null;
  rarity: string | null;
  is_badge: boolean;
  is_private: boolean;
  owner_user_id: string | null;
  collectibles_store?: Array<{ id: string; price: number; active: boolean; created_at: string }>;
  collectibles_requirements?: Array<{ collectible_id: string; min_level: number; required_badge_id: string | null; required_goal_id: string | null; require_goal_success: boolean }>;
}

type StoreEdit = {
  price: number | '';
  active: boolean;
  min_level: number | '';
  saving?: boolean;
};

type RewardEdit = {
  kind: 'diamond' | 'collectible';
  amount: number | '';
  collectible_id: string;
  unlock_rule: 'level' | 'total_ep';
  unlock_level: number | '';
  unlock_ep: number | '';
  saving?: boolean;
};

export default function AdminRewardsPage() {
  const [tab, setTab] = useState<'levels' | 'collectibles' | 'store'>('levels');
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [collectibles, setCollectibles] = useState<Collectible[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRarity, setNewRarity] = useState<'common'|'rare'|'epic'|'legendary'>('common');
  const [newIsBadge, setNewIsBadge] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [storeEdits, setStoreEdits] = useState<Record<string, StoreEdit>>({});
  const [editingReward, setEditingReward] = useState<string | null>(null);
  const [rewardEdits, setRewardEdits] = useState<Record<string, RewardEdit>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [r1, r2] = await Promise.all([
          fetch('/api/admin/rewards'),
          fetch('/api/admin/collectibles'),
        ]);
        const j1 = await r1.json();
        const j2 = await r2.json();
        if (cancelled) return;
        if (!r1.ok) throw new Error(j1?.error || 'Failed to load rewards');
        if (!r2.ok) throw new Error(j2?.error || 'Failed to load collectibles');
        setRewards(j1.rewards || []);
        setCollectibles(j2.collectibles || []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const groupedByLevel = rewards
    .filter(r => r.unlock_rule === 'level' && r.unlock_level != null)
    .reduce((acc: Record<number, Reward[]>, r) => {
      const lvl = r.unlock_level as number;
      acc[lvl] = acc[lvl] || [];
      acc[lvl].push(r);
      return acc;
    }, {});

  // seed store edit values when collectibles load
  useEffect(() => {
    const next: Record<string, StoreEdit> = {};
    for (const c of collectibles) {
      next[c.id] = {
        price: c.collectibles_store?.[0]?.price ?? '',
        active: c.collectibles_store?.[0]?.active ?? false,
        min_level: c.collectibles_requirements?.[0]?.min_level ?? '',
      };
    }
    setStoreEdits(next);
  }, [collectibles]);

  // seed reward edit values when rewards load
  useEffect(() => {
    const next: Record<string, RewardEdit> = {};
    for (const r of rewards) {
      next[r.reward_id] = {
        kind: r.kind,
        amount: r.amount ?? '',
        collectible_id: r.collectible_id ?? '',
        unlock_rule: r.unlock_rule,
        unlock_level: r.unlock_level ?? '',
        unlock_ep: r.unlock_ep ?? '',
      };
    }
    setRewardEdits(next);
  }, [rewards]);

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Manage Rewards & Collectibles</h1>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('levels')} className={`px-3 py-1.5 rounded-full border ${tab==='levels' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-white/5'}`}>Levels & Rewards</button>
        <button onClick={() => setTab('collectibles')} className={`px-3 py-1.5 rounded-full border ${tab==='collectibles' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-white/5'}`}>Collectibles Catalog</button>
        <button onClick={() => setTab('store')} className={`px-3 py-1.5 rounded-full border ${tab==='store' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-white/5'}`}>Store & Access Rules</button>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div className="text-red-600">{error}</div>}

      {!loading && !error && tab === 'levels' && (
        <div className="space-y-4">
          {Object.keys(groupedByLevel).length === 0 && (
            <div className="text-sm text-gray-600">No level rewards configured yet.</div>
          )}
          {Object.entries(groupedByLevel).map(([lvl, items]) => (
            <div key={lvl} className="rounded-xl border p-3">
              <div className="font-semibold mb-2">Level {lvl}</div>
              <ul className="space-y-2">
                {items.map((r) => {
                  const isEditing = editingReward === r.reward_id;
                  const edit = rewardEdits[r.reward_id] || { kind: r.kind, amount: r.amount ?? '', collectible_id: r.collectible_id ?? '', unlock_rule: r.unlock_rule, unlock_level: r.unlock_level ?? '', unlock_ep: r.unlock_ep ?? '' };
                  return (
                    <li key={r.reward_id} className="flex items-center gap-2 text-sm">
                      {!isEditing ? (
                        <>
                          <span className="inline-flex px-2 py-0.5 rounded-full border bg-gray-50">{r.kind}</span>
                          {r.kind === 'diamond' && <span>+{r.amount} diamonds</span>}
                          {r.kind === 'collectible' && (
                            <span>
                              Collectible: {r.collectible_name || r.collectible_id}
                            </span>
                          )}
                          <button onClick={() => setEditingReward(r.reward_id)} className="ml-auto px-2 py-1 text-xs border rounded hover:bg-gray-100">Edit</button>
                          <button onClick={async () => {
                            if (confirm('Delete this reward?')) {
                              try {
                                const res = await fetch(`/api/admin/rewards/${r.reward_id}`, { method: 'DELETE' });
                                if (!res.ok) throw new Error('Delete failed');
                                const r1 = await fetch('/api/admin/rewards');
                                const j1 = await r1.json();
                                if (!r1.ok) throw new Error('Reload failed');
                                setRewards(j1.rewards || []);
                              } catch (e: any) {
                                setError(e?.message || 'Delete failed');
                              }
                            }
                          }} className="px-2 py-1 text-xs border rounded text-red-600 hover:bg-red-50">Delete</button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 w-full">
                          <select value={edit.kind} onChange={e => setRewardEdits(s => ({ ...s, [r.reward_id]: { ...edit, kind: e.target.value as 'diamond' | 'collectible' } }))} className="border rounded px-2 py-1 text-xs">
                            <option value="diamond">diamond</option>
                            <option value="collectible">collectible</option>
                          </select>
                          {edit.kind === 'diamond' && (
                            <input type="number" placeholder="Amount" value={edit.amount} onChange={e => setRewardEdits(s => ({ ...s, [r.reward_id]: { ...edit, amount: e.target.value === '' ? '' : Number(e.target.value) } }))} className="w-20 border rounded px-2 py-1 text-xs" />
                          )}
                          {edit.kind === 'collectible' && (
                            <select value={edit.collectible_id} onChange={e => setRewardEdits(s => ({ ...s, [r.reward_id]: { ...edit, collectible_id: e.target.value } }))} className="border rounded px-2 py-1 text-xs">
                              <option value="">Select collectible</option>
                              {collectibles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          )}
                          <button onClick={async () => {
                            try {
                              setRewardEdits(s => ({ ...s, [r.reward_id]: { ...edit, saving: true } }));
                              const res = await fetch(`/api/admin/rewards/${r.reward_id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  kind: edit.kind,
                                  amount: edit.kind === 'diamond' ? (edit.amount === '' ? 0 : edit.amount) : null,
                                  collectible_id: edit.kind === 'collectible' ? edit.collectible_id : null,
                                })
                              });
                              if (!res.ok) throw new Error('Update failed');
                              const r1 = await fetch('/api/admin/rewards');
                              const j1 = await r1.json();
                              if (!r1.ok) throw new Error('Reload failed');
                              setRewards(j1.rewards || []);
                              setEditingReward(null);
                            } catch (e: any) {
                              setError(e?.message || 'Update failed');
                            } finally {
                              setRewardEdits(s => ({ ...s, [r.reward_id]: { ...edit, saving: false } }));
                            }
                          }} disabled={edit.saving} className="px-2 py-1 text-xs border rounded hover:bg-gray-100">{edit.saving ? 'Saving...' : 'Save'}</button>
                          <button onClick={() => setEditingReward(null)} className="px-2 py-1 text-xs border rounded hover:bg-gray-100">Cancel</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && tab === 'collectibles' && (
        <div className="space-y-4">
          <div className="rounded-xl border p-3">
            <div className="font-medium mb-2">Add new collectible</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-sm mb-1">Name</label>
                <input value={newName} onChange={e=>setNewName(e.target.value)} className="w-full border rounded px-2 py-1" placeholder="e.g., Golden Apple" />
              </div>
              <div>
                <label className="block text-sm mb-1">Rarity</label>
                <select value={newRarity} onChange={e=>setNewRarity(e.target.value as any)} className="w-full border rounded px-2 py-1">
                  <option value="common">common</option>
                  <option value="rare">rare</option>
                  <option value="epic">epic</option>
                  <option value="legendary">legendary</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input id="isBadge" type="checkbox" checked={newIsBadge} onChange={e=>setNewIsBadge(e.target.checked)} />
                <label htmlFor="isBadge" className="text-sm">Is badge</label>
              </div>
              <div>
                <label className="block text-sm mb-1">Image</label>
                <input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0] || null)} />
              </div>
            </div>
            <div className="mt-3">
              <button
                disabled={creating || !newName}
                onClick={async ()=>{
                  try {
                    setCreating(true);
                    let iconUrl: string | undefined = undefined;
                    if (file) {
                      const fd = new FormData();
                      fd.append('file', file);
                      fd.append('name', newName.replace(/\s+/g,'_').toLowerCase());
                      const upRes = await fetch('/api/admin/collectibles/upload', { method: 'POST', body: fd });
                      const upJ = await upRes.json();
                      if (!upRes.ok) throw new Error(upJ?.error || 'Upload failed');
                      iconUrl = upJ.url;
                    }
                    const crRes = await fetch('/api/admin/collectibles', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: newName, rarity: newRarity, is_badge: newIsBadge, icon: iconUrl }),
                    });
                    const crJ = await crRes.json();
                    if (!crRes.ok) throw new Error(crJ?.error || 'Create failed');
                    // refresh list
                    const r2 = await fetch('/api/admin/collectibles');
                    const j2 = await r2.json();
                    if (!r2.ok) throw new Error(j2?.error || 'Reload failed');
                    setCollectibles(j2.collectibles || []);
                    setNewName('');
                    setNewRarity('common');
                    setNewIsBadge(false);
                    setFile(null);
                  } catch (e: any) {
                    setError(e?.message || 'Create failed');
                  } finally {
                    setCreating(false);
                  }
                }}
                className={`px-3 py-1.5 rounded-full border ${creating ? 'opacity-50' : 'hover:bg-gray-100 dark:hover:bg-white/5'}`}
              >{creating ? 'Creating…' : 'Create collectible'}</button>
            </div>
          </div>
      )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {collectibles.map((c) => (
            <div key={c.id} className="rounded-xl border p-3 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={(c.icon && (c.icon.startsWith('http') || c.icon.startsWith('/'))) ? c.icon : c.icon ? `/images/collectibles/${c.icon}.svg` : '/images/collectibles/default.svg'}
                onError={(e) => {
                  const fb = '/images/collectibles/default.svg';
                  // @ts-ignore
                  if (!e.currentTarget.src.endsWith(fb)) {
                    // @ts-ignore
                    e.currentTarget.src = fb;
                  }
                }}
                alt={c.name}
                className="h-10 w-10 rounded"
              />
              <div className="flex-1">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-gray-600">{c.rarity}{c.is_badge ? ' • badge' : ''}</div>
              </div>
              <button onClick={async () => {
                if (confirm(`Delete collectible "${c.name}"? This will also remove it from store and requirements.`)) {
                  try {
                    const res = await fetch(`/api/admin/collectibles/${c.id}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Delete failed');
                    const r2 = await fetch('/api/admin/collectibles');
                    const j2 = await r2.json();
                    if (!r2.ok) throw new Error('Reload failed');
                    setCollectibles(j2.collectibles || []);
                  } catch (e: any) {
            const req = c.collectibles_requirements?.[0] ?? null;
            const row = storeEdits[c.id] || { price: '', active: false, min_level: '' };
            return (
              <div key={c.id} className="rounded-xl border p-3">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={(c.icon && (c.icon.startsWith('http') || c.icon.startsWith('/'))) ? c.icon : c.icon ? `/images/collectibles/${c.icon}.svg` : '/images/collectibles/default.svg'}
                    onError={(e) => {
                      const fb = '/images/collectibles/default.svg';
                      // @ts-ignore
                      if (!e.currentTarget.src.endsWith(fb)) {
                        // @ts-ignore
                        e.currentTarget.src = fb;
                      }
                    }}
                    alt={c.name}
                    className="h-8 w-8 rounded"
                  />
                  <div className="font-medium flex-1">{c.name}</div>
                  <div className="flex items-center gap-2 text-sm">
                    <label className="text-xs text-gray-600">Price</label>
                    <input
                      type="number"
                      className="w-24 border rounded px-2 py-1"
                      value={row.price}
                      onChange={(e)=>setStoreEdits(s=>({ ...s, [c.id]: { ...row, price: e.target.value === '' ? '' : Number(e.target.value) } }))}
                    />
                  </div>
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={row.active}
                      onChange={(e)=>setStoreEdits(s=>({ ...s, [c.id]: { ...row, active: e.target.checked } }))}
                    />
                    Active
                  </label>
                </div>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <label className="text-xs text-gray-600">Min Level</label>
                      <input
                        type="number"
                        className="w-20 border rounded px-2 py-1"
                        value={row.min_level}
                        onChange={(e)=>setStoreEdits(s=>({ ...s, [c.id]: { ...row, min_level: e.target.value === '' ? '' : Number(e.target.value) } }))}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <label className="text-xs text-gray-600">Required Badge</label>
                      <select
                        className="border rounded px-2 py-1"
                        value={req?.required_badge_id || ''}
                        onChange={async (e) => {
                          try {
                            await fetch('/api/admin/collectibles/requirements', {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ collectible_id: c.id, required_badge_id: e.target.value || null })
                            });
                            const r2 = await fetch('/api/admin/collectibles');
                            const j2 = await r2.json();
                            if (!r2.ok) throw new Error('Reload failed');
                            setCollectibles(j2.collectibles || []);
                          } catch (e: any) {
                            setError(e?.message || 'Update failed');
                          }
                        }}
                      >
                        <option value="">None</option>
                        {collectibles.filter(badge => badge.is_badge).map(badge => (
                          <option key={badge.id} value={badge.id}>{badge.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    className={`px-3 py-1.5 rounded-full border ${row.saving ? 'opacity-50' : 'hover:bg-gray-100 dark:hover:bg-white/5'}`}
                    disabled={!!row.saving}
                    onClick={async ()=>{
                      try {
                        setStoreEdits(s=>({ ...s, [c.id]: { ...row, saving: true } }));
                        // save store
                        await fetch('/api/admin/collectibles/store', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ collectible_id: c.id, price: row.price === '' ? 0 : row.price, active: row.active })
                        });
                        // save requirements (min_level)
                        if (row.min_level !== '') {
                          await fetch('/api/admin/collectibles/requirements', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ collectible_id: c.id, min_level: row.min_level })
                          });
                        }
                        // refresh
                        const r2 = await fetch('/api/admin/collectibles');
                        const j2 = await r2.json();
                        if (!r2.ok) throw new Error(j2?.error || 'Reload failed');
                        setCollectibles(j2.collectibles || []);
                      } catch (e: any) {
                        setError(e?.message || 'Save failed');
                      } finally {
                        setStoreEdits(s=>({ ...s, [c.id]: { ...row, saving: false } }));
                      }
                    }}
                  >{row.saving ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

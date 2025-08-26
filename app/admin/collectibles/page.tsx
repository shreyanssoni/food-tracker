"use client";
import { useEffect, useMemo, useState } from 'react';

type Collectible = {
  id: string;
  name: string;
  icon: string | null;
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | string;
  is_badge: boolean;
  public_slug: string | null;
  lore: string | null;
  story_title: string | null;
  story_md: string | null;
  og_image_url: string | null;
};

export default function AdminCollectiblesPage() {
  const [list, setList] = useState<Collectible[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useMemo(() => list.find((c) => c.id === activeId) || null, [list, activeId]);
  const [saving, setSaving] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  // Track if we've auto-filled slug once for a collectible in this session
  const [autoFilledSlugFor, setAutoFilledSlugFor] = useState<Record<string, boolean>>({});
  // Base app URL for OG images (fallback to window.origin in dev)
  const appBase = useMemo(() => (process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/?$/, ''), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/collectibles', { cache: 'no-store' });
        const j = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(j.error || 'Failed to load');
        setList(j.collectibles || []);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Failed to load');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const onField = (key: keyof Collectible, val: any) => {
    if (!active) return;
    setList((prev) => prev.map((c) => (c.id === active.id ? { ...c, [key]: val } : c)));
  };

  // Reset preview error when slug changes
  useEffect(() => {
    setImgFailed(false);
  }, [active?.public_slug]);

  // Auto-fill og_image_url when slug is present and og is empty or differs from the canonical value
  useEffect(() => {
    if (!active) return;
    const slug = (active.public_slug || '').trim();
    if (!slug) return;
    const desired = `${appBase}/api/collectibles/og/${encodeURIComponent(slug)}`;
    const current = (active.og_image_url || '').trim();
    // If empty or still pointing to older share endpoint, or base changed, set it
    const shouldSet = !current || /\/api\/collectibles\/share\//.test(current) || !current.startsWith(desired);
    if (shouldSet) onField('og_image_url', desired);
  }, [active?.id, active?.public_slug, appBase]);

  const duplicateSlug = useMemo(() => {
    if (!active?.public_slug) return false;
    const slug = active.public_slug.trim();
    return list.some((c) => c.id !== active.id && (c.public_slug || '').trim() === slug);
  }, [list, active?.id, active?.public_slug]);

  // Generate a URL-friendly slug from the name
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[\u2019']/g, '') // remove apostrophes
      .replace(/[^a-z0-9]+/g, '-') // non-alnum to hyphen
      .replace(/^-+|-+$/g, '') // trim hyphens
      .replace(/-+/g, '-'); // collapse

  // Ensure uniqueness among other collectibles
  const generateUniqueSlug = (base: string) => {
    const core = slugify(base || '');
    if (!core) return '';
    const existing = new Set(
      list.filter((c) => c.id !== active?.id).map((c) => (c.public_slug || '').trim())
    );
    let unique = core;
    let n = 1;
    while (existing.has(unique)) {
      n += 1;
      unique = `${core}-${n}`;
    }
    return unique;
  };

  const onAutoSlug = () => {
    if (!active) return;
    const gen = generateUniqueSlug(active.name || '');
    if (gen) onField('public_slug', gen);
  };

  // Auto-fill slug on name change when slug is empty (only first time per collectible)
  useEffect(() => {
    if (!active) return;
    const id = active.id;
    const already = autoFilledSlugFor[id];
    const currentSlug = (active.public_slug || '').trim();
    const base = (active.name || '').trim();
    if (!already && !currentSlug && base) {
      const gen = generateUniqueSlug(base);
      if (gen) {
        onField('public_slug', gen);
        setAutoFilledSlugFor((prev) => ({ ...prev, [id]: true }));
      }
    }
  }, [active?.id, active?.name, active?.public_slug]);

  const save = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const body: Partial<Collectible> = {
        name: active.name,
        icon: active.icon,
        rarity: active.rarity,
        is_badge: active.is_badge,
        public_slug: active.public_slug,
        lore: active.lore,
        story_title: active.story_title,
        story_md: active.story_md,
        og_image_url: active.og_image_url,
      };
      const res = await fetch(`/api/admin/collectibles/${encodeURIComponent(active.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Save failed');
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Admin · Collectibles</h1>
      {loading ? (
        <div className="mt-6 h-40 rounded-xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/50 animate-pulse" />
      ) : error ? (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1 rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white/70 dark:bg-gray-950/60 shadow-sm">
            <div className="p-3 border-b border-gray-200/70 dark:border-gray-800/70 text-xs text-gray-500">Collectibles</div>
            <div className="max-h-[70vh] overflow-auto divide-y divide-gray-200/60 dark:divide-gray-800/60">
              {list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 ${activeId === c.id ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold truncate" title={c.name}>{c.name}</div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-800">{c.rarity || 'common'}</span>
                  </div>
                  {c.public_slug && (
                    <div className="mt-0.5 text-[11px] text-gray-500 truncate">/{c.public_slug}</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white/70 dark:bg-gray-950/60 shadow-sm p-4">
            {!active ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">Select a collectible to edit.</p>
            ) : (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!duplicateSlug) save(); }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-xs text-gray-500">Name</span>
                    <input value={active.name} onChange={(e) => onField('name', e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Icon (URL or key)</span>
                    <input value={active.icon || ''} onChange={(e) => onField('icon', e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">Rarity</span>
                    <select value={active.rarity} onChange={(e) => onField('rarity', e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
                      <option value="common">common</option>
                      <option value="rare">rare</option>
                      <option value="epic">epic</option>
                      <option value="legendary">legendary</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 mt-6">
                    <input type="checkbox" checked={!!active.is_badge} onChange={(e) => onField('is_badge', e.target.checked)} />
                    <span className="text-sm">Is Badge</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-xs text-gray-500">Public Slug</span>
                    <div className="mt-1 flex items-stretch gap-2">
                      <input
                        value={active.public_slug || ''}
                        onChange={(e) => onField('public_slug', e.target.value)}
                        placeholder="e.g. dawn-bird"
                        className="flex-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={onAutoSlug}
                        title="Generate slug from name"
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60"
                      >
                        Auto-generate
                      </button>
                    </div>
                    {duplicateSlug && (
                      <div className="mt-1 text-[11px] text-red-600">Slug already in use. Choose a unique slug.</div>
                    )}
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">OG Image URL (auto)</span>
                    <div className="mt-1 flex items-stretch gap-2">
                      <input
                        value={active.og_image_url || ''}
                        onChange={(e) => onField('og_image_url', e.target.value)}
                        placeholder={`${appBase}/api/collectibles/og/slug`}
                        className="flex-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const slug = (active.public_slug || '').trim();
                          if (!slug) return;
                          onField('og_image_url', `${appBase}/api/collectibles/og/${encodeURIComponent(slug)}`);
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60"
                        title="Use canonical OG image URL"
                      >
                        Auto-fill
                      </button>
                    </div>
                    {active.public_slug && (
                      <div className="mt-1 text-[11px] text-gray-500">
                        Will use: <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">{`${appBase}/api/collectibles/og/${active.public_slug}`}</code>
                      </div>
                    )}
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs text-gray-500">Lore (short)</span>
                  <input value={active.lore || ''} onChange={(e) => onField('lore', e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                </label>

                <label className="block">
                  <span className="text-xs text-gray-500">Story Title</span>
                  <input value={active.story_title || ''} onChange={(e) => onField('story_title', e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                </label>

                <label className="block">
                  <span className="text-xs text-gray-500">Story (Markdown allowed)</span>
                  <textarea value={active.story_md || ''} onChange={(e) => onField('story_md', e.target.value)} rows={8} className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
                </label>

                {/* Share card preview */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                  <div className="text-xs text-gray-500 mb-2">Share Preview</div>
                  {active.public_slug ? (
                    <div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/collectibles/share/${encodeURIComponent(active.public_slug)}?preview=1`}
                        alt="Share card preview"
                        className="w-full max-h-80 object-contain bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg"
                        onError={() => setImgFailed(true)}
                      />
                      <div className="mt-2 text-[11px] text-gray-500">
                        {imgFailed ? (
                          <span>Preview may not render here because the image requires ownership. It will work for users who unlocked this collectible.</span>
                        ) : (
                          <span>Preview uses the share endpoint. If you see a broken image, it’s likely due to access checks.</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[11px]">
                        <code className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-x-auto">/api/collectibles/share/{active.public_slug}</code>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-500">Set a public slug to preview the share image.</div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  {active.public_slug && (
                    <a href={`/collectibles/${encodeURIComponent(active.public_slug)}`} target="_blank" className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60">Open</a>
                  )}
                  <button disabled={saving || duplicateSlug} className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-700 dark:text-blue-300 dark:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 disabled:opacity-60 disabled:cursor-not-allowed">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

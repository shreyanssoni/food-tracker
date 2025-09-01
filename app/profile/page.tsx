"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Activity = "sedentary" | "light" | "moderate" | "very" | "super";
type Goal = "maintain" | "lose" | "gain";

interface Profile {
  height_cm: number | null;
  weight_kg: number | null;
  age: number | null;
  gender: "male" | "female" | "other" | null;
  activity_level: Activity | null;
  goal: Goal | null;
  workout_level: "beginner" | "intermediate" | "advanced" | "pro" | null;
  // UI uses a comma-separated string; API stores array at dietary_restrictions
  dietary: string | null;
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
    activity_level: "sedentary",
    goal: "maintain",
    workout_level: null,
    dietary: null,
  });

  // Spotlighted goal-linked collectibles (profile strip)
  const [spotlightMap, setSpotlightMap] = useState<Record<string, boolean>>({});
  const [spotlightItems, setSpotlightItems] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (status === "authenticated") {
        try {
          const r = await fetch("/api/preferences");
          if (!r.ok) throw new Error("Failed to load profile");
          const d = await r.json();
          const p = d?.profile || {};
          setProfile({
            height_cm: p.height_cm ?? null,
            weight_kg: p.weight_kg ?? null,
            age: p.age ?? null,
            gender: p.gender ?? null,
            activity_level: p.activity_level ?? "sedentary",
            goal: p.goal ?? "maintain",
            workout_level: p.workout_level ?? null,
            dietary: Array.isArray(p?.dietary_restrictions)
              ? (p.dietary_restrictions as string[]).join(", ")
              : p?.dietary_restrictions ?? null,
          });
        } catch (e: any) {
          setError(e?.message || "Error");
        } finally {
          setLoading(false);
        }
      } else if (status === "unauthenticated") {
        setLoading(false);
      }
    };
    load();
  }, [status]);

  // Load spotlight map and items once authenticated
  useEffect(() => {
    if (status !== 'authenticated') return;
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('profile_spotlight_collectibles') : null;
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') setSpotlightMap(obj as Record<string, boolean>);
      }
    } catch {}
    (async () => {
      try {
        const res = await fetch('/api/collectibles/mine');
        const j = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(j.items)) setSpotlightItems(j.items as any[]);
      } catch {}
    })();
    const onLocal = () => {
      try {
        const r = localStorage.getItem('profile_spotlight_collectibles');
        if (!r) return setSpotlightMap({});
        const obj = JSON.parse(r);
        if (obj && typeof obj === 'object') setSpotlightMap(obj as Record<string, boolean>);
      } catch {}
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'profile_spotlight_collectibles') onLocal();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('profile_spotlight_collectibles_updated', onLocal as any);
      window.addEventListener('storage', onStorage);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('profile_spotlight_collectibles_updated', onLocal as any);
        window.removeEventListener('storage', onStorage);
      }
    };
  }, [status]);

  const onSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          height_cm: profile.height_cm,
          weight_kg: profile.weight_kg,
          age: profile.age,
          gender: profile.gender,
          activity_level: profile.activity_level,
          goal: profile.goal,
          workout_level: profile.workout_level,
          dietary_restrictions:
            profile.dietary && profile.dietary.trim().length > 0
              ? profile.dietary.split(",").map((s) => s.trim()).filter(Boolean)
              : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setEditing(false);
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-[50vh] grid place-items-center text-center">
        <div>
          <h2 className="text-xl font-semibold mb-2">
            Please sign in to view your profile
          </h2>
          <a
            href="/auth/signin"
            className="px-4 py-2 rounded-md bg-blue-600 text-white"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar and user meta */}
          <div className="h-12 w-12 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden flex items-center justify-center text-gray-500 shrink-0">
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt="avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-medium">
                {(session?.user?.name || session?.user?.email || "U")
                  .toString()
                  .trim()
                  .charAt(0)
                  .toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">Your Profile</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
              {session?.user?.name || session?.user?.email}
            </p>
          </div>
        </div>
        {/* Actions */}
        {!editing ? (
          <button
            className="inline-flex px-3 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.99] transition"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        ) : (
          <div className="hidden sm:flex gap-2">
            <button
              className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              className="px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              onClick={onSave}
              disabled={loading}
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      {/* Spotlighted rewards (optional strip) */}
      {(() => {
        const items = (spotlightItems || []).filter((c: any) => spotlightMap[c.id] && c?.is_goal_collectible && c?.is_user_created);
        if (!items.length) return null;
        return (
          <div className="rounded-xl border border-pink-200/70 dark:border-pink-900/50 bg-white/70 dark:bg-gray-950/60 p-3">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Spotlighted rewards</div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {items.map((c: any) => {
                const icon = c.icon && (c.icon.startsWith('http') || c.icon.startsWith('/')) ? c.icon : (c.icon ? `/images/collectibles/${c.icon}.svg` : '/images/collectibles/default.svg');
                return (
                  <a key={c.id} href={c.public_slug ? `/collectibles/${encodeURIComponent(c.public_slug)}` : '#'} className="relative shrink-0 w-20">
                    <div className="aspect-square rounded-lg overflow-hidden border border-pink-300/60 bg-pink-50/60 dark:border-pink-800/60 dark:bg-pink-900/20 shadow-[0_0_0_3px_rgba(236,72,153,0.12),0_10px_25px_-10px_rgba(236,72,153,0.45)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={icon} alt={c.name} className="h-full w-full object-cover saturate-110" />
                    </div>
                    <div className="mt-1 text-[10px] leading-tight text-pink-700 dark:text-pink-300 line-clamp-2" title={c.name}>{c.name}</div>
                    <div className="absolute -top-1 -left-1 text-[9px] px-1.5 py-0.5 rounded-full border border-pink-300/60 bg-pink-50 text-pink-700 dark:border-pink-700/50 dark:bg-pink-900/30 dark:text-pink-200 shadow-sm">Goal Reward</div>
                  </a>
                );
              })}
            </div>
          </div>
        );
      })()}

      {error && <div className="text-sm text-red-500">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Height */}
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
          <label className="text-xs uppercase tracking-wide text-gray-500">
            Height
          </label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">
              {profile.height_cm ?? "—"} cm
            </div>
          ) : (
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={profile.height_cm ?? ""}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  height_cm: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="cm"
              inputMode="decimal"
            />
          )}
        </div>

        {/* Weight */}
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
          <label className="text-xs uppercase tracking-wide text-gray-500">
            Weight
          </label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">
              {profile.weight_kg ?? "—"} kg
            </div>
          ) : (
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={profile.weight_kg ?? ""}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  weight_kg: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="kg"
              inputMode="decimal"
            />
          )}
        </div>

        {/* Age */}
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
          <label className="text-xs uppercase tracking-wide text-gray-500">
            Age
          </label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">
              {profile.age ?? "—"}
            </div>
          ) : (
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={profile.age ?? ""}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  age: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="years"
              inputMode="numeric"
            />
          )}
        </div>

        {/* Gender */}
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
          <label className="text-xs uppercase tracking-wide text-gray-500">
            Gender
          </label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">
              {profile.gender ?? "—"}
            </div>
          ) : (
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={profile.gender ?? "male"}
              onChange={(e) =>
                setProfile({ ...profile, gender: e.target.value as any })
              }
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          )}
        </div>

        {/* Activity */}
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
          <label className="text-xs uppercase tracking-wide text-gray-500">
            Activity level
          </label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">
              {profile.activity_level}
            </div>
          ) : (
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={profile.activity_level ?? "sedentary"}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  activity_level: e.target.value as Activity,
                })
              }
            >
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
          <label className="text-xs uppercase tracking-wide text-gray-500">
            Goal
          </label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">
              {profile.goal}
            </div>
          ) : (
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={profile.goal ?? "maintain"}
              onChange={(e) =>
                setProfile({ ...profile, goal: e.target.value as Goal })
              }
            >
              <option value="maintain">Maintain</option>
              <option value="lose">Lose</option>
              <option value="gain">Gain</option>
            </select>
          )}
        </div>

        {/* Workout intensity */}
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
          <label className="text-xs uppercase tracking-wide text-gray-500">
            Workout intensity
          </label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">
              {profile.workout_level ?? "—"}
            </div>
          ) : (
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={profile.workout_level ?? "beginner"}
              onChange={(e) =>
                setProfile({ ...profile, workout_level: e.target.value as any })
              }
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="pro">Pro</option>
            </select>
          )}
        </div>

        {/* Dietary preferences */}
        <div className="md:col-span-2 bg-white dark:bg-gray-950 rounded-xl shadow-soft p-4 border border-gray-100 dark:border-gray-800">
          <label className="text-xs uppercase tracking-wide text-gray-500">
            Dietary preferences
          </label>
          {!editing ? (
            <div className="mt-1 text-base font-medium dark:text-gray-100">
              {profile.dietary && profile.dietary.trim().length > 0
                ? profile.dietary
                : "—"}
            </div>
          ) : (
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., vegetarian, low-carb"
              value={profile.dietary ?? ""}
              onChange={(e) =>
                setProfile({ ...profile, dietary: e.target.value })
              }
            />
          )}
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Used to tailor suggestions.
          </p>
        </div>
      </div>

      {/* Mobile sticky action bar when editing */}
      {editing && (
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-950/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 supports-[backdrop-filter]:dark:bg-gray-950/70">
          <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-end gap-2">
            <button
              className="px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              onClick={onSave}
              disabled={loading}
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

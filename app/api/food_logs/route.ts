import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Debug toggle via query param
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";

    const payload = await req.json();

    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Normalize top-level keys (case-insensitive)
    const entries = Object.entries(payload || {}).reduce<Record<string, any>>(
      (acc, [k, v]) => {
        acc[String(k).toLowerCase()] = v;
        return acc;
      },
      {}
    );

    // Helper: unit-aware numeric parsing (e.g., "20 g", "200 kcal", "1.2k")
    const parseNumWithUnits = (raw: any): number | null => {
      if (raw === null || raw === undefined || raw === "") return null;
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      if (typeof raw !== "string") return null;
      const s = raw.trim().toLowerCase();
      if (!s) return null;
      // Handle 1.2k style
      const kMatch = s.match(/^([+-]?[0-9]*\.?[0-9]+)\s*k(?:\b|$)/);
      if (kMatch) {
        const n = parseFloat(kMatch[1]);
        return Number.isFinite(n) ? n * 1000 : null;
      }
      // Strip common units like g, gram(s), kcal, cal, mg, etc.
      const cleaned = s
        .replace(/kcal|calories?|cals?/g, "")
        .replace(/grams?|g\b/g, "")
        .replace(/mgs?|mg\b/g, "")
        .replace(/[,+]/g, " ")
        .trim();
      const n = parseFloat(cleaned.replace(/\s+/g, ""));
      return Number.isFinite(n) ? n : null;
    };

    // Helper: nested key lookup across common containers (e.g., macros, nutrition)
    const findFirst = (
      keys: string[],
      containers: Record<string, any>
    ): any => {
      for (const key of keys) {
        if (key in containers) return containers[key];
      }
      // Search known nested objects
      const nestedHosts = [
        containers["macros"],
        containers["nutrition"],
        containers["nutrients"],
        containers["details"],
      ].filter(Boolean);
      for (const host of nestedHosts) {
        if (host && typeof host === "object") {
          const lowered = Object.entries(host).reduce<Record<string, any>>(
            (acc, [k, v]) => {
              acc[String(k).toLowerCase()] = v;
              return acc;
            },
            {}
          );
          for (const key of keys) {
            if (key in lowered) return lowered[key];
          }
        }
      }
      return undefined;
    };

    // Helper: clamp numbers to sane ranges
    const clamp = (n: number | null, min: number, max: number): number | null => {
      if (n === null || !Number.isFinite(n)) return null;
      return Math.min(Math.max(n, min), max);
    };

    // Name extraction from common keys
    const name = ["food", "name", "item", "text", "title", "label"]
      .map((k) => entries[k])
      .find((v) => typeof v === "string" && v.trim().length > 0) as
      | string
      | undefined;

    // Numeric macros with alias handling
    const caloriesRaw = findFirst(["calories", "kcal", "cal"], entries);
    const proteinRaw = findFirst(
      ["protein_g", "protein", "proteingrams", "prot", "proteins"],
      entries
    );
    const carbsRaw = findFirst(
      [
        "carbs_g",
        "carbs",
        "carbohydrates",
        "carbsg",
        "carb",
        "carbohydrate",
      ],
      entries
    );
    const fatRaw = findFirst(
      ["fat_g", "fat", "fatgrams", "fats", "lipids"],
      entries
    );

    let calories = clamp(parseNumWithUnits(caloriesRaw), 0, 10000);
    let protein_g = clamp(parseNumWithUnits(proteinRaw), 0, 1000);
    let carbs_g = clamp(parseNumWithUnits(carbsRaw), 0, 1000);
    let fat_g = clamp(parseNumWithUnits(fatRaw), 0, 1000);

    // If calories missing but macros available, infer via 4/4/9 rule
    if (calories === null) {
      const p = typeof protein_g === "number" ? protein_g : 0;
      const c = typeof carbs_g === "number" ? carbs_g : 0;
      const f = typeof fat_g === "number" ? fat_g : 0;
      if (p || c || f) {
        const inferred = 4 * p + 4 * c + 9 * f;
        calories = clamp(inferred, 0, 10000);
      }
    }

    const nowIso = new Date().toISOString();
    const eaten_atRaw =
      entries["eaten_at"] ??
      entries["timestamp"] ??
      entries["time"] ??
      findFirst(["eaten_at", "timestamp", "time", "date"], entries);
      
    const eaten_at = (() => {
      const coerceDate = (val: any): string | null => {
        if (val === null || val === undefined) return null;
        if (typeof val === "number" && Number.isFinite(val)) {
          // Heuristic: seconds vs ms
          const ms = val > 1e12 ? val : val * 1000;
          const d = new Date(ms);
          return isNaN(d.getTime()) ? null : d.toISOString();
        }
        if (typeof val === "string" && val.trim()) {
          // numeric string? try as epoch
          const num = Number(val);
          if (Number.isFinite(num)) {
            const ms = num > 1e12 ? num : num * 1000;
            const d = new Date(ms);
            if (!isNaN(d.getTime())) return d.toISOString();
          }
          const d = new Date(val);
          if (!isNaN(d.getTime())) return d.toISOString();
        }
        return null;
      };
      const coerced = coerceDate(eaten_atRaw);
      if (coerced) {
        const parsed = new Date(coerced);
        const now = new Date();
        if (parsed < now) return nowIso; // default to current local time if in the past
        return coerced;
      }
      return nowIso;
    })();

    const note = ((): string | null => {
      const n =
        entries["note"] ??
        entries["notes"] ??
        entries["comment"] ??
        entries["comments"] ??
        entries["description"] ??
        findFirst(["note", "notes", "comment", "comments", "description"], entries) ??
        null;
      return typeof n === "string" && n.trim().length > 0 ? n.trim() : null;
    })();

    // Build items array as required by schema
    const items = (() => {
      // If caller already sent a compatible items array, gently coerce
      const rawItems = entries["items"];
      if (Array.isArray(rawItems) && rawItems.length > 0) {
        const parsed = rawItems
          .map((it: any) => {
            const itName =
              typeof it?.name === "string"
                ? it.name.trim()
                : typeof it === "string"
                  ? it.trim()
                  : "";
            if (!itName) return null;
            // quantity may be number-like or string with units
            const qRaw = it?.quantity ?? it?.qty ?? it?.amount ?? null;
            const q = parseNumWithUnits(qRaw);
            return { name: itName, quantity: q ?? null };
          })
          .filter(Boolean) as Array<{ name: string; quantity: number | null }>;
        return parsed.length > 0 ? parsed : [{ name: "-", quantity: null }];
      }
      // If items is a string like "2 eggs, 1 slice bread"
      if (typeof rawItems === "string" && rawItems.trim()) {
        return rawItems
          .split(/[,\n]+/)
          .map((p) => p.trim())
          .filter(Boolean)
          .map((token) => {
            // Extract leading quantity if any
            const m = token.match(/^([0-9]*\.?[0-9]+)\s*(x|units?|pcs?|pieces?)?\s*(.*)$/i);
            if (m) {
              const qty = parseNumWithUnits(m[1]);
              const nm = (m[3] || token).trim();
              if (nm) return { name: nm, quantity: qty ?? null };
            }
            return { name: token, quantity: null };
          });
      }
      const singleName = typeof name === "string" ? name.trim() : "";
      return singleName
        ? [{ name: singleName, quantity: null }]
        : [{ name: "-", quantity: null }];
    })();

    // Final insertion payload: only mapped fields + user id
    // IMPORTANT: Supabase columns are NOT NULL with default 0 for macros.
    // If we pass null explicitly, insert will fail. Default missing values to 0.
    const toInsert = {
      items,
      calories: calories ?? 0,
      protein_g: protein_g ?? 0,
      carbs_g: carbs_g ?? 0,
      fat_g: fat_g ?? 0,
      eaten_at,
      note,
      user_id: session.user.id,
    } as const;

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("food_logs")
      .insert(toInsert as any)
      .select()
      .single();

    if (error) {
      console.error("/api/food_logs insert failed", {
        error,
        originalPayload: payload,
        normalized: toInsert,
        user: session.user.id,
      });
      return NextResponse.json(
        {
          error: error.message,
          code: (error as any)?.code,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          normalized: debug ? toInsert : undefined,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { data, normalized: debug ? toInsert : undefined },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

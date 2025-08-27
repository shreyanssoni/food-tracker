import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();

    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Normalize payload: support string/number values and common aliases (case-insensitive)
    const entries = Object.entries(payload || {}).reduce<Record<string, any>>(
      (acc, [k, v]) => {
        acc[k.toLowerCase()] = v;
        return acc;
      },
      {}
    );

    const toNum = (v: any): number | null => {
      if (v === null || v === undefined || v === "") return null;
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") {
        const n = parseFloat(v.replace(/[,\s]+/g, ""));
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    // Name extraction from common keys
    const name = ["food", "name", "item", "text", "title"]
      .map((k) => entries[k])
      .find((v) => typeof v === "string" && v.trim().length > 0) as
      | string
      | undefined;

    // Numeric macros with alias handling
    const calories = toNum(
      entries["calories"] ?? entries["kcal"] ?? entries["cal"]
    );
    const protein_g = toNum(
      entries["protein_g"] ?? entries["protein"] ?? entries["proteingrams"]
    );
    const carbs_g = toNum(
      entries["carbs_g"] ??
        entries["carbs"] ??
        entries["carbohydrates"] ??
        entries["carbsg"]
    );
    const fat_g = toNum(
      entries["fat_g"] ??
        entries["fat"] ??
        entries["fatgrams"] ??
        entries["fats"]
    );

    const nowIso = new Date().toISOString();
    const eaten_atRaw =
      entries["eaten_at"] ?? entries["timestamp"] ?? entries["time"];
    const eaten_at = (() => {
      if (typeof eaten_atRaw === "string" && eaten_atRaw.trim()) {
        const d = new Date(eaten_atRaw);
        if (!isNaN(d.getTime())) return d.toISOString();
      }
      return nowIso;
    })();

    const note = ((): string | null => {
      const n = entries["note"] ?? entries["notes"] ?? null;
      return typeof n === "string" && n.trim().length > 0 ? n.trim() : null;
    })();

    // Build items array as required by schema
    const items = (() => {
      // If caller already sent a compatible items array, gently coerce
      const rawItems = entries["items"];
      if (Array.isArray(rawItems) && rawItems.length > 0) {
        return rawItems
          .map((it: any) => {
            const itName =
              typeof it?.name === "string"
                ? it.name.trim()
                : typeof it === "string"
                  ? it.trim()
                  : "";
            if (!itName) return null;
            return { name: itName, quantity: it?.quantity ?? null };
          })
          .filter(Boolean);
      }
      const singleName = typeof name === "string" ? name.trim() : "";
      return singleName ? [{ name: singleName, quantity: null }] : [];
    })();

    // Final insertion payload: only mapped fields + user id
    const toInsert = {
      items,
      calories,
      protein_g,
      carbs_g,
      fat_g,
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
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

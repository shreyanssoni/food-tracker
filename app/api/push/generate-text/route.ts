import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/utils/auth";
import { geminiText } from "@/utils/ai";

const SLOT_VALUES = ["morning", "midday", "evening", "night"] as const;
type Slot = (typeof SLOT_VALUES)[number];

function buildPrompt(slot: Slot, timezone: string) {
  const now = new Date();
  return `You are an empathetic nutrition coach. Write a concise push notification (title + body) for the ${slot} slot.
Audience: busy professionals in timezone ${timezone}.
Constraints:
- Title <= 45 chars, imperative or inviting
- Body <= 120 chars, actionable and positive
- Focus on protein-forward, hydration, and a tiny habit
- No emojis
Return JSON with keys: title, body, url (path starting with /).`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createClient();
    // Optional: restrict to admins in production
    const { data: me } = await supabase
      .from("app_users")
      .select("is_sys_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (process.env.NODE_ENV !== "development" && !me?.is_sys_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { slot, timezone } = await req.json();
    if (!SLOT_VALUES.includes(slot)) {
      return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
    }
    const tz = (timezone || "Asia/Kolkata") as string;

    // Check cache using the local date for the target timezone (per-timezone daily cache)
    const today = (() => {
      try {
        const fmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        return fmt.format(new Date()); // en-CA => YYYY-MM-DD
      } catch {
        return new Date().toISOString().slice(0, 10);
      }
    })();
    const { data: cached } = await supabase
      .from("push_message_cache")
      .select("*")
      .eq("date", today)
      .eq("slot", slot)
      .eq("timezone", tz)
      .maybeSingle();

    if (cached) {
      return NextResponse.json({
        title: cached.title,
        body: cached.body,
        url: cached.url || "/",
      });
    }

    // Generate via AI
    const prompt = buildPrompt(slot, tz);
    console.log('[generate-text] prompt', { slot, timezone: tz, prompt });
    const text = await geminiText(prompt);
    console.log('[generate-text] raw_model_output', text);

    // Try to parse JSON from the AI response; fallback to simple defaults
    let title = "Healthy nudge";
    let body =
      text?.slice(0, 120) ||
      "Stay hydrated and add a lean protein to your next meal!";
    let url = "/suggestions";
    try {
      const cleaned = (() => {
        const raw = (text || "").trim();
        if (!raw) return raw;
        if (raw.startsWith("```")) {
          const firstFenceEnd = raw.indexOf("\n");
          const rest = firstFenceEnd >= 0 ? raw.slice(firstFenceEnd + 1) : raw;
          const secondFence = rest.indexOf("```");
          if (secondFence >= 0) return rest.slice(0, secondFence).trim();
        }
        return raw
          .replace(/```(?:json)?/gi, "")
          .replace(/```/g, "")
          .trim();
      })();

      let parsed: any = null;
      try {
        parsed = cleaned ? JSON.parse(cleaned) : null;
      } catch {
        const m = (cleaned || "").match(/\{[\s\S]*\}/);
        if (m) {
          try {
            parsed = JSON.parse(m[0]);
          } catch {}
        }
      }

      if (parsed) {
        if (parsed?.title) title = String(parsed.title).slice(0, 60);
        if (parsed?.body) body = String(parsed.body).slice(0, 160);
        if (
          parsed?.url &&
          typeof parsed.url === "string" &&
          parsed.url.startsWith("/")
        )
          url = parsed.url;
      } else {
        body = cleaned.slice(0, 160) || body;
      }
    } catch {
      // not JSON — keep fallback
    }

    // Cache it
    await supabase.from("push_message_cache").upsert(
      {
        date: today,
        slot,
        timezone: tz,
        title,
        body,
        url,
      },
      { onConflict: "date,slot,timezone" }
    );

    console.log('[generate-text] final_payload', { title, body, url, slot, timezone: tz });
    return NextResponse.json({ title, body, url });
  } catch (e) {
    console.error("generate-text error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

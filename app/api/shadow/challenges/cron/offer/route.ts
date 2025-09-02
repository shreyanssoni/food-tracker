import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { geminiText } from "@/utils/ai";

// POST /api/shadow/challenges/cron/offer
// Secured by x-cron-secret == process.env.CRON_SECRET
// For all users with a shadow_profile: if they have 0 active challenges and
// their last challenge was created > 2 days ago (or none at all), create a new offered challenge.
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET || "";
    const header = (req.headers.get("x-cron-secret") || "").trim();
    if (!secret || header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Fetch all users that have a shadow_profile (acts as the roster for Shadow)
    const { data: profiles, error: spErr } = await admin
      .from("shadow_profile")
      .select("id, user_id, preferences")
      .limit(100000);
    if (spErr) {
      return NextResponse.json({ error: spErr.message }, { status: 500 });
    }

    const activeStates = ["offered", "accepted"];
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let processed = 0;
    let created = 0;
    const failures: Array<{ user_id: string; error: string }> = [];

    for (const p of profiles || []) {
      const userId = String(p.user_id);
      const shadowProfileId = String(p.id);
      processed += 1;

      try {
        // 1) Check active challenges
        const { count: activeCount, error: acErr } = await admin
          .from("challenges")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .in("state", activeStates);
        if (acErr) throw acErr;

        if ((activeCount || 0) > 0) {
          continue; // has active; skip
        }

        // 2) Find most recent challenge
        const { data: last, error: lastErr } = await admin
          .from("challenges")
          .select("id, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (lastErr) throw lastErr;

        let lastOk = false;
        if (!last || last.length === 0) {
          lastOk = true; // no challenge ever
        } else {
          const createdAt = new Date(last[0].created_at).getTime();
          lastOk = now - createdAt > twoDaysMs;
        }

        if (!lastOk) continue;

        // 3) Create a new offered challenge
        // Build a concise challenge line using AI with fallback (similar to generate-daily personalization)
        let title = "Sharpen your edge";
        let description = "Beat the Shadow on a focused task today.";
        try {
          const prompt = `Generate one concise, single-sentence daily self-discipline challenge for a user. Preferences: ${JSON.stringify(p.preferences ?? {})}. Output only the sentence, no quotes.`;
          const ai = await geminiText(prompt);
          if (ai && typeof ai === "string") {
            const line = ai.trim().split("\n")[0].trim();
            if (line && line.length <= 140) {
              title = line;
              description = line;
            }
          }
        } catch {}

        const task_template = {
          title,
          description,
        } as const;
        const due_time = new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString();
        const { data: createdCh, error: chErr } = await admin
          .from("challenges")
          .insert({
            user_id: userId,
            shadow_profile_id: shadowProfileId,
            state: "offered",
            win_condition_type: "before_time",
            base_ep: 10,
            reward_multiplier: 1,
            generated_by: "rule",
            task_template: task_template as any,
            due_time,
          })
          .select("id")
          .maybeSingle();
        if (chErr) throw chErr;
        created += 1;

        // 4) Create focused + push notification to prompt accept/decline
        try {
          const origin = (() => {
            try {
              return new URL((req as any).url).origin;
            } catch {
              return "";
            }
          })();
          const url = createdCh?.id
            ? `/shadow/challenges/${createdCh.id}?challenge_id=${createdCh.id}`
            : "/shadow";
          if (origin) {
            await fetch(`${origin}/api/notify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-cron-secret": secret,
              },
              body: JSON.stringify({
                userId,
                focused: true,
                push: true,
                title: "[HIGH] Challenge Offer",
                body: description,
                url,
              }),
            }).catch(() => {});
          }
        } catch {}
      } catch (e: any) {
        failures.push({ user_id: userId, error: e?.message || "unknown" });
      }
    }

    return NextResponse.json({ ok: true, processed, created, failures });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

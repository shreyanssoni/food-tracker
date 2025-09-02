import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/utils/auth";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createClient();

    // Load challenge
    const { data: challenge, error: cErr } = await supabase
      .from("challenges")
      .select(
        "id, user_id, shadow_profile_id, state, base_ep, reward_multiplier, task_template, start_time, due_time"
      )
      .eq("id", params.id)
      .single();
    if (cErr) throw cErr;
    if (!challenge || challenge.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (challenge.state !== "offered") {
      return NextResponse.json(
        { error: "Challenge not in offered state" },
        { status: 400 }
      );
    }

    const tpl = challenge.task_template || {};
    const title = tpl.title || "Challenge Task";
    const description =
      tpl.description || tpl.summary || "Shadow challenge task";
    const ep_value = Number(challenge.base_ep || 10);

    // Create the user task for this challenge (non-breaking: use existing schema fields)
    const { data: task, error: tErr } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        title,
        description,
        ep_value,
        min_level: 1,
        // new columns (safe to include; additive in schema)
        owner_type: "user",
        owner_id: user.id,
        origin: "ai_shadow",
        category: "challenge",
        challenge_id: challenge.id,
      } as any)
      .select("id")
      .single();
    if (tErr) throw tErr;

    // Create the shadow twin task (parent_task_id -> user task)
    const { data: shadowTask, error: sErr } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id, // keep user ownership for RLS; owner_type/owner_id carries shadow identity
        title: `${title} (Shadow)`,
        description,
        ep_value,
        min_level: 1,
        owner_type: "shadow",
        owner_id: challenge.shadow_profile_id,
        origin: "ai_shadow",
        category: "challenge",
        challenge_id: challenge.id,
        parent_task_id: task.id,
      } as any)
      .select("id")
      .single();
    if (sErr) throw sErr;

    // Resolve user's timezone (fallback to DEFAULT_TIMEZONE)
    let tz = process.env.DEFAULT_TIMEZONE || "Asia/Kolkata";
    try {
      const { data: pref } = await supabase
        .from("user_preferences")
        .select("timezone")
        .eq("user_id", user.id)
        .maybeSingle();
      if (pref?.timezone) tz = String(pref.timezone);
    } catch {}

    // If challenge has a due_time, create one-time schedules for both tasks
    if (challenge.due_time) {
      const due = new Date(challenge.due_time as any);
      // derive local wall date/time in user's timezone
      const start_date = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()); // YYYY-MM-DD in local tz
      const at_time = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(due); // HH:MM in local tz
      const timezone = tz;

      // user task schedule
      const { error: usErr } = await supabase
        .from("task_schedules")
        .insert({
          task_id: task.id,
          frequency: "once",
          byweekday: null,
          at_time,
          timezone,
          start_date,
          end_date: start_date,
        });
      if (usErr) throw usErr;

      // shadow task schedule
      const { error: ssErr } = await supabase
        .from("task_schedules")
        .insert({
          task_id: shadowTask.id,
          frequency: "once",
          byweekday: null,
          at_time,
          timezone,
          start_date,
          end_date: start_date,
        });
      if (ssErr) throw ssErr;
    } else {
      // No explicit due time: ensure the task appears in Today's list by creating a one-time schedule for today
      // Compute today's date string in user's timezone
      const todayStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      // at_time is not used by the Today filter, but keep a sane default HH:MM
      const at_time = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date()); // HH:MM in local tz

      // user task schedule (one-time today)
      const { error: usErr2 } = await supabase
        .from("task_schedules")
        .insert({
          task_id: task.id,
          frequency: "once",
          byweekday: null,
          at_time,
          timezone: tz,
          start_date: todayStr,
          end_date: todayStr,
        });
      if (usErr2) throw usErr2;

      // shadow task schedule (one-time today)
      const { error: ssErr2 } = await supabase
        .from("task_schedules")
        .insert({
          task_id: shadowTask.id,
          frequency: "once",
          byweekday: null,
          at_time,
          timezone: tz,
          start_date: todayStr,
          end_date: todayStr,
        });
      if (ssErr2) throw ssErr2;
    }

    // Update challenge state and linkage
    const { error: uErr } = await supabase
      .from("challenges")
      .update({
        state: "accepted",
        linked_user_task_id: task.id,
        linked_shadow_task_id: shadowTask.id,
      })
      .eq("id", challenge.id);
    if (uErr) throw uErr;

    return NextResponse.json({
      ok: true,
      user_task_id: task.id,
      shadow_task_id: shadowTask.id,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

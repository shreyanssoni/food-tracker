import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentUser } from "@/utils/auth";

// GET: list goals with simple progress flags
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = createClient();

    const { data: goals, error } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    // For each goal, compute weekly success summary with helper function
    const summaries: Record<
      string,
      { totalWeeks: number; successWeeks: number }
    > = {};
    for (const g of goals || []) {
      const { data: rows } = await supabase.rpc("fn_goal_weekly_success", {
        p_goal_id: g.id,
      });
      // Only count weeks up to the current week (exclude future weeks)
      const now = new Date();
      const startOfThisWeek = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      startOfThisWeek.setDate(
        startOfThisWeek.getDate() - startOfThisWeek.getDay()
      ); // Sunday as week start
      const filtered = (rows || []).filter((r: any) => {
        const wk = new Date(r.week_start);
        // Compare by date only
        const wkDate = new Date(wk.getFullYear(), wk.getMonth(), wk.getDate());
        return wkDate <= startOfThisWeek;
      });
      const totalWeeks = filtered.length;
      const successWeeks = filtered.filter((r: any) => r.success).length;
      summaries[g.id] = { totalWeeks, successWeeks };
    }

    return NextResponse.json({ goals: goals || [], summaries });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

// POST: create a goal with templates, materialize tasks, and create a private collectible with min price
// Body: { title, description?, deadline, templates: [{ title, description?, ep_value, frequency, times_per_period, byweekday? }], collectible?: { name, icon?, price? } }
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = createClient();
    const body = await req.json();

    const {
      title,
      description,
      deadline,
      templates = [],
      collectible,
    } = body || {};
    if (
      !title ||
      !deadline ||
      !Array.isArray(templates) ||
      templates.length === 0
    ) {
      return NextResponse.json(
        { error: "Missing title, deadline, or templates" },
        { status: 400 }
      );
    }

    // Basic server-side validation
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const deadlineDate = new Date(deadline);
    if (!(deadlineDate instanceof Date) || isNaN(deadlineDate.getTime())) {
      return NextResponse.json({ error: "Invalid deadline" }, { status: 400 });
    }
    if (deadlineDate <= startOfToday) {
      return NextResponse.json(
        { error: "Deadline must be a future date" },
        { status: 400 }
      );
    }
    // Anti-abuse guardrails
    const MAX_ACTIVE_GOALS = 3;
    const MAX_TEMPLATES_PER_GOAL = 5;
    const MAX_TIMES_PER_PERIOD = 7; // per week or period
    const WEEKLY_EP_CAP = 300; // total weekly EP across all templates in a goal

    // Limit active goals per user
    const { data: activeGoals, error: agErr } = await supabase
      .from("goals")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active");
    if (agErr) throw agErr;
    if ((activeGoals?.length || 0) >= MAX_ACTIVE_GOALS) {
      return NextResponse.json(
        { error: `You can have at most ${MAX_ACTIVE_GOALS} active goals.` },
        { status: 400 }
      );
    }

    if (templates.length > MAX_TEMPLATES_PER_GOAL) {
      return NextResponse.json(
        { error: `Limit ${MAX_TEMPLATES_PER_GOAL} templates per goal.` },
        { status: 400 }
      );
    }

    for (const t of templates) {
      if (typeof t.ep_value !== "number" || t.ep_value < 0) {
        return NextResponse.json(
          { error: "EP value must be a non-negative number" },
          { status: 400 }
        );
      }
      if (t.ep_value > 100) {
        return NextResponse.json(
          { error: "EP value cannot exceed 100" },
          { status: 400 }
        );
      }
      if (typeof t.times_per_period !== "number" || t.times_per_period < 1) {
        return NextResponse.json(
          { error: "times_per_period must be at least 1" },
          { status: 400 }
        );
      }
      if (t.times_per_period > MAX_TIMES_PER_PERIOD) {
        return NextResponse.json(
          { error: `times_per_period cannot exceed ${MAX_TIMES_PER_PERIOD}` },
          { status: 400 }
        );
      }
    }

    // Cap total weekly EP across templates
    let weeklyEpFromTemplates = 0;
    for (const t of templates) {
      if ((t.frequency || "weekly") === "weekly") {
        weeklyEpFromTemplates +=
          Math.min(100, t.ep_value ?? 10) *
          Math.min(MAX_TIMES_PER_PERIOD, t.times_per_period ?? 1);
      }
    }
    if (weeklyEpFromTemplates > WEEKLY_EP_CAP) {
      return NextResponse.json(
        {
          error: `Total weekly EP across templates capped at ${WEEKLY_EP_CAP}. Reduce EP or frequency.`,
        },
        { status: 400 }
      );
    }

    // Idempotency guard: if the same goal (title+deadline) was just created, return it instead
    const windowMs = 15000; // 15s
    const recentIso = new Date(Date.now() - windowMs).toISOString();
    const { data: existing } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .eq("title", title)
      .eq("deadline", deadline)
      .gte("created_at", recentIso)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ goal: existing, collectible: null });
    }

    // 1) Create goal
    // Use a date-only start_date to avoid timezone drift into previous week
    const startDateStr = new Date(
      startOfToday.getFullYear(),
      startOfToday.getMonth(),
      startOfToday.getDate()
    )
      .toISOString()
      .slice(0, 10);
    const { data: goal, error: gErr } = await supabase
      .from("goals")
      .insert({
        user_id: user.id,
        title,
        description,
        deadline,
        start_date: startDateStr,
      })
      .select("*")
      .single();
    if (gErr) throw gErr;

    // 2) Create goal_task_templates
    const templatesRows = templates.map((t: any) => ({
      goal_id: goal.id,
      title: t.title,
      description: t.description || null,
      ep_value: Math.min(100, t.ep_value ?? 10),
      frequency: t.frequency || "weekly",
      times_per_period: Math.min(MAX_TIMES_PER_PERIOD, t.times_per_period ?? 1),
      byweekday: t.byweekday || null,
    }));
    const { data: tpl, error: tErr } = await supabase
      .from("goal_task_templates")
      .insert(templatesRows)
      .select("*");
    if (tErr) throw tErr;

    // 3) Materialize tasks and schedules per template
    for (const t of tpl || []) {
      // Create a task owned by the user, unlocked immediately
      const { data: taskRow, error: taskErr } = await supabase
        .from("tasks")
        .insert({
          user_id: user.id,
          title: t.title,
          description: t.description,
          ep_value: t.ep_value,
          is_system: false,
          min_level: 1,
        })
        .select("id")
        .single();
      if (taskErr) throw taskErr;

      const schedule: any = {
        task_id: taskRow.id,
        frequency: t.frequency,
        byweekday: t.byweekday || null,
      };
      const { error: schedErr } = await supabase
        .from("task_schedules")
        .insert(schedule);
      if (schedErr) throw schedErr;

      const { error: linkErr } = await supabase
        .from("goal_tasks")
        .insert({
          goal_id: goal.id,
          template_id: t.id || t,
          task_id: taskRow.id,
        });
      if (linkErr) throw linkErr;
    }

    // 4) Create a private collectible for this goal (optional)
    let createdCollectible: any = null;
    if (collectible?.name) {
      // Compute minimum price rule: 3x weekly EP total
      let weeklyEp = 0;
      for (const t of tpl || []) {
        if (t.frequency === "weekly")
          weeklyEp += (t.ep_value ?? 10) * (t.times_per_period ?? 1);
      }
      // Keep minPrice proportional but don't let it be trivially low
      const minPrice = Math.max(50, Math.floor(weeklyEp * 3));
      const inputPrice = collectible?.price ?? minPrice;
      const price = Math.max(minPrice, inputPrice);

      const { data: col, error: cErr } = await supabase
        .from("collectibles")
        .insert({
          name: collectible.name,
          icon: collectible.icon || null,
          rarity: "rare",
          is_private: true,
          owner_user_id: user.id,
        })
        .select("*")
        .single();
      if (cErr) throw cErr;
      createdCollectible = col;

      // Add to store for owner only (filtering enforced in APIs)
      const { error: sErr } = await supabase
        .from("collectibles_store")
        .insert({ collectible_id: col.id, price, active: true });
      if (sErr) throw sErr;

      // Link goal collectible and gating requirements
      const [{ error: gcErr }, { error: reqErr }] = await Promise.all([
        supabase
          .from("goal_collectibles")
          .insert({ goal_id: goal.id, collectible_id: col.id }),
        supabase.from("collectibles_requirements").insert({
          collectible_id: col.id,
          min_level: 1,
          required_badge_id: null,
          required_goal_id: goal.id,
          require_goal_success: true,
        }),
      ]);
      if (gcErr) throw gcErr;
      if (reqErr) throw reqErr;
    }

    return NextResponse.json({ goal, collectible: createdCollectible });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

// PATCH: update a goal's basic fields (title, description, deadline)
// Usage: PATCH /api/goals?id=GOAL_ID with JSON { title?, description?, deadline? }
export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id)
      return NextResponse.json({ error: "Missing goal id" }, { status: 400 });
    const supabase = createClient();

    // Ensure ownership
    const { data: goal, error: gErr } = await supabase
      .from("goals")
      .select("id, user_id")
      .eq("id", id)
      .single();
    if (gErr) throw gErr;
    if (!goal || goal.user_id !== user.id)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const patch: any = {};
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.description === "string" || body.description === null)
      patch.description = body.description;
    if (typeof body.deadline === "string") {
      const d = new Date(body.deadline);
      if (!(d instanceof Date) || isNaN(d.getTime()))
        return NextResponse.json(
          { error: "Invalid deadline" },
          { status: 400 }
        );
      const today = new Date();
      const startOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      if (d <= startOfToday)
        return NextResponse.json(
          { error: "Deadline must be a future date" },
          { status: 400 }
        );
      patch.deadline = body.deadline;
    }
    if (Object.keys(patch).length === 0)
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    const { data: updated, error: uErr } = await supabase
      .from("goals")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (uErr) throw uErr;
    return NextResponse.json({ goal: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

// DELETE: delete a goal (relies on FK cascades if configured)
// Usage: DELETE /api/goals?id=GOAL_ID
export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id)
      return NextResponse.json({ error: "Missing goal id" }, { status: 400 });
    const supabase = createClient();

    // Ensure ownership
    const { data: goal, error: gErr } = await supabase
      .from("goals")
      .select("id, user_id")
      .eq("id", id)
      .single();
    if (gErr) throw gErr;
    if (!goal || goal.user_id !== user.id)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 1) Delete tasks that were created for this goal (via goal_tasks link)
    // Note: FK in goal_tasks points to tasks (ON DELETE CASCADE), so deleting tasks first
    // will also clean up goal_tasks rows. Then we delete the goal to cascade the rest.
    const { data: links, error: linkErr } = await supabase
      .from("goal_tasks")
      .select("task_id")
      .eq("goal_id", id);
    if (linkErr) throw linkErr;
    const taskIds = (links || []).map((r: any) => r.task_id).filter(Boolean);
    if (taskIds.length > 0) {
      const { data: deletedTasks, error: delTasksErr } = await supabase
        .from("tasks")
        .delete()
        .in("id", taskIds)
        .eq("user_id", user.id)
        .select("id");
      if (delTasksErr) throw delTasksErr;
      // Optional: you could check if some tasks failed to delete; we won't hard-fail here
    }

    const { data: collectibles, error: cErr } = await supabase
      .from("goal_collectibles")
      .select("collectible_id")
      .eq("goal_id", id);
    if (cErr) throw cErr;
    const collectibleIds = (collectibles || [])
      .map((r: any) => r.collectible_id)
      .filter(Boolean);
    if (collectibleIds.length > 0) {
      // Use admin client for privileged deletes only
      const admin = createAdminClient();

      const { data: deletedCollectibles, error: delCollectiblesErr } =
        await admin
          .from("collectibles")
          .delete()
          .in("id", collectibleIds)
          .select("id");
      if (delCollectiblesErr) throw delCollectiblesErr;

      const { data: deletedCollectiblesReq, error: delCollectiblesReqErr } =
        await admin
          .from("collectibles_requirements")
          .delete()
          .in("collectible_id", collectibleIds)
          .select("collectible_id");
      if (delCollectiblesReqErr) throw delCollectiblesReqErr;

      const { data: deleteGoalCollectibles, error: delGoalCollectiblesErr } =
        await admin
          .from("goal_collectibles")
          .delete()
          .in("collectible_id", collectibleIds)
          .select("collectible_id");
      if (delCollectiblesReqErr) throw delCollectiblesReqErr;
      // Optional: you could check if some collectibles failed to delete; we won't hard-fail here
    }

    // 2) Delete the goal (will cascade goal_task_templates, goal_collectibles, etc.)
    const { data: deletedGoals, error: dErr } = await supabase
      .from("goals")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id");
    if (dErr) throw dErr;
    if (!deletedGoals || deletedGoals.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

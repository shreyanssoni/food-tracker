import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { geminiText } from '@/utils/ai';

export const runtime = 'edge';

function buildPrompt(params: {
  type: 'home' | 'gym';
  duration_min: number;
  muscles: string[];
  intensity: 'beginner' | 'intermediate' | 'advanced' | 'pro';
  instructions?: string;
  profile?: {
    height_cm?: number | null;
    weight_kg?: number | null;
    age?: number | null;
    gender?: string | null;
    activity_level?: string | null;
    goal?: string | null;
    workout_level?: string | null;
  } | null;
}) {
  const { type, duration_min, muscles, intensity, profile, instructions } = params;
  const profileText = profile
    ? `User profile (for personalization): height_cm=${profile.height_cm ?? 'n/a'}, weight_kg=${profile.weight_kg ?? 'n/a'}, age=${profile.age ?? 'n/a'}, gender=${profile.gender ?? 'n/a'}, activity_level=${profile.activity_level ?? 'n/a'}, goal=${profile.goal ?? 'n/a'}, workout_level=${profile.workout_level ?? 'n/a'}.`
    : 'No profile available.';
  const musclesText = muscles.length ? muscles.join(', ') : 'full body';

  const userInstr = (instructions && String(instructions).trim().length > 0)
    ? `HIGH-PRIORITY USER INSTRUCTIONS: ${String(instructions).trim()}`
    : `If the user provided specific instructions, follow them. Otherwise, keep guidance practical and concise.`;

  return `You are an evidence-based strength & conditioning coach. Create a ${duration_min}-minute ${type} workout targeting ${musclesText} for a ${intensity} trainee.

${profileText}
${userInstr}

Strict output requirements:
- OUTPUT STRICTLY VALID, SEMANTIC HTML (no markdown). Do not include <style> or <script> tags. Use only standard tags and Tailwind utility classes.
- Use Tailwind classes so it renders like a polished plan similar to Hevy: clear sections, cards, badges, spacing.
- Avoid inline event handlers and external links.
- Use <details> with <summary> to make sections collapsible. Each exercise in "Main Sets" should be a <details> item with a <summary> header containing the name and set/rep summary.
- Do not format the HTML with code blocks. Return raw HTML only.

Layout (example structure, adapt as needed):
<div class="space-y-4">
  <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 shadow-sm">
    <h1 class="text-xl font-semibold">Workout Plan</h1>
    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">One-line summary…</p>
  </div>
  <section class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 shadow-sm">
    <details open>
      <summary class="cursor-pointer select-none text-lg font-semibold flex items-center gap-2">
        <span class="inline-flex px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">Warm-up</span>
        <span class="text-sm text-gray-500">(5–8 min)</span>
      </summary>
      <ul class="mt-2 list-disc pl-5 space-y-1 text-sm">
        <li>…</li>
      </ul>
    </details>
  </section>
  <section class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 shadow-sm">
    <h2 class="text-lg font-semibold">Main Sets</h2>
    <ol class="mt-2 space-y-3">
      <li>
        <details class="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
          <summary class="cursor-pointer select-none flex justify-between items-start">
            <div class="font-medium">Exercise name</div>
            <div class="text-xs text-gray-500">3×8 @RPE 7 • Rest 90s</div>
          </summary>
          <div class="text-sm text-gray-600 dark:text-gray-400 mt-2">Notes/tempo/alternatives…</div>
          <div class="mt-2 flex flex-wrap gap-2">
            <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Optional drop set</span>
            <span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Optional PR set</span>
          </div>
        </details>
      </li>
    </ol>
  </section>
  <section class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 shadow-sm">
    <details>
      <summary class="cursor-pointer select-none text-lg font-semibold">Cooldown (3–5 min)</summary>
      <ul class="mt-2 list-disc pl-5 space-y-1 text-sm">
        <li>…</li>
      </ul>
    </details>
  </section>
  <section class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 shadow-sm">
    <details>
      <summary class="cursor-pointer select-none text-lg font-semibold">Progression Notes</summary>
      <ul class="mt-2 list-disc pl-5 space-y-1 text-sm">
        <li>…</li>
      </ul>
    </details>
  </section>
</div>`;
}

function buildEditPrompt(params: {
  current_plan_html: string;
  change_request: string;
  profile?: {
    height_cm?: number | null;
    weight_kg?: number | null;
    age?: number | null;
    gender?: string | null;
    activity_level?: string | null;
    goal?: string | null;
    workout_level?: string | null;
  } | null;
}) {
  const { current_plan_html, change_request, profile } = params;
  const profileText = profile
    ? `User profile (for personalization): height_cm=${profile.height_cm ?? 'n/a'}, weight_kg=${profile.weight_kg ?? 'n/a'}, age=${profile.age ?? 'n/a'}, gender=${profile.gender ?? 'n/a'}, activity_level=${profile.activity_level ?? 'n/a'}, goal=${profile.goal ?? 'n/a'}, workout_level=${profile.workout_level ?? 'n/a'}.`
    : 'No profile available.';

  return `You are an evidence-based strength & conditioning coach and a careful HTML editor.

Update the existing workout plan HTML based on the user's change request. Modify only what is necessary; keep the overall structure, sections, and styling consistent. Prefer swapping exercises with close alternatives that match the same movement pattern and intensity. Maintain time budget and progression notes.

${profileText}

Strict output requirements:
- Return RAW HTML only (no markdown, no code fences). Use the same Tailwind-style structure: cards, badges, <details>/<summary> expanders.
- Preserve existing headings and section order. If replacing an exercise, keep its list position but change its content/details appropriately.
- Do not include <style> or <script> tags. Avoid inline event handlers.

User change request:
"""${change_request}"""

Current plan HTML:
<CURRENT_PLAN>
${current_plan_html}
</CURRENT_PLAN>

Return the full, updated HTML.`;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json().catch(() => ({}));
    const type = (body.type as 'home' | 'gym') || 'gym';
    const duration_min = Math.max(15, Math.min(120, Number(body.duration_min) || 45));
    const muscles: string[] = Array.isArray(body.muscles) ? body.muscles.slice(0, 12) : [];
    const intensity = (body.intensity as 'beginner' | 'intermediate' | 'advanced' | 'pro') || 'beginner';
    const instructions = typeof body.instructions === 'string' ? body.instructions : '';
    const current_plan_html = typeof body.current_plan_html === 'string' ? body.current_plan_html : '';
    const change_request = typeof body.change_request === 'string' ? body.change_request : '';

    // Try to fetch current user and preferences
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let profile: any = null;
    if (user?.id) {
      const { data } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();
      profile = data || null;
    }

    const isEdit = current_plan_html && change_request;
    const prompt = isEdit
      ? buildEditPrompt({ current_plan_html, change_request, profile })
      : buildPrompt({ type, duration_min, muscles, intensity, instructions, profile });
    let html = await geminiText(prompt);
    // Strip accidental Markdown code fences (```html ... ``` or ``` ... ```)
    if (typeof html === 'string') {
      const fenceRegex = /^```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/;
      const m = html.match(fenceRegex);
      if (m && m[1]) html = m[1];
      // Also handle leading/trailing fences without trailing newline
      html = html.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return NextResponse.json({ plan_html: html, meta: { type, duration_min, muscles, intensity, edited: !!isEdit } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to generate workout' }, { status: 500 });
  }
}

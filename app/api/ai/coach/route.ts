import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createClient } from '@/utils/supabase/server';
import { geminiText } from '@/utils/ai';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from('coach_messages')
    .select('id, role, content, context, created_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data || [] });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const userMessage: string = (body?.message || '').toString().trim();
    if (!userMessage) return NextResponse.json({ error: 'Missing message' }, { status: 400 });

    const supabase = createClient();

    // Persist user message first
    const { error: insertUserErr } = await supabase
      .from('coach_messages')
      .insert({ user_id: session.user.id, role: 'user', content: userMessage, context: {} });
    if (insertUserErr) throw insertUserErr;

    // Load context: recent chat, today logs, preferences/profile, and running summary
    const [chatRes, logsRes, prefsRes, stateRes] = await Promise.all([
      supabase
        .from('coach_messages')
        .select('role, content, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true })
        .limit(20),
      // Recent logs and today's totals
      supabase
        .from('food_logs')
        .select('*')
        .eq('user_id', session.user.id)
        .order('eaten_at', { ascending: false })
        .limit(30),
      supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      supabase
        .from('coach_state')
        .select('summary, key_facts, prefs_snapshot')
        .eq('user_id', session.user.id)
        .maybeSingle(),
    ]);

    const chat = chatRes.data || [];
    const logs = logsRes.data || [];
    const prefs = prefsRes.data || null;
    const runningSummary: string = (stateRes.data as any)?.summary || '';
    const existingKeyFacts: string[] = ((stateRes.data as any)?.key_facts ?? []) as string[];
    const existingPrefsSnapshot: any = (stateRes.data as any)?.prefs_snapshot ?? {};

    const totals = (logs || []).reduce(
      (acc: any, l: any) => {
        acc.calories += Number(l.calories || 0);
        acc.protein_g += Number(l.protein_g || 0);
        acc.carbs_g += Number(l.carbs_g || 0);
        acc.fat_g += Number(l.fat_g || 0);
        return acc;
      },
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );

    const foodsList = (logs || [])
      .map((l: any) => (Array.isArray(l.items) ? l.items.map((i: any) => i.name).join(', ') : ''))
      .filter(Boolean)
      .slice(0, 20)
      .join(' | ');

    // Determine if latest message is a greeting; if so, don't inject long-term summary
    const latestText = (userMessage || '').toLowerCase();
    const isGreetingOnly = /^(hi|hello|hey|yo|sup|good\s*(morning|afternoon|evening))\b/.test(latestText);
    const summaryForPrompt = isGreetingOnly ? '' : runningSummary;

    // Build prompt with running summary (guarded) + chat history + context
    const historyText = chat
      .slice(-15)
      .map((m: any) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
      .join('\n');

    const prompt = `You are an empathetic nutrition coach. Be supportive, concise, and actionable. Use the context but do not reveal raw data unless useful.
Important: Prioritize the LATEST user message. If it uses pronouns like "it/that/this" or is an ellipsis follow-up (e.g., "how to make it"), assume it refers to the most recent assistant meal suggestion.

Conversation summary to maintain continuity (use implicitly): ${summaryForPrompt || '(none)'}

Persistent key facts to remember (implicit, don't repeat unless relevant): ${JSON.stringify(existingKeyFacts || [])}
Preferences snapshot (implicit): ${JSON.stringify(existingPrefsSnapshot || {})}

User profile/preferences: ${JSON.stringify(prefs || {})}
Today's totals (approx): ${JSON.stringify(totals)}
Recent foods: ${foodsList || 'No logs yet'}

Chat so far:\n${historyText || '(start of conversation)'}\nUser: ${userMessage}\nCoach:`;

    let reply = '';
    const AI_DEBUG = String(process.env.AI_DEBUG || '').toLowerCase() === 'true';
    // Retry Gemini up to 2 times with a shorter prompt fallback
    const shortPrompt = `You are a concise nutrition coach. Answer briefly and specifically.\nUser: ${userMessage}\nCoach:`;
    if (!AI_DEBUG) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await geminiText(attempt === 0 ? prompt : shortPrompt);
          reply = (res || '').trim();
          if (reply) break;
        } catch (e) {
          if (attempt === 1) {
            // proceed to local fallback
          }
        }
      }
    }

    if (!reply) {
      // Intent-aware local fallback
      const text = (userMessage || '').toLowerCase();
      const isGreeting = /^(hi|hello|hey|yo|sup|good\s*(morning|afternoon|evening))\b/.test(text);
      const mealIntent = /(dinner|lunch|breakfast|snack|what\s*to\s*eat|meal\s*(idea|plan)|eat\s*(now|today|tonight))/i.test(text);
      const cookingIntent = /(how\s*to\s*make|recipe|how\s*do\s*i\s*cook|prepare|steps|instructions)/i.test(text);

      if (isGreeting && !mealIntent) {
        reply = `Hi! How can I help today? I can suggest meals, adjust macros, or review your recent logs.`;
      } else if (mealIntent) {
        // Meal guidance using totals and prefs, scaled by meal type
        const remaining = {
          calories: Math.max(0, (prefs?.daily_calorie_goal ?? 0) - (totals.calories || 0)),
          protein_g: Math.max(0, (prefs?.protein_goal_grams ?? 0) - (totals.protein_g || 0)),
          carbs_g: Math.max(0, (prefs?.carbs_goal_grams ?? 0) - (totals.carbs_g || 0)),
          fat_g: Math.max(0, (prefs?.fat_goal_grams ?? 0) - (totals.fat_g || 0)),
        };
        const lower = (s: string) => s.toLowerCase();
        const mealType: 'breakfast'|'lunch'|'dinner'|'snack' =
          /breakfast/.test(lower(text)) ? 'breakfast' :
          /lunch/.test(lower(text)) ? 'lunch' :
          /dinner|tonight/.test(lower(text)) ? 'dinner' :
          'snack';
        const fractions: Record<typeof mealType, number> = {
          breakfast: 0.25,
          lunch: 0.35,
          dinner: 0.4,
          snack: 0.15,
        } as any;
        const f = fractions[mealType] || 0.3;
        const target = {
          protein_g: Math.max(15, Math.round((remaining.protein_g || 60) * f / 5) * 5),
          carbs_g: Math.max(20, Math.round((remaining.carbs_g || 120) * f / 5) * 5),
          fat_g: Math.max(8, Math.round((remaining.fat_g || 50) * f / 5) * 5),
        };

        const diet = (prefs?.dietary_restrictions || []) as string[];
        const veg = diet?.some((d) => /vegetarian|vegan/.test(String(d)));
        const avoid = diet && diet.length ? ` Avoid: ${diet.join(', ')}.` : '';

        const examplesByMeal = {
          breakfast: veg
            ? 'Greek yogurt or soy yogurt with berries and granola; tofu scramble with whole‑grain toast; oatmeal with peanut butter.'
            : 'Egg scramble with veggies and whole‑grain toast; Greek yogurt with berries and granola; oatmeal with peanut butter.',
          lunch: veg
            ? 'Tofu bowl with quinoa, roasted veg, tahini; chickpea salad wrap; lentil soup with side salad.'
            : 'Grilled chicken bowl with rice and veggies; turkey wrap; salmon salad with quinoa.',
          dinner: veg
            ? 'Tofu or paneer stir‑fry with brown rice; lentil curry with quinoa; veggie fajitas with beans.'
            : 'Grilled chicken or salmon with rice/quinoa and veggies; turkey chili; shrimp stir‑fry.',
          snack: veg
            ? 'Apple + peanut butter; hummus + carrots; protein smoothie with almond milk.'
            : 'Greek yogurt; cottage cheese + fruit; beef jerky + fruit; protein smoothie.',
        } as const;

        reply = `For ${mealType}, aim roughly for protein ~${target.protein_g}g, carbs ~${target.carbs_g}g, fats ~${target.fat_g}g. Ideas: ${examplesByMeal[mealType]}${avoid} Tell me what you’re craving or what’s in your kitchen and I’ll tailor it.`;
      } else if (cookingIntent) {
        // Simple recipe steps for last suggested meal or default
        const lastAssistant = [...chat].reverse().find((m: any) => m.role === 'assistant');
        const lastText: string = (lastAssistant?.content || '').toLowerCase();
        const diet = (prefs?.dietary_restrictions || []) as string[];
        const vegetarian = diet?.some((d) => /vegetarian|vegan/.test(String(d)));
        let protein = 'chicken';
        if (vegetarian) protein = 'tofu';
        else if (/salmon|fish/.test(lastText)) protein = 'salmon';
        else if (/tofu|paneer/.test(lastText)) protein = 'tofu';
        else if (/chicken/.test(lastText)) protein = 'chicken';

        const baseCarb = /rice|quinoa/.test(lastText) ? (lastText.includes('quinoa') ? 'quinoa' : 'brown rice') : 'quinoa';
        reply = `Here’s a quick way to make ${protein} with ${baseCarb} and veggies:
1) Prep: Cut veggies (broccoli/peppers), rinse ${baseCarb}. If ${protein==='tofu'?'tofu':'chicken'}, pat dry and cut into cubes.
2) Cook ${baseCarb}: Simmer per package (quinoa ~15 min; brown rice ~30-40 min).
3) Season ${protein}: Salt, pepper, garlic; add paprika/chili if you like.
4) Sear: Heat 1 tbsp olive oil. Sear ${protein} until browned (tofu ~6–8 min; chicken ~6–8 min each side to 74°C/165°F; salmon ~3–4 min/side).
5) Veggies: In same pan, add veggies 4–6 min; salt/pepper. Optionally splash soy/lemon.
6) Plate: ${baseCarb} + ${protein} + veggies. Add a drizzle of olive oil or yogurt sauce.
Want a specific cuisine or ingredient list? Tell me what you have at home.`;
      } else {
        reply = `I’m here to help with meals, macros, and habits. Ask me anything or share what you need right now.`;
      }
    }

    const contextPayload = { totals, foodsPreview: foodsList, prefsSummary: prefs };

    const { error: insertAssistantErr, data: assistantInsert } = await supabase
      .from('coach_messages')
      .insert({ user_id: session.user.id, role: 'assistant', content: reply, context: contextPayload })
      .select('id, role, content, context, created_at')
      .maybeSingle();

    if (insertAssistantErr) throw insertAssistantErr;

    // Update running summary with a compact memory of the conversation
    if (!AI_DEBUG) try {
      const summaryPrompt = `Update the following running conversation summary (<= 500 characters) to include new relevant facts, preferences, goals, decisions, and unresolved questions. Keep it compact and neutral.

Current summary: ${runningSummary || '(empty)'}
Latest exchange:
User: ${userMessage}
Coach: ${reply}

Return only the updated summary text.`;
      const newSummary = (await geminiText(summaryPrompt)).trim().slice(0, 1000);
      // Update key facts: keep concise bullets (< 12 words), max 10 items, JSON array of strings
      let newKeyFacts = existingKeyFacts;
      try {
        const factsPrompt = `Given current key facts (JSON array) and the latest exchange, return an UPDATED JSON array of succinct key facts to remember about the user (max 10 items, each < 12 words). Only output minified JSON array.

Current key facts: ${JSON.stringify(existingKeyFacts || [])}
Latest exchange: User: ${userMessage} | Coach: ${reply}`;
        const factsRaw = await geminiText(factsPrompt);
        // Extract JSON array heuristically
        const s = factsRaw.indexOf('[');
        const e = factsRaw.lastIndexOf(']');
        const cand = s !== -1 && e !== -1 && e > s ? factsRaw.slice(s, e + 1) : factsRaw;
        const parsed = JSON.parse(cand);
        if (Array.isArray(parsed)) newKeyFacts = parsed.slice(0, 10).map((x) => String(x));
      } catch {}

      // Build prefs snapshot from current prefs (selected fields)
      const prefsSnapshot = prefs ? {
        gender: prefs.gender ?? null,
        age: prefs.age ?? null,
        height_cm: prefs.height_cm ?? null,
        weight_kg: prefs.weight_kg ?? null,
        activity_level: prefs.activity_level ?? null,
        goal: prefs.goal ?? null,
        daily_calorie_goal: prefs.daily_calorie_goal ?? null,
        protein_goal_grams: prefs.protein_goal_grams ?? null,
        fat_goal_grams: prefs.fat_goal_grams ?? null,
        carbs_goal_grams: prefs.carbs_goal_grams ?? null,
        dietary_restrictions: prefs.dietary_restrictions ?? null,
        preferred_cuisines: prefs.preferred_cuisines ?? null,
      } : existingPrefsSnapshot;

      await supabase
        .from('coach_state')
        .upsert({ user_id: session.user.id, summary: newSummary, key_facts: newKeyFacts, prefs_snapshot: prefsSnapshot, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    } catch (e) {
      // non-fatal
    }

    return NextResponse.json({ message: assistantInsert || { role: 'assistant', content: reply, created_at: new Date().toISOString() } });
  } catch (e) {
    console.error('coach chat error', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });

  try {
    const supabase = createClient();
    // Delete messages and state for this user with counts
    const delMsgs = await supabase
      .from('coach_messages')
      .delete()
      .eq('user_id', session.user.id)
      .select('user_id');
    const delState = await supabase
      .from('coach_state')
      .delete()
      .eq('user_id', session.user.id)
      .select('user_id');

    const deletedMessages = Array.isArray(delMsgs.data) ? delMsgs.data.length : 0;
    const deletedState = Array.isArray(delState.data) ? delState.data.length : 0;

    if (delMsgs.error || delState.error) {
      return NextResponse.json(
        { ok: false, deletedMessages, deletedState, error: delMsgs.error || delState.error },
        { status: 500 }
      );
    }

    if (deletedMessages === 0 || deletedState === 0) {
      return NextResponse.json(
        {
          ok: false,
          deletedMessages,
          deletedState,
          hint: 'Nothing deleted for one or both tables. Check RLS policies and that rows exist for this user.',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, deletedMessages, deletedState });
  } catch (e) {
    console.error('clear coach chat error', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createClient } from '@/utils/supabase/server';
import { geminiText } from '@/utils/ai';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { timeOfDay, totals, preferences, targets, gaps, generateCount, generation, inventory } = await request.json();
    const profile = (preferences as any)?.profile || preferences || {};
    const restrictions: string[] = Array.isArray(profile?.dietary_restrictions) ? profile.dietary_restrictions.map((x: any) => String(x).toLowerCase()) : [];
    const avoidMeat = restrictions.some((r) => ['meat', 'chicken', 'beef', 'pork', 'fish', 'seafood', 'non-veg', 'nonveg'].includes(r));
    const avoidEggs = restrictions.includes('eggs');

    // Debug short-circuit: avoid AI calls
    if (String(process.env.AI_DEBUG || '').toLowerCase() === 'true') {
      const multi = Number(generateCount) && Number(generateCount) > 1;
      const g = {
        calories: Number(gaps?.calories ?? Math.max(0, (targets?.calories||0) - (totals?.calories||0))) || 0,
        protein_g: Number(gaps?.protein_g ?? Math.max(0, (targets?.protein_g||0) - (totals?.protein_g||0))) || 0,
        carbs_g: Number(gaps?.carbs_g ?? Math.max(0, (targets?.carbs_g||0) - (totals?.carbs_g||0))) || 0,
        fat_g: Number(gaps?.fat_g ?? Math.max(0, (targets?.fat_g||0) - (totals?.fat_g||0))) || 0,
      };
      const proteinForward = g.protein_g >= 25;
      const next = proteinForward
        ? `Aim for ~${Math.min(45, Math.max(25, g.protein_g))}g protein with a ${avoidMeat ? 'tofu/paneer' : 'lean protein'} bowl. Add fruit/yogurt to close carbs.`
        : `Balanced: yogurt bowl with fruit and nuts${avoidEggs ? '' : ' or omelet + toast'}. Fit to ~${g.calories} kcal left.`;
      const payload: any = {
        greeting: `Good ${timeOfDay || 'day'}!`,
        suggestion: `Debug mode: Using local defaults. Protein ${g.protein_g}g, carbs ${g.carbs_g}g, fats ${g.fat_g}g left.`,
        nextMealSuggestion: next,
      };
      if (multi) {
        payload.mealIdeas = [
          { name: `${avoidMeat ? 'Tofu/paneer' : 'Chicken'} bowl + veggies + small rice`, why: 'Protein-forward, adjustable carbs' },
          { name: 'Greek yogurt + berries + nuts', why: 'Quick, macro-friendly snack' },
          ...(avoidEggs ? [] : [{ name: 'Egg omelet + toast + salad', why: 'Balanced; tweak toast for carbs' }]),
        ];
      }
      return NextResponse.json(payload);
    }
    
    // Get user's recent food logs for context
    const supabase = createClient();
    const { data: recentLogs } = await supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', session.user.id)
      .order('eaten_at', { ascending: false })
      .limit(10);

    // Generate prompt for AI - bias to macro gaps and targets
    const multi = Number(generateCount) && Number(generateCount) > 1;
    const strictness = Math.max(0, Math.min(100, Number(generation?.strictness ?? 40)));
    const mealType = generation?.mealType ?? 'auto';
    const hasInventory = Array.isArray(inventory) && inventory.length > 0;
    const invList = hasInventory
      ? inventory.map((i: any) => `${i.name} (${i.qty} ${i.unit || 'unit'})`).join(', ')
      : '';

    const prompt = `You are a friendly nutrition assistant. Return JSON only.
Strictly bias the "nextMealSuggestion" to FILL THE MACRO GAPS first while staying close to remaining calories.

Time of day: ${timeOfDay}

Today's nutrition so far:
- Calories: ${totals?.calories || 0} kcal
- Protein: ${totals?.protein_g || 0} g
- Carbs: ${totals?.carbs_g || 0} g
- Fat: ${totals?.fat_g || 0} g

Targets for the day:
- Calories: ${targets?.calories ?? 'n/a'} kcal
- Protein: ${targets?.protein_g ?? 'n/a'} g
- Carbs: ${targets?.carbs_g ?? 'n/a'} g
- Fat: ${targets?.fat_g ?? 'n/a'} g

Remaining gaps to fill today (non-negative):
- Calories left: ${gaps?.calories ?? Math.max(0, (targets?.calories||0) - (totals?.calories||0))} kcal
- Protein left: ${gaps?.protein_g ?? Math.max(0, (targets?.protein_g||0) - (totals?.protein_g||0))} g
- Carbs left: ${gaps?.carbs_g ?? Math.max(0, (targets?.carbs_g||0) - (totals?.carbs_g||0))} g
- Fat left: ${gaps?.fat_g ?? Math.max(0, (targets?.fat_g||0) - (totals?.fat_g||0))} g

User preferences (may be empty): ${JSON.stringify(preferences || {})}

${hasInventory ? `User grocery inventory: ${invList}` : ''}

Generation controls:
- Strictness (0 random -> 100 strictly use inventory): ${strictness}
- Meal type preference: ${mealType}

Recent foods: ${
      recentLogs?.map((log: any) => log.food_name).filter(Boolean).join(', ') || 'No recent logs'
    }

Rules:
- Prioritize protein if protein gap is large (e.g., > 25g), suggest lean protein sources.
- Keep the idea concise (1-2 options). Include quick add-ons (e.g., fruit, yogurt) to close remaining carbs/fats as needed.
- Respect time of day (breakfast-like in morning, etc.).
- Avoid allergens if present in preferences.
${hasInventory ? `- If strictness >= 70: recipes MUST primarily use items in inventory; do not rely on unavailable ingredients (allow small staples like salt, pepper, oil). If an item is missing, suggest the closest variant using available items.
- If 30 <= strictness < 70: prefer inventory items but allow reasonable extras.
- If strictness < 30: feel free to suggest creative options, still considering preferences.` : `- Ignore inventory constraints (none provided).`}
- If mealType is provided (not 'auto'), tailor the idea accordingly (snack, breakfast, lunch, dinner, full meal).

Return JSON object with fields exactly:
{
  "greeting": string,
  "suggestion": string,
  "nextMealSuggestion": string${multi ? ",\n  \"mealIdeas\": [{\"name\": string, \"why\": string}]" : ''}
}`;

    // Get AI response
    let aiResponse = '';
    try {
      aiResponse = await geminiText(prompt);
    } catch (e) {
      // graceful local fallback when AI unavailable
      const g = {
        calories: Number(gaps?.calories ?? Math.max(0, (targets?.calories||0) - (totals?.calories||0))) || 0,
        protein_g: Number(gaps?.protein_g ?? Math.max(0, (targets?.protein_g||0) - (totals?.protein_g||0))) || 0,
        carbs_g: Number(gaps?.carbs_g ?? Math.max(0, (targets?.carbs_g||0) - (totals?.carbs_g||0))) || 0,
        fat_g: Number(gaps?.fat_g ?? Math.max(0, (targets?.fat_g||0) - (totals?.fat_g||0))) || 0,
      };
      const proteinForward = g.protein_g >= 25;
      const next = proteinForward
        ? `Aim for ~${Math.min(45, Math.max(25, g.protein_g))}g protein: try ${avoidMeat ? 'tofu/paneer' : 'lean chicken or tofu'} bowl with veggies and a small grain. Add fruit or yogurt if you still need carbs.`
        : `Keep it balanced: ${avoidEggs ? 'Greek yogurt bowl with fruit and nuts' : 'a veggie omelet or Greek yogurt bowl with fruit and nuts'}. Add whole-grain toast if you need more carbs.`;
      const fallback: any = {
        greeting: `Good ${timeOfDay}!`,
        suggestion: `Focus on closing today's gaps — protein ${g.protein_g}g, carbs ${g.carbs_g}g, fats ${g.fat_g}g left.`,
        nextMealSuggestion: next,
      };
      if (multi) {
        fallback.mealIdeas = [
          { name: `${avoidMeat ? 'Tofu/paneer' : 'Grilled chicken or tofu'} bowl with veggies + small rice`, why: 'Protein-forward to close protein gap; controlled carbs' },
          { name: 'Greek yogurt with berries and nuts', why: 'Quick, high-protein snack; adds healthy fats/carbs' },
          ...(!avoidEggs ? [{ name: 'Egg omelet + whole-grain toast + side salad', why: 'Balanced macros; adjust toast to fit calories' }] : []),
        ];
      }
      return NextResponse.json(fallback);
    }
    
    // Try to parse the JSON response
    try {
      const suggestion = JSON.parse(aiResponse);
      return NextResponse.json(suggestion);
    } catch (e) {
      console.error('Failed to parse AI response:', aiResponse);
      // Fallback to a default response
      const g = {
        calories: Number(gaps?.calories ?? Math.max(0, (targets?.calories||0) - (totals?.calories||0))) || 0,
        protein_g: Number(gaps?.protein_g ?? Math.max(0, (targets?.protein_g||0) - (totals?.protein_g||0))) || 0,
        carbs_g: Number(gaps?.carbs_g ?? Math.max(0, (targets?.carbs_g||0) - (totals?.carbs_g||0))) || 0,
        fat_g: Number(gaps?.fat_g ?? Math.max(0, (targets?.fat_g||0) - (totals?.fat_g||0))) || 0,
      };
      const proteinForward = g.protein_g >= 25;
      return NextResponse.json({
        greeting: `Good ${timeOfDay}!`,
        suggestion: `Focus on closing today's gaps — protein ${g.protein_g}g, carbs ${g.carbs_g}g, fats ${g.fat_g}g left.`,
        nextMealSuggestion: proteinForward
          ? `Aim for ~${Math.min(45, Math.max(25, g.protein_g))}g protein: ${avoidMeat ? 'tofu/paneer' : 'grilled chicken or tofu'} with veggies; add rice or fruit to reach carbs.`
          : `Balanced idea: ${avoidEggs ? 'Greek yogurt with berries and nuts' : 'Greek yogurt with berries and nuts or an omelet + toast'}. Adjust portions to fit remaining calories (~${g.calories} kcal).`
      });
    }
  } catch (error) {
    console.error('Error generating suggestions:', error);
    // Final fallback if everything failed
    return NextResponse.json({
      greeting: 'Hi there',
      suggestion: 'Could not reach AI right now. Use your remaining macros as a guide for the next meal.',
      nextMealSuggestion: 'Pick a lean protein + whole grain + veggies. Add a small snack (fruit/yogurt) if carbs remain.'
    });
  }
}

// Add this to fix Next.js 13+ route export
// This is needed for proper route handling in the App Router
export const dynamic = 'force-dynamic';

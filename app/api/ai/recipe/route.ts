import { NextResponse } from 'next/server';
import { geminiText } from '@/utils/ai';

export async function POST(req: Request) {
  try {
    const { mealName, preferences, inventory, targets, timeOfDay } = await req.json();
    if (!mealName || typeof mealName !== 'string') {
      return NextResponse.json({ error: 'Missing mealName' }, { status: 400 });
    }

    const invList: Array<{ name: string; qty?: number; unit?: string }> = Array.isArray(inventory) ? inventory : [];
    const profile = (preferences?.profile ?? preferences) || {};

    const prompt = `You are a helpful nutrition coach and recipe creator.
Create a concise, practical recipe strictly as JSON (no markdown).
Assume basic pantry items are available: salt, pepper, sugar, common spices, cooking oil (olive/neutral), butter, vinegar, soy sauce, flour, baking powder, garlic, onion, lemon, basic condiments.

Inputs:
- Meal name idea: ${mealName}
- Time of day: ${timeOfDay || 'auto'}
- User preferences (may be partial): ${JSON.stringify(profile)}
- Available groceries (names with optional qty/unit): ${JSON.stringify(invList)}
- Optional macro targets (for today): ${JSON.stringify(targets || null)}

Rules:
- Use mostly items from inventory when reasonable; if missing, suggest close substitutes.
- Keep total steps <= 8, clear, short.
- Provide estimated cook_time_minutes and difficulty (easy/medium).
- Ingredients: array of { item, amount } strings; consolidate amounts.
- Include a short why text explaining why this fits preferences or goals.
- Output ONLY JSON with this exact shape:
{
  "title": string,
  "servings": number,
  "cook_time_minutes": number,
  "difficulty": "easy" | "medium",
  "ingredients": Array<{"item": string, "amount": string}>,
  "steps": string[],
  "why": string,
  "notes": string
}
`;

    const raw = await geminiText(prompt);

    // try to parse JSON, with some cleanup
    function tryParse(text: string) {
      const trimmed = text.trim();
      const withoutMd = trimmed.replace(/^```[a-zA-Z]*\n?|```$/g, '');
      try {
        return JSON.parse(withoutMd);
      } catch {
        return null;
      }
    }

    const json = tryParse(raw);
    if (!json) {
      return NextResponse.json({ error: 'Could not parse recipe', hint: raw?.slice(0, 500) }, { status: 502 });
    }

    return NextResponse.json(json, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { geminiText } from '@/utils/ai';

// Minimal shape matching our FoodLog insert needs
// We intentionally keep this local to avoid coupling API route to app types
interface ParsedItem {
  name: string;
  quantity?: string | null;
}

interface ParsedLog {
  items: ParsedItem[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  eaten_at?: string | null; // ISO string
  note?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text: string = body?.text || '';
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    // Debug short-circuit: naive parse without AI
    if (String(process.env.AI_DEBUG || '').toLowerCase() === 'true') {
      const nowIso = new Date().toISOString();
      const log: ParsedLog = {
        items: [{ name: text.trim(), quantity: null }],
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        eaten_at: nowIso,
        note: null,
      };
      return NextResponse.json({ log });
    }

    const schema = `
Return ONLY a minified JSON object with keys: items (array of {name, quantity?}), calories (number), protein_g (number), carbs_g (number), fat_g (number), eaten_at (ISO string or null), note (string or null). No extra text.
`;

    const prompt = `You are a nutrition parser. Extract foods and approximate macros from this user message.
Message: "${text}"
${schema}`;

    const raw = await geminiText(prompt);

    // Extract the JSON object between the first '{' and the last '}'
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    let candidate = start !== -1 && end !== -1 && end > start ? raw.slice(start, end + 1) : raw;

    let parsed: ParsedLog | null = null;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      // Fallbacks: strip code fences and try again, then re-slice braces
      const noFences = raw
        .replace(/^```\s*json/i, '')
        .replace(/^```/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      const s2 = noFences.indexOf('{');
      const e2 = noFences.lastIndexOf('}');
      const cand2 = s2 !== -1 && e2 !== -1 && e2 > s2 ? noFences.slice(s2, e2 + 1) : noFences;
      try {
        parsed = JSON.parse(cand2);
      } catch {
        parsed = null;
      }
    }

    if (!parsed || !Array.isArray(parsed.items)) {
      return NextResponse.json({ error: 'Could not parse meal' }, { status: 422 });
    }

    // Coerce numeric fields
    const calories = Number(parsed.calories) || 0;
    const protein_g = Number(parsed.protein_g) || 0;
    const carbs_g = Number(parsed.carbs_g) || 0;
    const fat_g = Number(parsed.fat_g) || 0;

    // Validate eaten_at
    const eaten_at = parsed.eaten_at && !Number.isNaN(Date.parse(parsed.eaten_at))
      ? new Date(parsed.eaten_at).toISOString()
      : null;

    const log: ParsedLog = {
      items: parsed.items.map((it) => ({ name: String(it.name), quantity: it.quantity ?? null })),
      calories,
      protein_g,
      carbs_g,
      fat_g,
      eaten_at,
      note: parsed.note ?? null,
    };

    return NextResponse.json({ log });
  } catch (e) {
    console.error('parse route error', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

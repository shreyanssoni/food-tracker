import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createClient } from '@/utils/supabase/server';
import { geminiText } from '@/utils/ai';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const supabase = createClient();

    // Get today's logs for the user
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: logs, error } = await supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('eaten_at', startOfDay.toISOString())
      .order('eaten_at', { ascending: false })
      .limit(50);

    if (error) throw error;

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
      .join(' | ');

    const prompt = `Create a brief, supportive daily nutrition summary (3-4 sentences max). Celebrate consistency, avoid guilt. Offer 1-2 gentle tips.
Today's totals (approx): ${JSON.stringify(totals)}
Foods: ${foodsList || 'No logs yet today'}
Return only plain text.`;
    
    // Debug short-circuit: avoid AI calls
    const AI_DEBUG = String(process.env.AI_DEBUG || '').toLowerCase() === 'true';
    let text: string;
    if (AI_DEBUG) {
      text = 'Debug mode: Great consistency today. Keep aiming for balanced plates and adjust portions based on remaining macros.';
    } else {
      try {
        text = (await geminiText(prompt)).trim();
      } catch (e) {
        text = 'Nice work showing up today. Aim for balanced plates with protein, carbs, and healthy fats. Small, consistent steps add up.';
      }
    }

    return NextResponse.json({ text, totals, count: logs?.length || 0 });
  } catch (e) {
    console.error('summary route error', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

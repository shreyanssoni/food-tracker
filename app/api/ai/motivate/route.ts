import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createClient } from '@/utils/supabase/server';
import { geminiText } from '@/utils/ai';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });

  try {
    const supabase = createClient();
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const profileBits = {
      gender: prefs?.gender ?? null,
      age: prefs?.age ?? null,
      goal: prefs?.goal ?? null,
      activity_level: prefs?.activity_level ?? null,
    };

    const prompt = `Write ONE short, spine-tingling motivational message (<= 65 words) that feels like an electric jolt of belief. Address the user directly in second person. Avoid clichés, no emojis, no hashtags. It should be gritty, specific, and empowering. If gender or goal is present, subtly reflect it without stereotyping.

Profile (optional): ${JSON.stringify(profileBits)}

Return ONLY the message text.`;

    const text = (await geminiText(prompt)).trim();
    const content = text || 'You are one decision away from momentum. Prove it to yourself today.';

    return NextResponse.json({ message: { role: 'assistant', content } });
  } catch (e) {
    return NextResponse.json({ message: { role: 'assistant', content: 'You are one decision away from momentum. Prove it to yourself today.' } });
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { geminiText } from '@/utils/ai';

export async function POST(request: Request) {
  const session = await auth();
  
  try {
    const { log } = await request.json();
    
    // Simple validation
    if (!log || !log.items || !Array.isArray(log.items)) {
      return NextResponse.json(
        { error: 'Invalid log data' },
        { status: 400 }
      );
    }

    // Debug short-circuit: avoid AI calls
    if (String(process.env.AI_DEBUG || '').toLowerCase() === 'true') {
      const names = Array.isArray(log.items) ? log.items.map((i: any) => i.name).filter(Boolean) : [];
      const mention = names.length ? names.slice(0, 3).join(', ') : 'that meal';
      return NextResponse.json({ message: `Nice log — ${mention} sounds good! Keep going and add some veggies or fruit later if you need more balance.` });
    }

    // Create a prompt for the AI
    const prompt = `You are a friendly, empathetic nutrition assistant. 
    The user just logged: "${log.items.map((i: any) => i.name).join(', ')}" at ${new Date(log.eaten_at).toLocaleTimeString()}.
    
    Provide a brief (1-2 sentence) encouraging response. Be positive and supportive, 
    focusing on the positive aspects of their food choice or offering gentle 
    suggestions for next time. Keep it casual and conversational.
    
    Examples:
    - "Great choice! Those nutrients will keep you energized."
    - "Yum! Adding some veggies next time could make it even more balanced."
    - "That sounds delicious! Remember to stay hydrated too!"
    
    Your response (just the text, no quotes or formatting):`;

    // Get AI response
    const aiResponse = await geminiText(prompt);
    
    // Clean up the response
    const cleanResponse = aiResponse
      .replace(/^['"]+|['"]+$/g, '') // Remove surrounding quotes
      .trim();

    return NextResponse.json({ message: cleanResponse });
    
  } catch (error) {
    console.error('Error in empathy API:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}

// Required for Next.js 13+ API routes
export const dynamic = 'force-dynamic';

import type { NextApiRequest, NextApiResponse } from 'next';
import { geminiText } from '@/utils/ai';

function currentMealPeriod(date = new Date()) {
  const h = date.getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 20) return 'snack';
  return 'dinner';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const meal = currentMealPeriod();
  const baseline = `You are a gentle habit coach for a food logging app. Prompt the user to log their ${meal}. Be casual, supportive, and short (max 14 words). Offer a guess like dal + rice + sabzi in India when relevant. 1 emoji max.`;
  try {
    const text = await geminiText(baseline);
    res.json({ message: text.trim(), meal });
  } catch {
    res.json({ message: `What did you have for ${meal}? Maybe the usual dal + rice + sabzi? 🙂`, meal });
  }
}

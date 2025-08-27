import type { NextApiRequest, NextApiResponse } from "next";
import { geminiImagePrompt } from "@/utils/ai";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end();
  const { imageBase64, mimeType } = req.body as {
    imageBase64: string;
    mimeType?: string;
  };
  if (!imageBase64)
    return res.status(400).json({ error: "imageBase64 is required" });
  const prompt =
    "Identify foods in this photo, estimate calories and macros. Return JSON with items (name and quantity in json), calories, protein_g, carbs_g, fat_g, eaten_at (now, ISO) and also a friendly suggestion message including the weight approx (grams) and name of food in suggestion message.";
  try {
    const out = await geminiImagePrompt(
      prompt,
      imageBase64,
      mimeType || "image/jpeg"
    );
    const jsonStart = out.indexOf("{");
    const jsonEnd = out.lastIndexOf("}");
    const parsed = JSON.parse(out.slice(jsonStart, jsonEnd + 1));
    res.json({
      log: parsed?.items ?? parsed,
      suggestion: parsed?.suggestion || null,
      eaten_at: parsed?.eaten_at || null,
    });
  } catch (e: any) {
    if (
      typeof e?.message === "string" &&
      e.message.includes("GEMINI_API_KEY")
    ) {
      return res.status(500).json({
        error: "Server missing GEMINI_API_KEY. Add it to .env.local.",
      });
    }
    res.status(500).json({ error: "Failed to analyze photo" });
  }
}

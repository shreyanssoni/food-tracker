import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isEnabled() {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function GET() {
  return new Response(
    JSON.stringify({ enabled: isEnabled() }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

export async function POST(req: NextRequest) {
  if (!isEnabled()) {
    return new Response(
      JSON.stringify({ error: "Speech-to-text is not configured on the server." }),
      { status: 501, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof Blob)) {
      return new Response(
        JSON.stringify({ error: "Missing audio file in 'file' field." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Prepare multipart body for Groq (OpenAI-compatible)
    const groqEndpoint = "https://api.groq.com/openai/v1/audio/transcriptions";
    const body = new FormData();
    body.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3");
    body.append("response_format", "json");
    // Name the file; Blob in Edge runtime supports stream; in node we can pass as-is
    body.append("file", file, (file as any).name || "audio.webm");

    const res = await fetch(groqEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Groq STT error", res.status, text?.slice(0, 500));
      return new Response(
        JSON.stringify({ error: `STT failed (${res.status})` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const transcript = data?.text || data?.transcript || "";
    return new Response(
      JSON.stringify({ text: transcript }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("STT route error", e);
    return new Response(
      JSON.stringify({ error: "Unexpected error during transcription" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

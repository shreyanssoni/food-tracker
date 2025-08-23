const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Simple in-memory circuit breaker for Gemini 429s
let geminiFailCount = 0;
let geminiSkipUntil = 0; // epoch ms

function shouldSkipGemini(): boolean {
  if (process.env.AI_PROVIDER?.toLowerCase() === 'openrouter') return true;
  if (process.env.AI_PROVIDER?.toLowerCase() === 'gemini') return false;
  return Date.now() < geminiSkipUntil;
}

function noteGemini429() {
  geminiFailCount = Math.min(geminiFailCount + 1, 5);
  const baseMinutes = 15;
  const backoffMinutes = Math.min(baseMinutes * Math.pow(2, geminiFailCount - 1), 60);
  geminiSkipUntil = Date.now() + backoffMinutes * 60_000;
}

function noteGeminiSuccess() {
  geminiFailCount = 0;
  geminiSkipUntil = 0;
}

// Simple in-memory circuit breaker for OpenRouter models (per model name)
type ModelState = { skipUntil: number };
const orModelStates: Record<string, ModelState> = {};

function parseResetFromHeaders(headers: Headers): number | null {
  // Try OpenRouter's X-RateLimit-Reset which may be a unix ms or seconds
  const reset = headers.get('X-RateLimit-Reset');
  if (!reset) return null;
  const n = Number(reset);
  if (!Number.isFinite(n)) return null;
  // If value seems like seconds (small), convert to ms
  return n < 10_000_000_000 ? n * 1000 : n;
}

function shouldSkipModel(model: string): boolean {
  const s = orModelStates[model];
  return !!s && Date.now() < s.skipUntil;
}

function noteModel429(model: string, headers: Headers) {
  const resetMs = parseResetFromHeaders(headers);
  const backoffMs = resetMs && resetMs > Date.now() ? resetMs - Date.now() : 15 * 60_000; // 15m fallback
  orModelStates[model] = { skipUntil: Date.now() + backoffMs };
}

export async function geminiText(prompt: string) {
  const providerPref = (process.env.AI_PROVIDER || 'auto').toLowerCase();
  // Debug mode: avoid external calls; return empty to trigger local fallbacks in callers
  if (String(process.env.AI_DEBUG || '').toLowerCase() === 'true') {
    return '';
  }

  // If provider is groq, try Groq first
  if (providerPref === 'groq' && process.env.GROQ_API_KEY) {
    const groq = await groqText(prompt).catch(() => '');
    if (groq) return groq;
  }

  // Try Gemini first unless provider is forced to openrouter/groq or breaker is active
  if (process.env.GEMINI_API_KEY && providerPref !== 'openrouter' && providerPref !== 'groq' && !shouldSkipGemini()) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('Gemini error', res.status, body?.slice(0, 500));
        // If rate-limited or missing quota, fall through to OpenRouter if available
        if (res.status === 429) {
          noteGemini429();
        } else {
          throw new Error(`Gemini error ${res.status}`);
        }
      } else {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          noteGeminiSuccess();
          return text as string;
        }
      }
    } catch (e) {
      // proceed to fallback
    }
  }

  // Fallback to Groq if available (before OpenRouter) when not already tried first
  if (process.env.GROQ_API_KEY) {
    const groq = await groqText(prompt).catch(() => '');
    if (groq) return groq;
  }

  // Fallback to OpenRouter with rotating models if configured
  if (process.env.OPENROUTER_API_KEY) {
    // Build model list: env list > single model > sensible defaults
    const envList = (process.env.OPENROUTER_MODELS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const single = process.env.OPENROUTER_MODEL?.trim();
    const defaultModels = [
      'google/gemma-2-9b-it:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'openchat/openchat-7b:free',
    ];
    const models = envList.length ? envList : (single ? [single] : defaultModels);

    for (const model of models) {
      if (shouldSkipModel(model)) continue;
      try {
        const res = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'HTTP-Referer': process.env.OPENROUTER_REFERRER || 'http://localhost',
            'X-Title': process.env.OPENROUTER_APP_NAME || 'food-tracker',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'You are an empathetic, concise nutrition coach.' },
              { role: 'user', content: prompt },
            ],
            temperature: 0.7,
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error('OpenRouter error', model, res.status, body?.slice(0, 500));
          if (res.status === 429) {
            noteModel429(model, res.headers);
            // try next model
            continue;
          }
          // non-429: try next model, but don't mark skip
          continue;
        }
        const json = await res.json();
        const text = json.choices?.[0]?.message?.content || '';
        if (text) return text as string;
        // empty text -> try next
      } catch (e) {
        console.error('OpenRouter call failed', model, e);
        // try next model
      }
    }
    // All models exhausted or failed
    return 'We are rate-limited right now. Provide a concise, actionable nutrition tip and a protein-forward next meal idea.';
  }

  // Final graceful fallback to avoid breaking routes that rely on AI
  return 'AI is temporarily unavailable. Suggest a lean-protein meal adjusted to remaining macros, plus 1-2 quick add-ons to close gaps.';
}

// Groq provider (OpenAI-compatible)
async function groqText(prompt: string) {
  const model = process.env.GROQ_MODEL?.trim() || 'llama-3.1-8b-instant';
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are an empathetic, concise nutrition coach.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Groq error', model, res.status, body?.slice(0, 500));
    throw new Error(`Groq error ${res.status}`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || '';
  return text as string;
}

export async function geminiImagePrompt(prompt: string, imageBase64: string, mime = 'image/jpeg') {
  if (String(process.env.AI_DEBUG || '').toLowerCase() === 'true') {
    throw new Error('AI_DEBUG is enabled: image prompt disabled');
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY');
  }
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: imageBase64, mimeType: mime } }
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Gemini image error', res.status, body?.slice(0, 500));
    throw new Error(`Gemini error ${res.status}`);
  }
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text as string;
}

// Supabase Edge Function (Deno)
// Name: pinger
// Purpose: Ping app cron endpoints. Schedule this function to run every 5 minutes in Supabase.
// Env (set as Function secrets): PUBLIC_BASE_URL, CRON_SECRET

// deno-lint-ignore no-explicit-any
export const handler = async (_req: Request): Promise<Response> => {
  const base = (Deno.env.get('PUBLIC_BASE_URL') || '').replace(/\/$/, '');
  const secret = Deno.env.get('CRON_SECRET') || '';

  if (!base || !secret) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing PUBLIC_BASE_URL or CRON_SECRET' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = {
    'User-Agent': 'supabase-schedule/pinger',
    'Accept': 'application/json',
  } as const;

  const targets = [
    `${base}/api/push/run-scheduler?secret=${encodeURIComponent(secret)}`,
    `${base}/api/life-streak/run-eod?secret=${encodeURIComponent(secret)}`,
    `${base}/api/streaks/pre-eod-reminder?secret=${encodeURIComponent(secret)}`,
  ];

  const results = await Promise.all(
    targets.map(async (url) => {
      try {
        const res = await fetch(url, { method: 'GET', headers });
        const text = await res.text();
        return { url, status: res.status, ok: res.ok, body: text.slice(0, 500) };
      } catch (e) {
        return { url, status: 0, ok: false, error: String(e) };
      }
    }),
  );

  const anyFailure = results.some((r) => !r.ok);
  return new Response(JSON.stringify({ ok: !anyFailure, results }, null, 2), {
    status: anyFailure ? 207 : 200, // multi-status on partial failures
    headers: { 'Content-Type': 'application/json' },
  });
};

// Default export for Supabase Edge Functions
export default handler;

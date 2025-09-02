// Supabase Edge Function (Deno)
// deno-lint-ignore-file
// @ts-ignore Deno is provided by the Edge runtime
declare const Deno: any;
// Name: pinger
// Purpose: Ping app cron endpoints. Schedule this function to run every 5 minutes in Supabase.
// Env (set as Function secrets): PUBLIC_BASE_URL, CRON_SECRET

// deno-lint-ignore no-explicit-any
export const handler = async (req: Request): Promise<Response> => {
  const base = (Deno.env.get('PUBLIC_BASE_URL') || '').replace(/\/$/, '');
  const secret = Deno.env.get('CRON_SECRET') || '';
  try {
    console.log('pinger start', { now: new Date().toISOString(), baseSet: !!base, hasSecret: !!secret, url: req.url });
  } catch (_) {
    // ignore
  }

  if (!base || !secret) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing PUBLIC_BASE_URL or CRON_SECRET' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const baseHeaders = {
    'User-Agent': 'supabase-schedule/pinger',
    'Accept': 'application/json',
  } as const;

  // Add a per-request timeout to avoid hanging if any target stalls
  const TIMEOUT_MS = 2500; // 2.5s per request
  const OVERALL_TIMEOUT_MS = 9000; // 9s hard cap for the whole function (avoid 10s edge timeout)
  type Target = { url: string; method?: 'GET' | 'POST'; headers?: Record<string, string> };
  const fetchWithTimeout = async (t: Target) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const method = t.method || 'GET';
      const headers = { ...baseHeaders, ...(t.headers || {}) } as Record<string, string>;
      console.log('pinger fetch ->', t.url, method);
      const res = await fetch(t.url, { method, headers, signal: controller.signal });
      const text = await res.text();
      return { url: t.url, status: res.status, ok: res.ok, body: text.slice(0, 500) } as const;
    } catch (e) {
      console.error('pinger fetch error', t.url, String(e));
      return { url: t.url, status: 0, ok: false, error: String(e) } as const;
    } finally {
      clearTimeout(timeout);
    }
  };

  // Allow running a single target via query param
  // ?only=push|eod|pre|shadow-generate|shadow-close|shadow-notify|shadow-run-today|shadow-audit-fix-all|shadow-generate-events-today-all|shadow-weekly|shadow-nightly|shadow-taunt
  const urlObj = new URL(req.url);
  const only = urlObj.searchParams.get('only');
  const allTargets: Record<string, Target> = {
    push: { url: `${base}/api/push/run-scheduler?secret=${encodeURIComponent(secret)}` },
    eod: { url: `${base}/api/life-streak/finalize?secret=${encodeURIComponent(secret)}` },
    'pre-eod': { url: `${base}/api/streaks/pre-eod-reminder?secret=${encodeURIComponent(secret)}` },
    reminders: { url: `${base}/api/tasks/reminders/run?secret=${encodeURIComponent(secret)}` },
    'shadow-generate': { url: `${base}/api/shadow/cron/generate-daily-admin?secret=${encodeURIComponent(secret)}` },
    'shadow-close': { url: `${base}/api/shadow/cron/close-overdue-admin?secret=${encodeURIComponent(secret)}` },
    'shadow-notify': { url: `${base}/api/shadow/cron/notify-admin?secret=${encodeURIComponent(secret)}` },
    // New orchestrator cron route uses POST + x-cron-secret header
    'shadow-run-today': {
      url: `${base}/api/cron/shadow/run-today-all`,
      method: 'POST',
      headers: { 'x-cron-secret': secret },
    },
    // Mirror seeding for all users (idempotent)
    'shadow-audit-fix-all': {
      url: `${base}/api/cron/shadow/audit-fix-all`,
      method: 'POST',
      headers: { 'x-cron-secret': secret },
    },
    // Persist today's shadow_task_instances for all users
    'shadow-generate-events-today-all': {
      url: `${base}/api/cron/shadow/generate-events-today-all`,
      method: 'POST',
      headers: { 'x-cron-secret': secret },
    },
    // Weekly summarizer — not included in default set; call with ?only=shadow-weekly
    'shadow-weekly': {
      url: `${base}/api/cron/shadow/weekly-summarize`,
      method: 'POST',
      headers: { 'x-cron-secret': secret },
    },
    // Nightly smoother — not included in default set; call with ?only=shadow-nightly
    'shadow-nightly': {
      url: `${base}/api/cron/shadow/nightly-smooth`,
      method: 'POST',
      headers: { 'x-cron-secret': secret },
    },
    // Taunt frequency controller — safe to call frequently; engine enforces caps and windows
    'shadow-taunt': {
      url: `${base}/api/cron/shadow/taunt-maybe`,
      method: 'POST',
      headers: { 'x-cron-secret': secret },
    },
  };

  let targets: Target[];
  switch (only) {
    case 'push':
      targets = [allTargets.push];
      break;
    case 'eod':
      targets = [allTargets.eod];
      break;
    case 'pre':
    case 'pre-eod':
      targets = [allTargets['pre-eod']];
      break;
    case 'reminders':
      targets = [allTargets.reminders];
      break;
    case 'shadow-generate':
      targets = [allTargets['shadow-generate']];
      break;
    case 'shadow-close':
      targets = [allTargets['shadow-close']];
      break;
    case 'shadow-notify':
      targets = [allTargets['shadow-notify']];
      break;
    case 'shadow-run-today':
      targets = [allTargets['shadow-run-today']];
      break;
    case 'shadow-audit-fix-all':
      targets = [allTargets['shadow-audit-fix-all']];
      break;
    case 'shadow-generate-events-today-all':
      targets = [allTargets['shadow-generate-events-today-all']];
      break;
    case 'shadow-weekly':
      targets = [allTargets['shadow-weekly']];
      break;
    case 'shadow-nightly':
      targets = [allTargets['shadow-nightly']];
      break;
    case 'shadow-taunt':
      targets = [allTargets['shadow-taunt']];
      break;
    default:
      targets = [
        allTargets.push,
        allTargets.eod,
        allTargets['pre-eod'],
        allTargets['shadow-generate'],
        allTargets['shadow-close'],
        allTargets['shadow-notify'],
        allTargets['shadow-run-today'],
        allTargets['shadow-audit-fix-all'],
        allTargets['shadow-generate-events-today-all'],
        allTargets['shadow-taunt'],
      ];
  }

  console.time?.('pinger_total');
  const allPromise = Promise.allSettled(targets.map(fetchWithTimeout));
  const overallTimeout = new Promise<PromiseSettledResult<unknown>[]>((resolve) => {
    setTimeout(() => {
      resolve(
        targets.map((url) => ({ status: 'rejected', reason: `overall-timeout-${OVERALL_TIMEOUT_MS}ms: ${url}` })) as PromiseSettledResult<unknown>[]
      );
    }, OVERALL_TIMEOUT_MS);
  });
  const settled = await Promise.race([allPromise, overallTimeout]);
  console.timeEnd?.('pinger_total');

  // Normalize results
  const results = settled.map((item, i) => {
    const url = targets[i];
    if (item && item['status'] === 'fulfilled') {
      return item['value'] as { url: string; status: number; ok: boolean; body?: string; error?: string };
    }
    return { url, status: 0, ok: false, error: String((item as any)?.reason ?? 'unknown') };
  });

  const anyFailure = results.some((r) => !r.ok);
  // Emit concise log for observability in Dashboard
  console.log('pinger results', JSON.stringify(results));
  return new Response(JSON.stringify({ ok: !anyFailure, results }, null, 2), {
    status: anyFailure ? 207 : 200, // multi-status on partial failures
    headers: { 'Content-Type': 'application/json' },
  });
};

// Default export for Supabase Edge Functions
export default handler;

// Ensure the HTTP server is started in the Edge runtime
// Without this, the function may boot but never receive requests
try {
  // Deno.serve is available in the Supabase Edge runtime
  // Only register once per isolate
  // deno-lint-ignore no-explicit-any
  const g: any = globalThis as any;
  if (!g.__pinger_started__) {
    g.__pinger_started__ = true;
    Deno.serve(handler);
    // minimal boot log
    console.log('pinger: Deno.serve registered');
  }
} catch (_) {
  // ignore if not available (e.g., during type-checking)
}

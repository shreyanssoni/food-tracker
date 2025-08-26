import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// POST /api/analytics
// Accepts either a single event object or an array of events.
// Event shape is flexible; we store it as JSON payload, with event name for indexing.
// Example payloads sent from client:
// { event: 'task_complete', taskId: '...', ep: 10, ts: 1690000000000 }
// { event: 'next_up_click', taskId: '...', ts: 1690000000000 }
// { event: 'quick_action_use', label: 'Quick log', ts: 1690000000000 }
// { event: 'open_wallet', ts: 1690000000000 }
export async function POST(req: NextRequest) {
  try {
    // Parse payload
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body) ? body : [body];

    // Basic sanitize and ignore obviously bad input
    const events = items
      .filter((x: any) => x && typeof x === 'object')
      .map((x: any) => ({
        event: typeof x.event === 'string' ? x.event.slice(0, 100) : 'unknown',
        ts: typeof x.ts === 'number' ? x.ts : Date.now(),
        ...x,
      }));

    // Try to attach user_id when available
    let userId: string | null = null;
    try {
      const me = await getCurrentUser();
      userId = me?.id ?? null;
    } catch {}

    // Attempt to persist to Supabase if the table exists
    // Expected table schema (recommended):
    // create table if not exists analytics_events (
    //   id bigserial primary key,
    //   user_id text,
    //   event text not null,
    //   payload jsonb not null,
    //   created_at timestamptz not null default now()
    // );
    try {
      const supabase = createClient();
      const rows = events.map((e: any) => ({
        user_id: userId,
        event: e.event,
        payload: e,
      }));
      if (rows.length > 0) {
        // This will no-op if RLS forbids anonymous writes or table doesn't exist
        await supabase.from('analytics_events').insert(rows);
      }
    } catch {
      // Swallow errors to keep endpoint resilient to schema absence
    }

    // Always respond quickly to avoid blocking sendBeacon
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}

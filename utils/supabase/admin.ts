import { createClient as createSb } from '@supabase/supabase-js';

// Server-side admin client using service role for privileged actions (e.g., Storage writes)
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) {
    throw new Error('Supabase admin env missing: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
  return createSb(url, serviceKey, { auth: { persistSession: false } });
}

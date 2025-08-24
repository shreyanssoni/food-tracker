import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// Migrate rows for the current signed-in user's email from any old app_users.id to the current NextAuth id
// Steps:
// 1) Ensure current user's app_users row exists (created by auth.ts signIn callback)
// 2) Find any other app_users rows with the same email and a different id (old_id)
// 3) For each old_id: repoint dependent tables' user_id -> currentId, then delete the old app_users row
// Tables touched (TEXT user_id): user_preferences, push_subscriptions, food_logs, coach_messages, coach_state, groceries

export async function POST() {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient();
    const currentId = me.id as string;
    const email = me.email as string;

    // Ensure current row exists
    const { data: currentRow, error: curErr } = await supabase
      .from('app_users')
      .select('id, email')
      .eq('id', currentId)
      .maybeSingle();
    if (curErr) return NextResponse.json({ error: 'DB error (current user fetch)' }, { status: 500 });

    // Find duplicates by email with different id
    const { data: dupes, error: dupErr } = await supabase
      .from('app_users')
      .select('id, email')
      .eq('email', email)
      .neq('id', currentId);
    if (dupErr) return NextResponse.json({ error: 'DB error (dupes fetch)' }, { status: 500 });

    const oldIds = (dupes || []).map((d) => d.id).filter(Boolean);
    if (oldIds.length === 0) {
      return NextResponse.json({ ok: true, migrated: 0 });
    }

    // Repoint child tables for each oldId
    const tablesWithUserId = [
      'user_preferences',
      'push_subscriptions',
      'food_logs',
      'coach_messages',
      'coach_state',
      'groceries',
    ];

    let migrated = 0;
    for (const oldId of oldIds) {
      for (const table of tablesWithUserId) {
        // Update rows that point to oldId -> currentId
        // Note: If unique constraints exist (e.g., user_preferences PK), we try to upsert-like behavior
        if (table === 'user_preferences') {
          // If a row for currentId already exists, delete the old row to avoid PK conflict
          const { data: existing, error: exErr } = await supabase
            .from('user_preferences')
            .select('user_id')
            .eq('user_id', currentId)
            .maybeSingle();
          if (exErr) return NextResponse.json({ error: 'DB error (check prefs existing)' }, { status: 500 });
          if (existing) {
            // Drop the duplicate prefs row
            await supabase.from('user_preferences').delete().eq('user_id', oldId);
          } else {
            await supabase.from('user_preferences').update({ user_id: currentId }).eq('user_id', oldId);
          }
        } else if (table === 'coach_state') {
          const { data: existing, error: exErr } = await supabase
            .from('coach_state')
            .select('user_id')
            .eq('user_id', currentId)
            .maybeSingle();
          if (exErr) return NextResponse.json({ error: 'DB error (check coach_state existing)' }, { status: 500 });
          if (existing) {
            await supabase.from('coach_state').delete().eq('user_id', oldId);
          } else {
            await supabase.from('coach_state').update({ user_id: currentId }).eq('user_id', oldId);
          }
        } else {
          await supabase.from(table).update({ user_id: currentId }).eq('user_id', oldId);
        }
      }

      // Finally, delete the old app_users row
      await supabase.from('app_users').delete().eq('id', oldId);
      migrated += 1;
    }

    return NextResponse.json({ ok: true, migrated, oldIds });
  } catch (e) {
    console.error('migrate-user-id error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const supabase = createClient();

    // Fetch task
    const { data: task, error: tErr } = await supabase
      .from('tasks')
      .select('id, user_id, ep_value, min_level, active')
      .eq('id', params.id)
      .single();
    if (tErr) throw tErr;
    if (!task || task.active === false) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    // Ownership check: only the owner can complete their task
    if (task.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Do NOT trust client-provided EP. Always use the task's configured ep_value.
    let ep_awarded: number = task.ep_value ?? 10;

    // Daily EP cap (server-side): prevents farming too much EP in a single day
    const DAILY_EP_CAP = 400;
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: todayRows, error: sumErr } = await supabase
      .from('task_completions')
      .select('ep_awarded')
      .eq('user_id', user.id)
      .eq('completed_on', todayStr);
    if (sumErr) throw sumErr;
    const epToday = (todayRows || []).reduce((acc: number, r: any) => acc + (r.ep_awarded ?? 0), 0);
    if (epToday >= DAILY_EP_CAP) {
      return NextResponse.json({ error: 'Daily EP limit reached, try again tomorrow.' }, { status: 429 });
    }
    const remainingAllowance = Math.max(0, DAILY_EP_CAP - epToday);
    ep_awarded = Math.min(ep_awarded, remainingAllowance);

    // Insert completion (one per day per task enforced by unique index)
    const { data: completion, error: cErr } = await supabase
      .from('task_completions')
      .insert({ user_id: user.id, task_id: task.id, ep_awarded })
      .select('*')
      .single();

    if (cErr) {
      // Unique violation -> already completed today
      if ((cErr as any).code === '23505') {
        return NextResponse.json({ error: 'Already completed today' }, { status: 409 });
      }
      throw cErr;
    }

    // EP ledger entry
    const { error: lErr } = await supabase
      .from('ep_ledger')
      .insert({ user_id: user.id, source: 'task', source_id: completion.id, delta_ep: ep_awarded });
    if (lErr) throw lErr;

    // Ensure user_progress row
    let oldLevel = 1;
    let epInLevel = 0;
    let totalEP = 0;
    let diamonds = 0;

    const { data: progress, error: pErr } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (progress) {
      oldLevel = progress.level;
      epInLevel = progress.ep_in_level;
      totalEP = progress.total_ep;
      diamonds = progress.diamonds ?? 0;
    } else {
      // create baseline row
      const { error: insErr } = await supabase
        .from('user_progress')
        .insert({ user_id: user.id, level: 1, ep_in_level: 0, total_ep: 0, diamonds: 0 });
      if (insErr) throw insErr;
    }

    // Load levels helper
    async function getEpRequired(lvl: number): Promise<number> {
      const { data, error } = await supabase.from('levels').select('ep_required').eq('level', lvl).maybeSingle();
      if (error) throw error;
      // Fallback curve if level not found: 100 + (lvl-1)*20
      return data?.ep_required ?? (100 + (lvl - 1) * 20);
    }

    // Compute new level and ep
    let remaining = ep_awarded;
    let curLevel = oldLevel;
    let curEp = epInLevel;

    // Level-up loop with dynamic ep requirements
    while (remaining > 0) {
      const need = (await getEpRequired(curLevel)) - curEp;
      if (remaining >= need) {
        // Level up
        remaining -= need;
        curLevel += 1;
        curEp = 0;
      } else {
        curEp += remaining;
        remaining = 0;
      }
    }

    const newTotal = totalEP + ep_awarded;

    // Update progress (fires DB trigger to auto-grant rewards based on level/total_ep)
    const { error: upErr } = await supabase
      .from('user_progress')
      .update({ level: curLevel, ep_in_level: curEp, total_ep: newTotal, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (upErr) throw upErr;

    // Ensure historical levels are marked as claimed (no diamonds granted)
    if (oldLevel > 0) {
      const preClaims = Array.from({ length: oldLevel }, (_, i) => ({ user_id: user.id, level: i + 1 }));
      const { error: preClaimErr } = await supabase
        .from('user_level_claims')
        .upsert(preClaims);
      if (preClaimErr) throw preClaimErr;
    }

    // Level-up default diamonds with claim tracking per level
    const levelsGained = Math.max(0, curLevel - oldLevel);
    let levelUpDiamonds = 0;
    if (levelsGained > 0) {
      // Determine which levels are newly reached and unclaimed
      const reachedLevels: number[] = Array.from({ length: levelsGained }, (_, i) => oldLevel + 1 + i);
      const { data: claimedRows, error: clmErr } = await supabase
        .from('user_level_claims')
        .select('level')
        .eq('user_id', user.id)
        .in('level', reachedLevels as any);
      if (clmErr) throw clmErr;
      const claimedSet = new Set<number>((claimedRows || []).map((r: any) => r.level));
      const unclaimedLevels = reachedLevels.filter((lvl) => !claimedSet.has(lvl));
      if (unclaimedLevels.length > 0) {
        // Insert claims for these levels (idempotent via PK)
        const claimInserts = unclaimedLevels.map((lvl) => ({ user_id: user.id, level: lvl }));
        const { error: insClaimErr } = await supabase
          .from('user_level_claims')
          .upsert(claimInserts);
        if (insClaimErr) throw insClaimErr;
        // Grant diamonds only for unclaimed levels
        levelUpDiamonds = unclaimedLevels.length * 10;
        const { error: dLErr } = await supabase
          .from('diamond_ledger')
          .insert({ user_id: user.id, delta: levelUpDiamonds, reason: 'level_up' });
        if (dLErr) throw dLErr;
        const { error: dUpdErr } = await supabase
          .from('user_progress')
          .update({ diamonds: diamonds + levelUpDiamonds })
          .eq('user_id', user.id);
        if (dUpdErr) throw dUpdErr;
        diamonds += levelUpDiamonds;
      }
    }

    // Reload progress to capture diamonds granted by the DB trigger for reward groups
    const { data: postProg, error: postErr } = await supabase
      .from('user_progress')
      .select('diamonds')
      .eq('user_id', user.id)
      .maybeSingle();
    if (postErr) throw postErr;
    const diamondsAfter = postProg?.diamonds ?? diamonds;

    // Diamonds granted by rewards (beyond level-up diamonds)
    const rewardDiamonds = Math.max(0, diamondsAfter - (diamonds));

    // Build notifications
    const origin = (() => {
      try { return new URL((req as any).url).origin; } catch { return ''; }
    })();
    const secret = process.env.CRON_SECRET || '';
    const notify = async (title: string, body: string, url: string) => {
      if (!origin || !secret) return;
      try {
        await fetch(`${origin}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
          body: JSON.stringify({ userId: user.id, focused: true, push: true, title, body, url })
        });
      } catch {}
    };

    // Always notify task completion
    await notify('Task completed', `You earned +${ep_awarded} EP`, '/tasks');

    // Level up notification
    if (levelsGained > 0) {
      await notify('Level up!', `You reached level ${curLevel}. +${levelUpDiamonds} diamonds`, '/rewards');
    }

    // Reward diamonds notification (from grouped rewards)
    if (rewardDiamonds > 0) {
      await notify('Reward earned', `You received +${rewardDiamonds} diamonds`, '/rewards');
    }

    return NextResponse.json({
      completion,
      progress: { level: curLevel, ep_in_level: curEp, total_ep: newTotal, diamonds: diamondsAfter },
      rewards: {
        level_up_diamonds: levelUpDiamonds,
        reward_diamonds: rewardDiamonds,
        total_diamonds_awarded: levelUpDiamonds + rewardDiamonds,
        collectibles: [],
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

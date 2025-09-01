import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/utils/auth';
import { maybeGenerateTaunt } from '@/utils/shadow/tauntEngine';

// POST /api/shadow/taunts/maybe
// Optional query: ?force=1 to force critical check
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === '1' || url.searchParams.get('critical') === '1';
    const r = await maybeGenerateTaunt(user.id, { forceCritical: force, adminInsertAlsoToUserMessages: true });
    return NextResponse.json(r);
  } catch (e: any) {
    const msg = e?.name === 'AuthenticationError' ? 'Unauthorized' : (e?.message || 'Unknown error');
    const status = e?.name === 'AuthenticationError' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

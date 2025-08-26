import { NextRequest, NextResponse } from 'next/server';

// This endpoint is deprecated. Use /api/life-streak/finalize instead.
export async function GET(_req: NextRequest) {
  return NextResponse.json({ error: 'Deprecated. Use /api/life-streak/finalize' }, { status: 410 });
}

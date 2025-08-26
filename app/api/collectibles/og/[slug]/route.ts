import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET /api/collectibles/og/[slug]
// Public OG card (no auth). Always returns an SVG preview card for the collectible.
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  try {
    const supabase = createClient();
    const slug = decodeURIComponent(params.slug || '').trim();
    if (!slug) return NextResponse.json({ error: 'Bad slug' }, { status: 400 });

    const { data: col } = await supabase
      .from('collectibles')
      .select('name, icon, rarity, is_private')
      .eq('public_slug', slug)
      .maybeSingle();

    if (!col) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (col.is_private) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const rarity = (col.rarity || 'common').toLowerCase();
    const grad = rarity === 'epic' ? '#a855f7,#f59e0b' : rarity === 'rare' ? '#3b82f6,#10b981' : '#9ca3af,#d1d5db';
    const [from, to] = grad.split(',');
    const iconHref = col.icon && (col.icon.startsWith('http') || col.icon.startsWith('/'))
      ? col.icon
      : (col.icon ? `/images/collectibles/${col.icon}.svg` : '/images/collectibles/default.svg');

    // Small copy line to convey effort and motivation
    const effortLines = [
      'Built with consistency and grit',
      'Days of discipline turned into progress',
      'Small habits, big transformation',
    ];
    const effort = effortLines[Math.floor(Math.random() * effortLines.length)];

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="30"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g opacity="0.15" filter="url(#blur)">
    <circle cx="220" cy="140" r="220" fill="#fff"/>
    <circle cx="1080" cy="560" r="220" fill="#fff"/>
  </g>
  <rect x="60" y="60" width="1080" height="510" rx="28" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.45)"/>

  <g>
    <image href="${iconHref}" x="100" y="120" width="400" height="400" preserveAspectRatio="xMidYMid slice"/>
    <g>
      <text x="540" y="210" fill="#ffffff" font-family="Inter, ui-sans-serif, system-ui" font-size="50" font-weight="800">${escapeXml(col.name || 'Collectible')}</text>
      <text x="540" y="265" fill="#e5e7eb" font-family="Inter, ui-sans-serif, system-ui" font-size="22" font-weight="600">${(col.rarity || 'Common').toUpperCase()} • Preview</text>
      <text x="540" y="320" fill="#ffffff" opacity="0.95" font-family="Inter, ui-sans-serif, system-ui" font-size="24">${escapeXml(effort)}</text>
      <text x="540" y="470" fill="#ffffff" opacity="0.9" font-family="Inter, ui-sans-serif, system-ui" font-size="20">Shared from Nourish</text>
    </g>
  </g>
</svg>`;

    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

function escapeXml(str: string) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

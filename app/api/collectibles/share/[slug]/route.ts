import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';

// GET /api/collectibles/share/[slug]
// Returns a simple personalized SVG share image if the current user owns the collectible
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient();

    const url = new URL(req.url);
    const preview = url.searchParams.get('preview') === '1';
    const referer = req.headers.get('referer') || '';
    const sameOrigin = referer.startsWith(`${url.origin}/`);
    const adminPreview = preview && sameOrigin && referer.includes('/admin/collectibles');

    const slug = decodeURIComponent(params.slug || '').trim();
    if (!slug) return NextResponse.json({ error: 'Bad slug' }, { status: 400 });

    const { data: col } = await supabase
      .from('collectibles')
      .select('id, name, icon, rarity, og_image_url')
      .eq('public_slug', slug)
      .maybeSingle();
    if (!col) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: owned } = await supabase
      .from('user_collectibles')
      .select('awarded_to_name, acquired_at')
      .eq('user_id', user.id)
      .eq('collectible_id', col.id)
      .maybeSingle();

    // If not owned, allow a generic admin preview (no personalized data)
    const isOwned = !!owned;
    const awardedName = isOwned ? (owned!.awarded_to_name || 'You') : '';
    const date = isOwned && owned!.acquired_at ? new Date(owned!.acquired_at) : new Date();
    const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    if (!isOwned && !adminPreview) {
      return NextResponse.json({ error: 'Locked' }, { status: 403 });
    }

    // Basic SVG share card
    const bgGrad = col.rarity === 'epic' ? '#a855f7,#f59e0b' : col.rarity === 'rare' ? '#3b82f6,#10b981' : '#9ca3af,#d1d5db';
    const [from, to] = bgGrad.split(',');
    const iconHref = col.icon && (col.icon.startsWith('http') || col.icon.startsWith('/')) ? col.icon : (col.icon ? `/images/collectibles/${col.icon}.svg` : '/images/collectibles/default.svg');

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <filter id="b" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="30"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g opacity="0.15" filter="url(#b)">
    <circle cx="200" cy="120" r="200" fill="#fff"/>
    <circle cx="1100" cy="560" r="200" fill="#fff"/>
  </g>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)"/>
  <image href="${iconHref}" x="100" y="120" width="390" height="390" preserveAspectRatio="xMidYMid slice"/>
  <g>
    <text x="520" y="210" fill="#ffffff" font-family="Inter, ui-sans-serif, system-ui" font-size="48" font-weight="800">${col.name}</text>
    ${isOwned ? `<text x="520" y="270" fill="#ffffff" font-family="Inter, ui-sans-serif, system-ui" font-size="26" font-weight="600">Awarded to ${awardedName}</text>` : `<text x=\"520\" y=\"270\" fill=\"#ffffff\" font-family=\"Inter, ui-sans-serif, system-ui\" font-size=\"22\" font-weight=\"600\">Preview</text>`}
    <text x="520" y="315" fill="#e5e7eb" font-family="Inter, ui-sans-serif, system-ui" font-size="22">${col.rarity ? col.rarity.toUpperCase() : 'COLLECTIBLE'}</text>
    ${isOwned ? `<text x="520" y="365" fill="#e5e7eb" font-family="Inter, ui-sans-serif, system-ui" font-size="20">Unlocked on ${dateStr}</text>` : ''}
    <text x="520" y="470" fill="#ffffff" opacity="0.9" font-family="Inter, ui-sans-serif, system-ui" font-size="20">Shared from Nourish</text>
  </g>
</svg>`;

    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

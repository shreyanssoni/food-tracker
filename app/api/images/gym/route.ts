import { NextRequest, NextResponse } from 'next/server';

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';

function buildQueries(mode: 'male' | 'female' | 'mix') {
  const male = [
    'male gym physique, fitness body, abs, strength, bodybuilding, aesthetic',
    'athletic male body, gym, physique, shredded, abs, motivation',
    'men workout gym strength, physique, bodybuilding, athletic',
    'calisthenics male outdoor workout, bars, bodyweight, street workout',
    'male powerlifting strength, deadlift, squat, bench press, barbell',
    'male cardio running treadmill, rowing, bike, conditioning',
  ];
  const female = [
    'female gym physique, fitness body, abs, strength, bodybuilding, aesthetic',
    'athletic woman body, gym, physique, shredded, abs, motivation',
    'women workout gym strength, physique, bodybuilding, athletic',
    'yoga strong woman, flexibility, stretching, balance',
    'female powerlifting strength, squat, deadlift, bench, barbell',
    'female cardio running treadmill, cycling, conditioning',
  ];
  if (mode === 'male') return male;
  if (mode === 'female') return female;
  const out: string[] = [];
  const m = male.slice();
  const f = female.slice();
  while (m.length || f.length) {
    if (m.length) out.push(m.shift()!);
    if (f.length) out.push(f.shift()!);
  }
  return out;
}

async function searchUnsplash(query: string, perPage: number, page: number, orientation: 'portrait'|'landscape'|'squarish', orderBy: 'relevant'|'latest') {
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', orientation);
  url.searchParams.set('content_filter', 'high');
  url.searchParams.set('order_by', orderBy);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', String(page));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Unsplash error ${res.status}`);
  const data = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  // Deduplicate by ID within this page
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const r of results) {
    const id = r?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const src: string = r?.urls?.regular || r?.urls?.small || r?.urls?.full || '';
    if (src) urls.push(src);
  }
  return urls;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const modeRaw = (searchParams.get('mode') || 'mix').toLowerCase();
    const mode = (['male', 'female', 'mix'].includes(modeRaw) ? modeRaw : 'mix') as 'male'|'female'|'mix';
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const requested = Number(searchParams.get('count') || 10);
    // keep page size reasonable; default 10; min 6, max 10
    const count = Math.max(6, Math.min(10, isFinite(requested) ? requested : 10));

    if (!UNSPLASH_ACCESS_KEY) {
      // Fallback: generate client-side style Source URLs deterministically
      const sizes: Array<[number, number]> = [ [600,800], [500,700], [700,900], [600,600], [800,1000], [500,900] ];
      const maleQ = 'male gym physique,fitness body,abs,strength,bodybuilding,aesthetic';
      const femaleQ = 'female gym physique,fitness body,abs,strength,bodybuilding,aesthetic';
      const urls: string[] = [];
      for (let i=0;i<count;i++) {
        const [w,h] = sizes[i % sizes.length];
        const q = mode === 'mix' ? (i % 2 === 0 ? maleQ : femaleQ) : (mode === 'male' ? maleQ : femaleQ);
        const sig = (page - 1) * count + i + 101;
        urls.push(`https://source.unsplash.com/featured/${w}x${h}/?${encodeURIComponent(q)}&sig=${sig}`);
      }
      return NextResponse.json({ urls });
    }

    // With API key: vary orientation/order to increase variety, and dedupe
    const queries = buildQueries(mode);
    const orientations: Array<'portrait'|'landscape'|'squarish'> = ['portrait','landscape','squarish'];
    const orientation = orientations[(page - 1) % orientations.length];
    const orderBy: 'relevant'|'latest' = ((page % 2) === 0 ? 'latest' : 'relevant');
    const q = queries[(page - 1) % queries.length];
    let urls = await searchUnsplash(q, count, page, orientation, orderBy);
    // If Unsplash returns fewer than requested, pad from next query/topic
    if (urls.length < count) {
      const q2 = queries[page % queries.length];
      const more = await searchUnsplash(q2, count - urls.length, 1, orientation, orderBy);
      urls = urls.concat(more);
    }
    // Final dedupe in case of overlap between q and q2, then shuffle slightly
    const unique = Array.from(new Set(urls));
    // light shuffle
    unique.sort(() => Math.random() - 0.5);
    return NextResponse.json({ urls: unique.slice(0, count) });
  } catch (e) {
    return NextResponse.json({ urls: [] }, { status: 200 });
  }
}

export const dynamic = 'force-dynamic';

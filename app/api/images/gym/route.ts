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

// Simple in-memory cache to reduce repeated Unsplash calls
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { urls: string[]; at: number }>();

async function searchUnsplash(
  query: string,
  perPage: number,
  page: number,
  orientation: 'portrait'|'landscape'|'squarish',
  orderBy: 'relevant'|'latest',
  opts?: { must?: string[]; exclude?: string[]; }
) {
  const must = (opts?.must || []).map((s) => s.toLowerCase());
  const exclude = (opts?.exclude || []).map((s) => s.toLowerCase());
  const cacheKey = JSON.stringify({ query, perPage, page, orientation, orderBy, must, exclude });
  const hit = cache.get(cacheKey);
  if (hit && (Date.now() - hit.at) < CACHE_TTL_MS) {
    return hit.urls.slice();
  }
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
  // Deduplicate by ID within this page and apply basic relevance filtering
  const seen = new Set<string>();
  const urls: string[] = [];
  const gymAnchors = ['gym','workout','fitness','bodybuilding','calisthenics','yoga','cardio','powerlifting'];
  for (const r of results) {
    const id = r?.id;
    if (!id || seen.has(id)) continue;
    const textParts: string[] = [];
    const alt = (r?.alt_description || '').toString();
    const desc = (r?.description || '').toString();
    if (alt) textParts.push(alt);
    if (desc) textParts.push(desc);
    const tags = Array.isArray(r?.tags) ? r.tags : [];
    for (const t of tags) {
      const title = (t?.title || t?.type || '').toString();
      if (title) textParts.push(title);
    }
    const hay = textParts.join(' ').toLowerCase();
    const hasExclude = exclude.length && exclude.some((x) => hay.includes(x));
    if (hasExclude) continue;
    // Require at least one gym anchor to avoid scenic results
    const hasGym = gymAnchors.some((x) => hay.includes(x));
    if (!hasGym) continue;
    // Topic relevance: at least one of provided must terms
    const hasMust = must.length ? must.some((x) => hay.includes(x)) : true;
    if (!hasMust) continue;
    seen.add(id);
    const src: string = r?.urls?.regular || r?.urls?.small || r?.urls?.full || '';
    if (src) urls.push(src);
  }
  cache.set(cacheKey, { urls, at: Date.now() });
  return urls;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const modeRaw = (searchParams.get('mode') || 'mix').toLowerCase();
    const mode = (['male', 'female', 'mix'].includes(modeRaw) ? modeRaw : 'mix') as 'male'|'female'|'mix';
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const requested = Number(searchParams.get('count') || 10);
    const topic = (searchParams.get('topic') || '').trim();
    // keep page size reasonable; default 10; min 6, max 10
    const count = Math.max(6, Math.min(10, isFinite(requested) ? requested : 10));

    if (!UNSPLASH_ACCESS_KEY) {
      // Fallback: generate client-side style Source URLs deterministically
      const sizes: Array<[number, number]> = [ [600,800], [500,700], [700,900], [600,600], [800,1000], [500,900] ];
      const baseMale = topic ? `${topic},male,gym,fitness,physique` : 'male gym physique,fitness body,abs,strength,bodybuilding,aesthetic';
      const baseFemale = topic ? `${topic},female,gym,fitness,physique` : 'female gym physique,fitness body,abs,strength,bodybuilding,aesthetic';
      const urls: string[] = [];
      for (let i=0;i<count;i++) {
        const [w,h] = sizes[i % sizes.length];
        const q = mode === 'mix' ? (i % 2 === 0 ? baseMale : baseFemale) : (mode === 'male' ? baseMale : baseFemale);
        const sig = (page - 1) * count + i + 101;
        urls.push(`https://source.unsplash.com/featured/${w}x${h}/?${encodeURIComponent(q)}&sig=${sig}`);
      }

      // 6) If still nothing, synthesize generic gym Source URLs as a final client-friendly fallback
      if (urls.length === 0) {
        const sizes: Array<[number, number]> = [ [600,800], [500,700], [700,900], [600,600], [800,1000], [500,900] ];
        const baseMale = `${topic},male,gym,fitness,physique`;
        const baseFemale = `${topic},female,gym,fitness,physique`;
        for (let i=0;i<count;i++) {
          const [w,h] = sizes[i % sizes.length];
          const q = mode === 'mix' ? (i % 2 === 0 ? baseMale : baseFemale) : (mode === 'male' ? baseMale : baseFemale);
          const sig = (page - 1) * count + i + 501;
          urls.push(`https://source.unsplash.com/featured/${w}x${h}/?${encodeURIComponent(q)}&sig=${sig}`);
        }
      }
      return NextResponse.json({ urls, meta: { usedFallback: true, reason: 'no-key', source: 'source' } });
    }

    // With API key
    const orientations: Array<'portrait'|'landscape'|'squarish'> = ['portrait','landscape','squarish'];
    const orientation = orientations[(page - 1) % orientations.length];

    let urls: string[] = [];
    let usedFallback = false;
    let reason = '';
    if (topic) {
      // Stable ordering per topic with progressive fallback to avoid empty results
      const genderHint = mode === 'mix' ? '' : (mode === 'male' ? 'male' : 'female');
      const coreMust = ['gym','workout','fitness','training'];
      const topicTokens = topic.split(/\s+/).filter(Boolean);
      const isQuotes = /\bquote/i.test(topic) || /\bquotes/i.test(topic) || /poster/i.test(topic);
      const quotesMust = ['quote','quotes','poster','typography','text','inspirational','motivation'];
      const exclude = [
        'nature','landscape','mountain','beach','ocean','sea','travel','scenic','sunset','sunrise','forest','flower','animal','dog','cat',
        'sky','cloud','park','snow','waterfall','food','recipe','wedding','baby','architecture','cityscape','interior design'
      ];

      // 1) Primary strict-ish query
      const q1 = (isQuotes
        ? `gym motivational quotes poster typography ${genderHint}`
        : `${topic} ${genderHint} gym workout fitness training`
      ).trim();
      const must1 = Array.from(new Set([...coreMust, ...topicTokens, ...(isQuotes ? quotesMust : [])]));
      try {
        urls = await searchUnsplash(q1, count, page, orientation, 'relevant', { must: must1, exclude });
      } catch (e: any) {
        usedFallback = true;
        const msg = String(e?.message || '');
        if (!reason) {
          if (/401/.test(msg)) reason = 'unauthorized';
          else if (/403/.test(msg)) reason = 'rate-limit';
          else reason = 'unsplash-error';
        }
        console.error('[images/gym] q1 error:', msg);
        urls = [];
      }

      // 2) If insufficient, keep gym anchors but reduce must terms to gym-only
      if (urls.length < count) {
        const q2 = (isQuotes
          ? `gym quotes poster ${genderHint}`
          : `${topic} ${genderHint} gym training`
        ).trim();
        try {
          const more2 = await searchUnsplash(q2, count - urls.length, page + 1, orientation, 'relevant', { must: isQuotes ? ['quote','poster','gym'] : coreMust, exclude });
          urls = urls.concat(more2);
        } catch (e: any) {
          usedFallback = true;
          const msg = String(e?.message || '');
          if (!reason) {
            if (/401/.test(msg)) reason = 'unauthorized';
            else if (/403/.test(msg)) reason = 'rate-limit';
            else reason = 'unsplash-error';
          }
          console.error('[images/gym] q2 error:', msg);
        }
      }

      // 3) If still insufficient, keep gym anchors mandatory and switch order to latest
      if (urls.length < count) {
        const q3 = (isQuotes
          ? `gym poster ${genderHint}`
          : `${topic} ${genderHint} gym`
        ).trim();
        try {
          const more3 = await searchUnsplash(q3, count - urls.length, page + 2, orientation, 'latest', { must: coreMust, exclude });
          urls = urls.concat(more3);
        } catch (e: any) {
          usedFallback = true;
          const msg = String(e?.message || '');
          if (!reason) {
            if (/401/.test(msg)) reason = 'unauthorized';
            else if (/403/.test(msg)) reason = 'rate-limit';
            else reason = 'unsplash-error';
          }
          console.error('[images/gym] q3 error:', msg);
        }
      }

      // 4) Relax orientation to squarish to widen pool (still keep gym anchors mandatory)
      if (urls.length < count) {
        const q4 = (isQuotes
          ? `gym quotes poster ${genderHint}`
          : `${topic} ${genderHint} workout fitness`
        ).trim();
        try {
          const more4 = await searchUnsplash(q4, count - urls.length, page + 3, 'squarish', 'latest', { must: coreMust, exclude });
          urls = urls.concat(more4);
        } catch (e: any) {
          usedFallback = true;
          const msg = String(e?.message || '');
          if (!reason) {
            if (/401/.test(msg)) reason = 'unauthorized';
            else if (/403/.test(msg)) reason = 'rate-limit';
            else reason = 'unsplash-error';
          }
          console.error('[images/gym] q4 error:', msg);
        }
      }

      // 5) Final generic gym fallback: ensure we never return empty for valid topics (gym anchors retained)
      if (urls.length < count) {
        usedFallback = true; reason = reason || 'topic-fallback';
        const genericQueries = [
          `${genderHint} gym workout fitness training physique`.trim(),
          `${genderHint} gym strength bodybuilding`.trim(),
          `${genderHint} workout gym`.trim(),
        ].filter(Boolean);
        for (let i = 0; i < genericQueries.length && urls.length < count; i++) {
          const gq = genericQueries[i];
          try {
            const moreG = await searchUnsplash(gq, count - urls.length, page + 4 + i, 'portrait', 'relevant', { must: coreMust, exclude });
            urls = urls.concat(moreG);
          } catch {}
        }
      }
    } else {
      // Default variety mode: alternate queries and lightly shuffle
      const queries = buildQueries(mode);
      const orderBy: 'relevant'|'latest' = ((page % 2) === 0 ? 'latest' : 'relevant');
      const q = queries[(page - 1) % queries.length];
      try {
        urls = await searchUnsplash(q, count, page, orientation, orderBy);
      } catch (e: any) {
        usedFallback = true;
        const msg = String(e?.message || '');
        if (!reason) {
          if (/401/.test(msg)) reason = 'unauthorized';
          else if (/403/.test(msg)) reason = 'rate-limit';
          else reason = 'unsplash-error';
        }
        console.error('[images/gym] default q error:', msg);
        urls = [];
      }
      if (urls.length < count) {
        const q2 = queries[page % queries.length];
        try {
          const more = await searchUnsplash(q2, count - urls.length, 1, orientation, orderBy);
          urls = urls.concat(more);
        } catch (e: any) {
          usedFallback = true;
          const msg = String(e?.message || '');
          if (!reason) {
            if (/401/.test(msg)) reason = 'unauthorized';
            else if (/403/.test(msg)) reason = 'rate-limit';
            else reason = 'unsplash-error';
          }
          console.error('[images/gym] default q2 error:', msg);
        }
      }
      // If still empty, synthesize generic gym images to avoid empty state for All
      if (urls.length === 0) {
        usedFallback = true; reason = reason || 'default-fallback';
        const sizes: Array<[number, number]> = [ [600,800], [500,700], [700,900], [600,600], [800,1000], [500,900] ];
        const baseMale = 'male gym physique,fitness body,abs,strength,bodybuilding,aesthetic';
        const baseFemale = 'female gym physique,fitness body,abs,strength,bodybuilding,aesthetic';
        for (let i=0;i<count;i++) {
          const [w,h] = sizes[i % sizes.length];
          const qG = mode === 'mix' ? (i % 2 === 0 ? baseMale : baseFemale) : (mode === 'male' ? baseMale : baseFemale);
          const sig = (page - 1) * count + i + 701;
          urls.push(`https://source.unsplash.com/featured/${w}x${h}/?${encodeURIComponent(qG)}&sig=${sig}`);
        }
      }
      // dedupe then light shuffle for variety
      const unique = Array.from(new Set(urls));
      unique.sort(() => Math.random() - 0.5);
      urls = unique.slice(0, count);
      return NextResponse.json({ urls, meta: { usedFallback, reason, source: usedFallback ? 'source' : 'unsplash' } });
    }

    // topic mode: return as-is (deduped by searchUnsplash) with stable order
    return NextResponse.json({ urls, meta: { usedFallback, reason, source: usedFallback ? 'source' : 'unsplash' } });
  } catch (e) {
    // As a last resort, return generic gym images so UI never appears empty
    try {
      const { searchParams } = new URL(req.url);
      const modeRaw = (searchParams.get('mode') || 'mix').toLowerCase();
      const mode = (['male', 'female', 'mix'].includes(modeRaw) ? modeRaw : 'mix') as 'male'|'female'|'mix';
      const page = Math.max(1, Number(searchParams.get('page') || 1));
      const requested = Number(searchParams.get('count') || 10);
      const count = Math.max(6, Math.min(10, isFinite(requested) ? requested : 10));
      const topic = (searchParams.get('topic') || '').trim();
      const sizes: Array<[number, number]> = [ [600,800], [500,700], [700,900], [600,600], [800,1000], [500,900] ];
      const baseMale = topic ? `${topic},male,gym,fitness,physique` : 'male gym physique,fitness body,abs,strength,bodybuilding,aesthetic';
      const baseFemale = topic ? `${topic},female,gym,fitness,physique` : 'female gym physique,fitness body,abs,strength,bodybuilding,aesthetic';
      const urls: string[] = [];
      for (let i=0;i<count;i++) {
        const [w,h] = sizes[i % sizes.length];
        const q = mode === 'mix' ? (i % 2 === 0 ? baseMale : baseFemale) : (mode === 'male' ? baseMale : baseFemale);
        const sig = (page - 1) * count + i + 901;
        urls.push(`https://source.unsplash.com/featured/${w}x${h}/?${encodeURIComponent(q)}&sig=${sig}`);
      }
      return NextResponse.json({ urls, meta: { usedFallback: true, reason: 'catch-fallback', source: 'source' } });
    } catch {
      return NextResponse.json({ urls: [] }, { status: 200 });
    }
  }
}

export const dynamic = 'force-dynamic';

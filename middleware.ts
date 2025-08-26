import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Upstash Redis (edge) for rate limiting
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;

const limiterDefault = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m') }) : null; // 60 req/min/IP default
const limiterAI = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m') }) : null; // AI endpoints
const limiterSendTest = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m') }) : null; // device test
const limiterSendToUser = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, '1 m') }) : null; // targeted sends
const limiterScheduler = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(2, '1 m') }) : null; // scheduler

function getClientIp(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    (req as any).ip ||
    '0.0.0.0'
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect old /me route to /motivation (preserve subpaths and query)
  if (pathname === '/me' || pathname.startsWith('/me/')) {
    const target = pathname.replace(/^\/me(\/|$)/, '/motivation$1');
    const url = new URL(request.url);
    url.pathname = target;
    return NextResponse.redirect(url);
  }

  // Authenticated users landing on home should go to Today (/dashboard)
  if (pathname === '/') {
    try {
      const token = await getToken({ 
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
        secureCookie: process.env.NODE_ENV === 'production',
      });
      if (token) {
        const url = new URL('/dashboard', request.url);
        return NextResponse.redirect(url);
      }
    } catch {}
  }

  // Edge rate limiting for API routes (even if public), if Upstash configured
  if (redis && pathname.startsWith('/api/')) {
    const ip = getClientIp(request);
    const isVercelCron = request.headers.get('x-vercel-cron');
    const providedSecret = request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret') || '';
    const cronSecret = process.env.CRON_SECRET || '';
    const isAuthorizedCron = !!cronSecret && providedSecret === cronSecret;
    // Allow Vercel Cron or authorized x-cron-secret through (still low volume)
    if (!isVercelCron && !isAuthorizedCron) {
      let result: { success: boolean } | null = null;
      if (pathname.startsWith('/api/ai/')) {
        result = await limiterAI!.limit(`ai:${ip}`);
      } else if (pathname.startsWith('/api/push/send-test')) {
        result = await limiterSendTest!.limit(`sendtest:${ip}`);
      } else if (pathname.startsWith('/api/push/send-to-user')) {
        result = await limiterSendToUser!.limit(`senduser:${ip}`);
      } else if (pathname.startsWith('/api/push/run-scheduler')) {
        result = await limiterScheduler!.limit(`sched:${ip}`);
      } else {
        result = await limiterDefault!.limit(`api:${ip}`);
      }
      if (result && !result.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
    }
  }
  
  // Public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/auth/signin',
    '/auth/error',
    '/api/auth/[...nextauth]',
    '/api/push/run-scheduler',
    '/api/push/send-to-user',
    '/api/push/send-test',
    '/api/push/send-test-admin',
    // Cron/maintenance endpoints that self-authorize via x-cron-secret or x-vercel-cron
    '/api/tasks/reminders/run',
    '/api/streaks/pre-eod-reminder',
    '/api/life-streak/run-eod',
    '/api/tasks/maintenance/once',
    '/api/ai',
    '/api/trpc',
    '/_next',
    '/_vercel',
    '/public',
    '/favicon.ico',
  ];

  // Check if the current route is public
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  );

  // Skip auth gate for public routes and static files
  if (isPublicRoute || 
      pathname.includes('.') || // Skip files with extensions
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/api/trpc/') ||
      pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  try {
    // Get the session token
    const token = await getToken({ 
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NODE_ENV === 'production',
    });

    // Redirect to homepage if not authenticated
    if (!token) {
      const homeUrl = new URL('/', request.url);
      homeUrl.searchParams.set('callbackUrl', encodeURIComponent(pathname));
      return NextResponse.redirect(homeUrl);
    }

    // Add user ID to request headers for API routes
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', token.sub || '');
    
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    return response;
  } catch (error) {
    console.error('Authentication error:', error);
    
    // Redirect to error page on auth errors
    const errorUrl = new URL('/auth/error', request.url);
    errorUrl.searchParams.set('error', 'SessionError');
    return NextResponse.redirect(errorUrl);
  }
}

// Configure which routes to run the middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api/auth (auth routes)
     */
    '/((?!_next/static|_next/image|favicon.ico|public/|api/auth/).*)',
  ],
};

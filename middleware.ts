import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/auth/signin',
    '/auth/error',
    '/api/auth/[...nextauth]',
    '/api/push/run-scheduler',
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

  // Skip middleware for public routes and static files
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

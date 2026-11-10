import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { isPublicPath } from '@/lib/public-paths';

export async function middleware(request: NextRequest) {
    // The workspace layout decides which pages an account may open, and it renders above the route's
    // `loading.tsx` boundary — so its redirect is a real 307. A layout cannot read the pathname, so
    // the proxy hands it over. Without this, the guard runs after the shell has streamed and Next
    // falls back to a client meta redirect, which races the alert poll's Server Action and crashes
    // the router with React error #310.
    const headers = new Headers(request.headers);
    headers.set('x-pathname', request.nextUrl.pathname);
    const forward = () => NextResponse.next({ request: { headers } });

    // Marketing, public ticker and comparison pages, robots.txt and sitemap.xml.
    // The signed-in app (/stocks, /dashboard, /watchlist, /profile) still requires a session cookie.
    if (isPublicPath(request.nextUrl.pathname)) return forward();

    const sessionCookie = getSessionCookie(request);

    // Check cookie presence - prevents obviously unauthorized users
    if (!sessionCookie) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
    }

    return forward();
}

export const config = {
    matcher: [
        // robots.txt and sitemap.xml are excluded so a crawler is never sent to sign-in,
        // even if the public-path list above is edited later.
        '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sign-in|sign-up|forgot-password|reset-password|assets).*)',
    ],
};

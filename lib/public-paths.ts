// Exact paths the marketing site already served, plus the public SEO sections.
// Prefix checks are whole segments: `/s` must not unlock `/stocks` or `/sponsor`.
export const PUBLIC_EXACT_PATHS = [
    '/',
    '/about',
    '/help',
    '/terms',
    '/api-docs',
    '/s',
    '/compare',
] as const;

const EXACT = new Set<string>(PUBLIC_EXACT_PATHS);

// Next's metadata files: the favicon, the PWA manifest and the generated share images are fetched
// by crawlers and by signed-out visitors, so the auth middleware must let them through.
const PUBLIC_METADATA_PATHS = ['/favicon.ico', '/manifest.webmanifest'];
const PUBLIC_METADATA_PREFIXES = ['/icon', '/apple-icon', '/opengraph-image', '/twitter-image'];

export function isPublicPath(pathname: string): boolean {
    if (EXACT.has(pathname)) return true;
    if (PUBLIC_METADATA_PATHS.includes(pathname)) return true;
    if (PUBLIC_METADATA_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
    if (pathname === '/robots.txt' || pathname === '/sitemap.xml') return true;
    // The service worker must be reachable without a session: a browser fetching it while
    // signed out must not be redirected to sign-in, or push registration silently fails.
    if (pathname === '/sw.js') return true;
    if (pathname.startsWith('/s/')) return true;
    if (pathname.startsWith('/compare/')) return true;
    return false;
}

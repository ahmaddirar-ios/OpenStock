import type { MetadataRoute } from 'next';

// The installable-app manifest. Colours match the app shell (graphite) and the
// brand lime is left for the theme accent, not the splash background.
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Rovex — the market, unfiltered',
        short_name: 'Rovex',
        description:
            'A trading terminal for the exchanges the big platforms leave out: charts, studies, alerts and a paper desk, in Arabic and English.',
        start_url: '/dashboard',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#08090b',
        theme_color: '#08090b',
        icons: [
            // PNG for the install prompts that refuse SVG (Android's mask), SVG for everything modern.
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
    };
}

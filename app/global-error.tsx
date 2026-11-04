'use client';

// The last resort: the root layout itself failed, so this file replaces the whole document.
// It has to carry its own <html> and <body>, and it cannot rely on any app chrome.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <html lang="en" dir="ltr">
            <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#08090b', color: '#e9edf5', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
                <main style={{ padding: '40px 24px', textAlign: 'center', maxWidth: 520 }}>
                    <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c8f45b' }}>Rovex</p>
                    <h1 style={{ margin: '12px 0 8px', fontSize: 30, lineHeight: 1.1, letterSpacing: '-0.03em' }}>The app could not start.</h1>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#8b93a7' }}>
                        Nothing you did caused this. Reload the page; the digest below is the one line support needs.
                    </p>
                    {error.digest && (
                        <code style={{ display: 'inline-block', marginTop: 14, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', fontSize: 12, color: '#8b93a7' }}>
                            {error.digest}
                        </code>
                    )}
                    <div style={{ marginTop: 22 }}>
                        <button
                            type="button"
                            onClick={reset}
                            style={{ height: 40, padding: '0 20px', borderRadius: 12, border: 0, background: '#c8f45b', color: '#0a0b0d', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                        >
                            Reload
                        </button>
                    </div>
                </main>
            </body>
        </html>
    );
}

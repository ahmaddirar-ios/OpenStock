'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// A failed render should still look like Rovex. The reset button re-mounts the segment,
// which is enough for the transient failures (a stalled fetch, a bad cache entry).
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        // The message is the only thing the browser has; the digest ties it to the server log.
        console.error('render failed', error.digest ?? '', error.message);
    }, [error]);

    return (
        <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="kicker text-brand-ink">Error</p>
            <h1 className="text-[30px] font-bold tracking-[-0.03em]">That page did not load.</h1>
            <p className="max-w-md text-[14px] leading-relaxed text-muted-foreground">
                Something broke on our side, not yours. Try again — if it keeps happening, the digest below is what we need to find it.
            </p>
            {error.digest && <code className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-[12px] text-faint">{error.digest}</code>}
            <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={reset} className="btn btn-primary h-10 px-5">Try again</button>
                <Link href="/dashboard" className="btn btn-ghost h-10 px-5">Dashboard</Link>
            </div>
        </div>
    );
}

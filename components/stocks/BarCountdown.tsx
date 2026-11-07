'use client';

import { Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatCountdown, secondsToBarClose } from '@/lib/chart-countdown';
import { arDigits, tx, type Lang } from '@/lib/i18n';

/**
 * The little clock under the newest bar. Presentational on purpose: the page decides which bar is
 * newest and whether replay owns the edge, and this only ticks once a second while there is a bar
 * that is actually still open.
 */
export default function BarCountdown({
    lastTime,
    intervalId,
    lang,
}: {
    /** Start of the newest bar, in seconds since the epoch. */
    lastTime: number;
    intervalId: string;
    lang: Lang;
}) {
    // Read after mount: the server's clock and the browser's would otherwise disagree in the markup.
    const [now, setNow] = useState(() => Date.now() / 1000);

    useEffect(() => {
        setNow(Date.now() / 1000);
        const timer = window.setInterval(() => setNow(Date.now() / 1000), 1000);
        return () => window.clearInterval(timer);
    }, [lastTime, intervalId]);

    const left = secondsToBarClose(lastTime, intervalId, now);
    if (left == null) return null;

    return (
        <div
            data-countdown="bar"
            className="pointer-events-none absolute bottom-10 end-2 z-[2] flex items-center gap-1 rounded-full bg-card/80 px-2 py-0.5 text-[11px] text-faint shadow-[0_0_0_1px_var(--line)] backdrop-blur-[2px]"
            aria-label={`${tx(lang, 'chart.countdown')} ${formatCountdown(left)}`}
        >
            <Timer className="size-3" aria-hidden="true" />
            <bdi className="num tabular-nums text-foreground">{arDigits(formatCountdown(left), lang)}</bdi>
        </div>
    );
}

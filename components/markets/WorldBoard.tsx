'use client';

import { useEffect, useState } from 'react';
import DataFreshness from '@/components/DataFreshness';
import MarketWatchTable from '@/components/markets/MarketWatchTable';
import { tx, type Lang } from '@/lib/i18n';
import type { WorldBoardPayload } from '@/lib/world-board';

/**
 * The world board: five sections, each a small table of what a trader reads before the open.
 * Prices come from the same delayed feed as the rest of the app, so the header says how old the tape
 * is and every row keeps its own change rather than pretending to be a live ticker.
 */
export default function WorldBoard({ initial, lang }: { initial: WorldBoardPayload; lang: Lang }) {
    const [board, setBoard] = useState(initial);

    // The server refreshes at most once a minute; polling follows that pace and stops when the tab is
    // in the background, so an open tab is not traffic. A stored board is not polled at all.
    useEffect(() => {
        if (initial.stale) return;
        let cancelled = false;
        const load = async () => {
            if (document.visibilityState !== 'visible') return;
            try {
                const res = await fetch('/api/world/market');
                if (res.ok && !cancelled) setBoard(await res.json());
            } catch {
                // A failed poll leaves the last board on screen; the next tick tries again.
            }
        };
        const timer = window.setInterval(load, 60_000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [initial.stale]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                <DataFreshness tradeTime={Math.round(board.asOf / 1000)} delayed lang={lang} />
                {board.stale && <span className="pill is-up text-[11px]">{tx(lang, 'world.stale')}</span>}
            </div>

            {/* One table, sections as header rows — the way the terminal docks its market watch. */}
            <div className="card overflow-x-auto p-0">
                <MarketWatchTable sections={board.sections} lang={lang} density="page" />
            </div>

            <p className="px-1 text-[11.5px] text-faint">{tx(lang, 'world.footer')}</p>
        </div>
    );
}

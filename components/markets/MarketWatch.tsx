'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import MarketWatchTable from '@/components/markets/MarketWatchTable';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import { filterSections } from '@/lib/market-watch';
import type { WorldBoardPayload } from '@/lib/world-board';

/**
 * The market-watch pane that sits beside the chart, the way a terminal docks one: the same world
 * board as /world, filtered on the spot, one compact row per instrument. Rows leave for TradingView
 * because most of these tickers have no page in this app — the pane is a window, not a second app.
 */
export default function MarketWatch({
    initial,
    lang,
    className,
}: {
    initial: WorldBoardPayload;
    lang: Lang;
    className?: string;
}) {
    const [board, setBoard] = useState(initial);
    const [query, setQuery] = useState('');

    // The board is a minute old at best; follow that pace, and only while the tab is visible. A
    // stored board is already marked stale and is not polled.
    useEffect(() => {
        if (initial.stale) return;
        let cancelled = false;
        const load = async () => {
            if (document.visibilityState !== 'visible') return;
            try {
                const res = await fetch('/api/world/market');
                if (res.ok && !cancelled) setBoard(await res.json());
            } catch {
                // Keep the last board on screen; the next tick tries again.
            }
        };
        const timer = window.setInterval(load, 60_000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [initial.stale]);

    const sections = useMemo(() => filterSections(board.sections, query, lang), [board, query, lang]);
    const total = board.sections.reduce((sum, entry) => sum + entry.quotes.length, 0);

    return (
        <div className={className}>
            <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5">
                <Search className="size-3.5 shrink-0 text-faint" aria-hidden="true" />
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={tx(lang, 'marketWatch.search')}
                    aria-label={tx(lang, 'marketWatch.search')}
                    dir="auto"
                    className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-faint"
                />
                <span className="num shrink-0 text-[10.5px] text-faint" dir="ltr">
                    {arDigits(query ? sections.reduce((n, s) => n + s.quotes.length, 0) : total, lang)}
                </span>
            </div>

            <div className="relative">
                <div className="scrollbar-hide-default max-h-[420px] min-h-[120px] overflow-y-auto overscroll-contain">
                    {sections.length === 0 ? (
                        <p className="px-3 py-6 text-[12.5px] text-faint">{tx(lang, 'marketWatch.empty')}</p>
                    ) : (
                        <MarketWatchTable sections={sections} lang={lang} density="pane" />
                    )}
                </div>
                {/* The list is taller than the pane; the fade says "there is more" without a
                    scrollbar sitting in a 400px column. */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-7"
                    style={{ background: 'linear-gradient(to top, var(--card), transparent)' }}
                />
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5 text-[10.5px] text-faint">
                <span>{board.stale ? tx(lang, 'world.stale') : tx(lang, 'status.delayed')}</span>
                <Link href="/world" className="font-semibold transition-colors hover:text-foreground">
                    {tx(lang, 'nav.world')}
                </Link>
            </div>
        </div>
    );
}

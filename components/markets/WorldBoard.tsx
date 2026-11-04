'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import ChangePill from '@/components/ChangePill';
import DataFreshness from '@/components/DataFreshness';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import { tradingViewSymbolUrl } from '@/lib/utils';
import type { WorldBoardPayload } from '@/lib/world-board';
import type { SectionId } from '@/lib/market-sections';

/** An index is points, a currency is a rate: one number of decimals cannot serve both. */
const decimalsFor = (section: SectionId, short: string): number => {
    if (section === 'currencies') return short.includes('JPY') || short.includes('TRY') ? 2 : 4;
    if (section === 'crypto') return 0;
    return 2;
};

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

            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {board.sections.map(({ section, quotes }) => (
                    <section key={section.id} className="card flex flex-col p-0">
                        <h2 className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                            <span className="text-[13px] font-bold">{tx(lang, section.nameKey)}</span>
                            <span className="num text-[11px] text-faint">
                                {arDigits(quotes.length, lang)}/{arDigits(section.rows.length, lang)}
                            </span>
                        </h2>

                        {quotes.length === 0 ? (
                            <p className="px-4 py-6 text-[13px] text-faint">{tx(lang, 'world.empty')}</p>
                        ) : (
                            <ul className="flex flex-col p-1.5">
                                {quotes.map((quote) => (
                                    <li key={quote.ticker}>
                                        <Link
                                            href={tradingViewSymbolUrl(quote.ticker)}
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-hover/60"
                                        >
                                            <span className="mono w-[4.6rem] shrink-0 text-[11.5px] font-semibold text-faint" dir="ltr">
                                                {quote.short}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                                                {tx(lang, quote.nameKey)}
                                            </span>
                                            <span className="text-end">
                                                <span className="num block text-[13px] font-semibold" dir="ltr">
                                                    {quote.price.toLocaleString('en-US', {
                                                        minimumFractionDigits: decimalsFor(section.id, quote.short),
                                                        maximumFractionDigits: decimalsFor(section.id, quote.short),
                                                    })}
                                                </span>
                                                <span className="num block text-[11px]">
                                                    <ChangePill value={quote.changePercent} lang={lang} />
                                                </span>
                                            </span>
                                            <ExternalLink className="size-3 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                ))}
            </div>

            <p className="px-1 text-[11.5px] text-faint">{tx(lang, 'world.footer')}</p>
        </div>
    );
}

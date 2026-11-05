import { Suspense } from 'react';
import { loadSaudiBoard } from '@/lib/saudi-board';
import { loadWorldBoard } from '@/lib/world-board';
import { compactFigure, formatPrice, ribbonQuotes, signedPercent } from '@/lib/market-ribbon';
import { arDigits, tx, type Lang } from '@/lib/i18n';

/**
 * The market ribbon, the way a trading floor puts one above everything: the home index and its
 * neighbours first, then what the day is worth. It is one 30px line because its job is to be read in
 * a glance and then ignored — the chart below is where the work happens.
 *
 * Prices come from the world board the watch pane already reads; the statistics come from the Saudi
 * scanner, streamed, so the ribbon never holds the chart up and never shifts once they arrive.
 */
async function RibbonStats({ lang }: { lang: Lang }) {
    const board = await loadSaudiBoard(1).catch(() => null);
    if (!board || board.total === 0) return null;

    return (
        <dl className="terminal-ribbon-stats">
            <div>
                <dt>{tx(lang, 'saudi.value')}</dt>
                <dd className="num" dir="ltr">{compactFigure(board.turnover, lang)}</dd>
            </div>
            <div>
                <dt>{tx(lang, 'saudi.shares')}</dt>
                <dd className="num" dir="ltr">{compactFigure(board.volume, lang)}</dd>
            </div>
            <div>
                <dt>{tx(lang, 'saudi.breadth')}</dt>
                <dd className="num" dir="ltr">
                    <span className="is-up">▲ {arDigits(board.breadth.advancers, lang)}</span>
                    <span className="is-down">▼ {arDigits(board.breadth.decliners, lang)}</span>
                </dd>
            </div>
        </dl>
    );
}

export default async function MarketRibbon({ lang }: { lang: Lang }) {
    const board = await loadWorldBoard().catch(() => null);
    const quotes = board ? ribbonQuotes(board) : [];

    // Nothing to say is not an error: the row keeps its height so the grid never jumps when a feed
    // comes back, but it prints no empty labels.
    if (quotes.length === 0) return <div className="terminal-ribbon is-empty" aria-hidden />;

    return (
        <section className="terminal-ribbon" aria-label={tx(lang, 'ribbon.market')}>
            <ul className="terminal-ribbon-quotes">
                {quotes.map((quote) => {
                    const direction = quote.changePercent > 0 ? 'is-up' : quote.changePercent < 0 ? 'is-down' : '';
                    return (
                        <li key={quote.short} className={direction}>
                            <span className="mono terminal-ribbon-sym">{quote.short}</span>
                            <bdi className="num terminal-ribbon-last" dir="ltr">{formatPrice(quote.price, lang)}</bdi>
                            <bdi className="num terminal-ribbon-change" dir="ltr">{signedPercent(quote.changePercent, lang)}</bdi>
                        </li>
                    );
                })}
            </ul>
            <Suspense fallback={null}>
                <RibbonStats lang={lang} />
            </Suspense>
        </section>
    );
}

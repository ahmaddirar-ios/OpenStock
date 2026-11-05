'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import { directionOf, watchChange, watchPrice, type WatchSort, type WatchSortKey } from '@/lib/market-watch';
import { tradingViewSymbolUrl } from '@/lib/utils';
import type { SectionBoard } from '@/lib/world-board';

/**
 * The market-watch table, the way a terminal draws one: market · symbol · name · last · change,
 * the last price leaning with its direction and the change printed in a filled block — one thing
 * the eye can find without reading the row. Two densities — `pane` drops the market column so it
 * fits the column beside a chart, `page` keeps all five.
 *
 * Last and change sort on click, cycling the useful direction, its reverse, then the board's own
 * order. `aria-sort` says which column is ranked and which way.
 *
 * Rows leave for TradingView because most of these tickers have no page in this app.
 */
export default function MarketWatchTable({
    sections,
    lang,
    density = 'pane',
    sort = null,
    onSort,
}: {
    sections: readonly SectionBoard[];
    lang: Lang;
    density?: 'pane' | 'page';
    sort?: WatchSort;
    onSort?: (key: WatchSortKey) => void;
}) {
    const pane = density === 'pane';

    const head = (key: WatchSortKey, className: string, label: string) => {
        const active = sort?.key === key;
        return (
            <th
                className={className}
                scope="col"
                aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
            >
                {onSort ? (
                    <button
                        type="button"
                        onClick={() => onSort(key)}
                        className={`watch-sort${active ? ' is-active' : ''}`}
                    >
                        {label}
                        <span className="watch-sort-mark" aria-hidden="true">
                            {active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                    </button>
                ) : (
                    label
                )}
            </th>
        );
    };

    return (
        <table className={`watch-table ${pane ? 'is-pane' : 'is-page'}`}>
            <thead>
                <tr>
                    <th className="watch-market" scope="col">{tx(lang, 'world.col.market')}</th>
                    <th className="watch-symbol" scope="col">{tx(lang, 'world.col.symbol')}</th>
                    <th className="watch-name" scope="col">{tx(lang, 'world.col.name')}</th>
                    {head('last', 'watch-last is-num', tx(lang, 'world.col.last'))}
                    {head('change', 'watch-change is-num', tx(lang, 'world.col.change'))}
                </tr>
            </thead>
            <tbody>
                {sections.map(({ section, quotes }) => (
                    <Fragment key={section.id}>
                        <tr className="watch-section">
                            <th colSpan={5} scope="colgroup">
                                <span className="watch-section-inner">
                                    <span className="watch-section-name">{tx(lang, section.nameKey)}</span>
                                    <span className="num watch-section-count">
                                        {arDigits(quotes.length, lang)}
                                        {!pane && `/${arDigits(section.rows.length, lang)}`}
                                    </span>
                                </span>
                            </th>
                        </tr>
                        {quotes.map((quote) => {
                            const direction = directionOf(quote.changePercent);
                            return (
                                <tr key={quote.ticker} className={`is-${direction}`}>
                                    <td className="watch-market">{tx(lang, quote.marketKey)}</td>
                                    <td className="watch-symbol">
                                        {/* One left-to-right island: in the mirrored table the badge
                                            would otherwise land after the ticker ("TASI D"). */}
                                        <span className="watch-sym" dir="ltr">
                                            <span className="watch-d" title={tx(lang, 'world.delayedBadge')} aria-hidden="true">D</span>
                                            <span className="mono">{quote.short}</span>
                                        </span>
                                    </td>
                                    <td className="watch-name">
                                        <Link
                                            href={tradingViewSymbolUrl(quote.ticker)}
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            className="watch-name-link"
                                        >
                                            {tx(lang, quote.nameKey)}
                                        </Link>
                                    </td>
                                    <td className={`watch-last is-num is-${direction}`}>
                                        <bdi dir="ltr">{watchPrice(quote.price, section.id, quote.short, lang)}</bdi>
                                    </td>
                                    <td className={`watch-change is-num is-${direction}`}>
                                        <bdi className="watch-block" dir="ltr">{watchChange(quote.changePercent, lang)}</bdi>
                                    </td>
                                </tr>
                            );
                        })}
                    </Fragment>
                ))}
            </tbody>
        </table>
    );
}

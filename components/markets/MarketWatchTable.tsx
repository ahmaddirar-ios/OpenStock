'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import { directionOf, watchChange, watchPrice } from '@/lib/market-watch';
import { tradingViewSymbolUrl } from '@/lib/utils';
import type { SectionBoard } from '@/lib/world-board';

/**
 * The market-watch table, the way a terminal draws one: market · symbol · name · last · change,
 * the row tinted by its direction and the last price filled in the same colour. Two densities —
 * `pane` drops the market column so it fits the column beside a chart, `page` keeps all five.
 *
 * Rows leave for TradingView because most of these tickers have no page in this app.
 */
export default function MarketWatchTable({
    sections,
    lang,
    density = 'pane',
}: {
    sections: readonly SectionBoard[];
    lang: Lang;
    density?: 'pane' | 'page';
}) {
    const pane = density === 'pane';

    return (
        <table className={`watch-table ${pane ? 'is-pane' : 'is-page'}`}>
            <thead>
                <tr>
                    <th className="watch-market" scope="col">{tx(lang, 'world.col.market')}</th>
                    <th className="watch-symbol" scope="col">{tx(lang, 'world.col.symbol')}</th>
                    <th className="watch-name" scope="col">{tx(lang, 'world.col.name')}</th>
                    <th className="watch-last is-num" scope="col">{tx(lang, 'world.col.last')}</th>
                    <th className="watch-change is-num" scope="col">{tx(lang, 'world.col.change')}</th>
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
                                        <bdi dir="ltr">{watchChange(quote.changePercent, lang)}</bdi>
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

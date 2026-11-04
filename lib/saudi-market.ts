// The Saudi market board: gainers, losers, the names that actually traded, and how each sector did.
// Pure functions over quotes so the aggregation is testable without a network or a database.

import type { SaudiQuote } from '@/lib/tradingview-scanner';

/** Nomu (the parallel market) is priced under 9xxx tickers; TASI is everything else. */
export const isNomuSymbol = (symbol: string) => /^9\d{3}\.SR$/.test((symbol || '').trim().toUpperCase());

/** Rial value traded today. Volume is in shares, so price × volume is the turnover. */
export const valueTraded = (quote: SaudiQuote) => quote.volume * quote.price;

export type SectorRow = {
    sector: string;
    count: number;
    avgChange: number;
    valueTraded: number;
};

export type SaudiBoard = {
    total: number;
    breadth: { advancers: number; decliners: number; unchanged: number };
    gainers: SaudiQuote[];
    losers: SaudiQuote[];
    active: { quote: SaudiQuote; value: number }[];
    sectors: SectorRow[];
};

const byChange = (a: SaudiQuote, b: SaudiQuote) => b.changePercent - a.changePercent;

/**
 * Everything the market page shows, from one pass over the quotes.
 *
 * `limit` caps each list. Symbols with no price are already dropped upstream, so every row here
 * has a real number behind it.
 */
export function buildSaudiBoard(quotes: SaudiQuote[], limit = 6): SaudiBoard {
    const priced = quotes.filter((q) => Number.isFinite(q.price) && q.price > 0);
    const sorted = [...priced].sort(byChange);

    const advancers = priced.filter((q) => q.changePercent > 0).length;
    const decliners = priced.filter((q) => q.changePercent < 0).length;

    const sectors = new Map<string, { count: number; change: number; value: number }>();
    for (const quote of priced) {
        const key = quote.sector || 'Other';
        const row = sectors.get(key) ?? { count: 0, change: 0, value: 0 };
        row.count += 1;
        row.change += quote.changePercent;
        row.value += valueTraded(quote);
        sectors.set(key, row);
    }

    return {
        total: priced.length,
        breadth: { advancers, decliners, unchanged: priced.length - advancers - decliners },
        gainers: sorted.slice(0, limit),
        // Losers read from the weakest first, which is the order a trader expects.
        losers: [...sorted].reverse().slice(0, limit),
        active: [...priced]
            .sort((a, b) => valueTraded(b) - valueTraded(a))
            .slice(0, limit)
            .map((quote) => ({ quote, value: valueTraded(quote) })),
        sectors: [...sectors.entries()]
            .map(([sector, row]) => ({ sector, count: row.count, avgChange: row.change / row.count, valueTraded: row.value }))
            // The busiest sectors first: they are the ones that explain the index.
            .sort((a, b) => b.valueTraded - a.valueTraded),
    };
}

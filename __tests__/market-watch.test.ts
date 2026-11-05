import { describe, expect, it } from 'vitest';
import { directionOf, filterSections, nextWatchSort, sortSections, watchChange, watchDecimals, watchPrice } from '@/lib/market-watch';
import type { MarketSection, WorldQuote } from '@/lib/market-sections';
import type { SectionBoard } from '@/lib/world-board';

const quote = (over: Partial<WorldQuote> = {}): WorldQuote => ({
    ticker: 'COMEX:GC1!',
    short: 'GC',
    nameKey: 'world.name.gold',
    marketKey: 'world.market.commodities',
    price: 4035.43,
    changePercent: 2.69,
    changeAbs: 105.6,
    ...over,
});

const board = (
    id: MarketSection['id'],
    nameKey: MarketSection['nameKey'],
    quotes: WorldQuote[],
): SectionBoard => ({ section: { id, nameKey, rows: [] }, quotes });

describe('market watch decimals', () => {
    it('prices an index in points and a currency in four decimals', () => {
        expect(watchDecimals('world', 'SPX')).toBe(2);
        expect(watchDecimals('currencies', 'EUR/USD')).toBe(4);
        // Yen and lira are quoted in whole units; four decimals would be noise.
        expect(watchDecimals('currencies', 'USD/JPY')).toBe(2);
        expect(watchDecimals('currencies', 'USD/TRY')).toBe(2);
        expect(watchDecimals('crypto', 'BTC')).toBe(0);
    });

    it('prints a grouped, fixed price', () => {
        expect(watchPrice(4035.43, 'commodities', 'GC', 'en')).toBe('4,035.43');
        expect(watchPrice(1.12449, 'currencies', 'EUR/USD', 'en')).toBe('1.1245');
    });

    it('switches the digits for Arabic', () => {
        const arabic = watchPrice(10038.89, 'gulf', 'TASI', 'ar');
        expect(arabic).toContain('١٠');
        expect(arabic).not.toContain('10038');
    });
});

describe('market watch direction and change', () => {
    it('leans a row by its change, and calls a zero flat', () => {
        expect(directionOf(2.69)).toBe('up');
        expect(directionOf(-0.02)).toBe('down');
        expect(directionOf(0)).toBe('flat');
        // A row the feed answered without a change must not paint as a loss.
        expect(directionOf(Number.NaN)).toBe('flat');
    });

    it('prints the change with a sign and two decimals, no percent sign', () => {
        expect(watchChange(2.69, 'en')).toBe('+2.69');
        expect(watchChange(-0.02, 'en')).toBe('-0.02');
        expect(watchChange(0, 'en')).toBe('0.00');
        expect(watchChange(1.5, 'ar')).toContain('١');
        expect(watchChange(1.5, 'ar')).not.toContain('1.50');
    });

    it('never prints NaN', () => {
        expect(watchChange(Number.NaN, 'en')).toBe('0.00');
    });
});

describe('market watch filter', () => {
    const sections = [
        board('gulf', 'world.section.gulf', [
            quote({ ticker: 'TADAWUL:TASI', short: 'TASI', nameKey: 'world.name.tasi', price: 10038.89 }),
        ]),
        board('commodities', 'world.section.commodities', [
            quote(),
            // The exchange prefix contains "EUR"; searching "eur" must not drag Brent in.
            quote({ ticker: 'ICEEUR:BRN1!', short: 'BRN', nameKey: 'world.name.brent', price: 96.28 }),
        ]),
        board('currencies', 'world.section.currencies', [
            quote({ ticker: 'FX_IDC:EURUSD', short: 'EUR/USD', nameKey: 'world.name.eurusd', price: 1.12449 }),
        ]),
    ];

    it('returns the whole board for an empty query', () => {
        expect(filterSections(sections, '   ', 'en')).toHaveLength(3);
    });

    it('matches the short label without punctuation', () => {
        const out = filterSections(sections, 'eurusd', 'en');
        expect(out).toHaveLength(1);
        expect(out[0].quotes[0].short).toBe('EUR/USD');
    });

    it('does not match the exchange prefix of a ticker', () => {
        const out = filterSections(sections, 'eur', 'en');
        expect(out.map((entry) => entry.section.id)).toEqual(['currencies']);
    });

    it('matches the translated name in Arabic', () => {
        const out = filterSections(sections, 'الذهب', 'ar');
        expect(out).toHaveLength(1);
        expect(out[0].section.id).toBe('commodities');
    });

    it('drops sections that have nothing left', () => {
        const out = filterSections(sections, 'gold', 'en');
        expect(out.map((entry) => entry.section.id)).toEqual(['commodities']);
    });

    it('returns nothing when nothing matches', () => {
        expect(filterSections(sections, 'zzzz', 'en')).toEqual([]);
    });
});

describe('ranking the watch table', () => {
    const ranked = () => [
        board('gulf', 'world.section.gulf', [
            quote({ ticker: 'A', short: 'A', price: 10, changePercent: 0.2 }),
            quote({ ticker: 'B', short: 'B', price: 30, changePercent: -1.5 }),
            quote({ ticker: 'C', short: 'C', price: 20, changePercent: 2.4 }),
        ]),
    ];

    it('cycles a header through biggest first, smallest first, then the board order', () => {
        const first = nextWatchSort(null, 'change');
        expect(first).toEqual({ key: 'change', dir: 'desc' });
        const second = nextWatchSort(first, 'change');
        expect(second).toEqual({ key: 'change', dir: 'asc' });
        expect(nextWatchSort(second, 'change')).toBeNull();
        // A different column starts its own cycle at the useful end.
        expect(nextWatchSort(second, 'last')).toEqual({ key: 'last', dir: 'desc' });
    });

    it('ranks each section without reordering the sections', () => {
        const sorted = sortSections(ranked(), { key: 'change', dir: 'desc' });
        expect(sorted[0].quotes.map((entry) => entry.short)).toEqual(['C', 'A', 'B']);
        const ascending = sortSections(ranked(), { key: 'change', dir: 'asc' });
        expect(ascending[0].quotes.map((entry) => entry.short)).toEqual(['B', 'A', 'C']);
        expect(sortSections(ranked(), null)[0].quotes.map((entry) => entry.short)).toEqual(['A', 'B', 'C']);
    });

    it('keeps an unpriced row at the bottom whichever way the column runs', () => {
        const boardWithHole = [
            board('world', 'world.section.world', [
                quote({ ticker: 'A', short: 'A', price: 10, changePercent: 1 }),
                quote({ ticker: 'N', short: 'N', price: Number.NaN, changePercent: Number.NaN }),
            ]),
        ];
        for (const dir of ['asc', 'desc'] as const) {
            const order = sortSections(boardWithHole, { key: 'last', dir })[0].quotes.map((q) => q.short);
            expect(order).toEqual(['A', 'N']);
        }
    });
});

import { describe, expect, it } from 'vitest';
import { tx, type Lang } from '@/lib/i18n';
import {
    MARKET_SECTIONS,
    WORLD_TICKERS,
    sectionQuotes,
    worldQuoteFromRow,
    type WorldQuote,
} from '@/lib/market-sections';

const LANGS: Lang[] = ['en', 'ar'];
const row = (d: (number | string | null)[], s: string) => ({ s, d });

describe('the world board sections', () => {
    it('names every section and every instrument in both languages', () => {
        for (const section of MARKET_SECTIONS) {
            for (const lang of LANGS) {
                expect(tx(lang, section.nameKey), section.id).not.toBe(section.nameKey);
            }
            expect(section.rows.length).toBeGreaterThan(1);
            for (const entry of section.rows) {
                for (const lang of LANGS) {
                    const name = tx(lang, entry.nameKey);
                    expect(name, `${section.id}/${entry.ticker} has no ${lang} name`).not.toBe(entry.nameKey);
                    expect(name.trim().length).toBeGreaterThan(0);
                    // The table's first column is the market, and it must be a word, not a key.
                    const market = tx(lang, entry.marketKey);
                    expect(market, `${section.id}/${entry.ticker} has no ${lang} market`).not.toBe(entry.marketKey);
                    expect(market.trim().length).toBeGreaterThan(0);
                }
            }
        }
    });

    it('asks the scanner for each instrument exactly once', () => {
        expect(new Set(WORLD_TICKERS).size).toBe(WORLD_TICKERS.length);
        // Every ticker is the endpoint's own spelling: an exchange, a colon, the instrument.
        for (const ticker of WORLD_TICKERS) expect(ticker).toMatch(/^[A-Z0-9_]+:[A-Za-z0-9!._]+$/);
        expect(WORLD_TICKERS).toHaveLength(MARKET_SECTIONS.reduce((total, section) => total + section.rows.length, 0));
    });

    it('gives every row a short label that is unique inside its section', () => {
        for (const section of MARKET_SECTIONS) {
            const labels = section.rows.map((entry) => entry.short);
            expect(new Set(labels).size, section.id).toBe(labels.length);
            expect(labels.every((label) => label.trim().length > 0)).toBe(true);
        }
    });

    it('covers the five sections a trader reads before the open', () => {
        expect(MARKET_SECTIONS.map((section) => section.id)).toEqual([
            'gulf', 'world', 'commodities', 'currencies', 'crypto',
        ]);
        // The Gulf is the reason the board exists, so it comes first and holds the Saudi index.
        expect(MARKET_SECTIONS[0].rows[0].ticker).toBe('TADAWUL:TASI');
    });
});

describe('reading a scanner row', () => {
    it('turns a known row into a quote', () => {
        expect(worldQuoteFromRow(row([4065.1, 2.74, 107.6, 'Gold'], 'COMEX:GC1!'))).toEqual({
            ticker: 'COMEX:GC1!', short: 'GC', nameKey: 'world.name.gold',
            marketKey: 'world.market.commodities',
            price: 4065.1, changePercent: 2.74, changeAbs: 107.6,
        });
    });

    it('refuses a row nobody asked for, and one with no price', () => {
        expect(worldQuoteFromRow(row([100, 1, 1], 'NOPE:THING'))).toBeNull();
        // A market that has not opened answers with a null close; a zero is not a price either.
        expect(worldQuoteFromRow(row([null, 0, 0], 'COMEX:GC1!'))).toBeNull();
        expect(worldQuoteFromRow(row([0, 0, 0], 'COMEX:GC1!'))).toBeNull();
    });

    it('reads a quoted price and a missing change as numbers, never as NaN', () => {
        const quote = worldQuoteFromRow(row(['1.1229', null, null], 'FX_IDC:EURUSD'));
        expect(quote?.price).toBeCloseTo(1.1229, 4);
        expect(quote?.changePercent).toBe(0);
        expect(quote?.changeAbs).toBe(0);
    });
});

describe('laying quotes onto a section', () => {
    const section = MARKET_SECTIONS.find((entry) => entry.id === 'commodities')!;
    const quote = (ticker: string): WorldQuote => ({
        ticker, short: ticker, nameKey: 'world.name.gold', marketKey: 'world.market.commodities',
        price: 1, changePercent: 0, changeAbs: 0,
    });

    it('keeps the declared order and drops what the feed missed', () => {
        const gold = section.rows[0].ticker;
        const copper = section.rows[2].ticker;
        // Handed over backwards and with one instrument missing: the order is the section's, not the
        // feed's, and nothing is invented for the row that did not answer.
        const laid = sectionQuotes(section, [quote(copper), quote(gold)]);
        expect(laid.map((entry) => entry.ticker)).toEqual([gold, copper]);
        expect(laid).toHaveLength(2);
    });

    it('is empty when nothing answered', () => {
        expect(sectionQuotes(section, [])).toEqual([]);
    });
});

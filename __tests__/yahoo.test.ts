import { describe, expect, it } from 'vitest';
import { dailyQuoteFromChart, isIndexSymbol, liveQuoteFromChart, normalizeYahooSymbol, tadawulAppSymbol } from '@/lib/yahoo';
import { formatSymbolForTradingView, isChartEmbeddable } from '@/lib/utils';

describe('Tadawul symbols', () => {
    it('maps app and TradingView symbols to Yahoo', () => {
        expect(normalizeYahooSymbol('2222.SR')).toBe('2222.SR');
        expect(normalizeYahooSymbol('tadawul:2222')).toBe('2222.SR');
        expect(normalizeYahooSymbol('TADAWUL:TASI')).toBe('^TASI.SR');
        // A trader types the index by name: the app's own pages must accept it too.
        expect(normalizeYahooSymbol('TASI')).toBe('^TASI.SR');
        expect(normalizeYahooSymbol('tasi')).toBe('^TASI.SR');
        expect(isIndexSymbol('TASI')).toBe(true);
        expect(isIndexSymbol('^TASI.SR')).toBe(true);
        expect(isIndexSymbol('2222.SR')).toBe(false);
        // Bare numbers stay ambiguous: 7203 is Toyota in Tokyo
        expect(normalizeYahooSymbol('7203')).toBeNull();
        expect(normalizeYahooSymbol('AAPL')).toBeNull();
        expect(tadawulAppSymbol('TADAWUL:1120')).toBe('1120.SR');
        expect(tadawulAppSymbol('TADAWUL:TASI')).toBeNull();
    });

    it('charts .SR on TradingView as TADAWUL, without the embed it blocks', () => {
        expect(formatSymbolForTradingView('2222.SR')).toBe('TADAWUL:2222');
        expect(isChartEmbeddable('TADAWUL:2222')).toBe(false);
    });
});

describe('dailyQuoteFromChart', () => {
    const chart = (close: (number | null)[]) => ({ chart: { result: [{ meta: { currency: 'SAR', shortName: 'Saudi Arabian Oil Co.' }, indicators: { quote: [{ close }] } }] } });

    it('compares the last two closes, skipping gaps', () => {
        const q = dailyQuoteFromChart(chart([25, 26, null, 26.52]))!;
        expect(q.price).toBe(26.52);
        expect(q.change).toBeCloseTo(0.52);
        expect(q.changePercent).toBeCloseTo(2);
        expect(q).toMatchObject({ currency: 'SAR', name: 'Saudi Arabian Oil Co.' });
    });

    it("prefers Yahoo's own day change (TASI sends a single daily bar)", () => {
        const json = { chart: { result: [{ meta: { regularMarketPrice: 9921.5, fulldayChange: -101.97, regularMarketChangePercent: -1.017 }, indicators: { quote: [{ close: [9921.5] }] } }] } };
        expect(dailyQuoteFromChart(json)).toMatchObject({ price: 9921.5, change: -101.97, changePercent: -1.017 });
    });

    it('returns null when Yahoo has nothing', () => {
        expect(dailyQuoteFromChart({ chart: { result: null } })).toBeNull();
        expect(dailyQuoteFromChart(chart([null]))).toBeNull();
    });
});

describe('liveQuoteFromChart', () => {
    it('reads the last trade and the time it happened', () => {
        const json = {
            chart: {
                result: [{
                    meta: { currency: 'SAR', shortName: 'Saudi Arabian Oil Co.', regularMarketPrice: 26.24, previousClose: 26.16, regularMarketTime: 1793786909 },
                    indicators: { quote: [{ close: [26.1, 26.24] }] },
                }],
            },
        };
        const quote = liveQuoteFromChart(json);
        expect(quote?.c).toBe(26.24);
        expect(quote?.t).toBe(1793786909);
        expect(quote?.d).toBeCloseTo(0.08, 5);
        expect(quote?.dp).toBeCloseTo(0.3058, 3);
        expect(quote?.currency).toBe('SAR');
    });

    it('falls back to the closes when the meta is thin', () => {
        const json = { chart: { result: [{ meta: {}, indicators: { quote: [{ close: [10, 11] }] } }] } };
        expect(liveQuoteFromChart(json)?.c).toBe(11);
        expect(liveQuoteFromChart(json)?.d).toBe(1);
    });

    it('returns null when there is nothing to price', () => {
        expect(liveQuoteFromChart({ chart: { result: [] } })).toBeNull();
    });
});

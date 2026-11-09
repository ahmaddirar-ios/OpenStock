import { describe, expect, it } from 'vitest';
import { compareYahooSymbol, latestChange, normalizeCompareInputs, percentSeries } from '@/lib/compare';
import type { Candle } from '@/lib/market/yahoo-candles';

const candle = (time: number, close: number): Candle => ({ time, open: close, high: close, low: close, close, volume: 1 });

const SERIES: Candle[] = [candle(1, 100), candle(2, 110), candle(3, 90), candle(4, 150)];

describe('compareYahooSymbol', () => {
    it('accepts suffixed and Tadawul symbols through the chart resolver', () => {
        expect(compareYahooSymbol('2222.SR')).toBe('2222.SR');
        expect(compareYahooSymbol('0700.HK')).toBe('0700.HK');
    });

    it('accepts a plain US ticker', () => {
        expect(compareYahooSymbol('aapl')).toBe('AAPL');
        expect(compareYahooSymbol(' msft ')).toBe('MSFT');
    });

    it('rejects blanks and junk', () => {
        expect(compareYahooSymbol('')).toBeNull();
        expect(compareYahooSymbol('   ')).toBeNull();
        expect(compareYahooSymbol('not a symbol!')).toBeNull();
        expect(compareYahooSymbol('1234')).toBeNull(); // digits without .SR are not a US ticker
    });
});

describe('percentSeries', () => {
    it('starts at zero and measures change from the first close', () => {
        const points = percentSeries(SERIES);
        expect(points[0]).toEqual({ time: 1, value: 0 });
        expect(points[1].value).toBeCloseTo(10);
        expect(points[2].value).toBeCloseTo(-10);
        expect(points[3].value).toBeCloseTo(50);
    });

    it('returns nothing when there is no usable close', () => {
        expect(percentSeries([])).toEqual([]);
        expect(percentSeries([candle(1, 0), candle(2, 0)])).toEqual([]);
    });

    it('measures from a common start and drops earlier points', () => {
        const points = percentSeries(SERIES, 3);
        expect(points[0]).toEqual({ time: 3, value: 0 });
        expect(points[1].value).toBeCloseTo((150 / 90 - 1) * 100);
    });
});

describe('latestChange', () => {
    it('is the last point, or null for an empty series', () => {
        expect(latestChange(SERIES)).toBeCloseTo(50);
        expect(latestChange([])).toBeNull();
    });
});

describe('normalizeCompareInputs', () => {
    it('drops the charted symbol, de-dupes and caps at the limit', () => {
        const list = normalizeCompareInputs(['2222.SR', 'aapl', 'AAPL', 'MSFT', '1120.SR', 'NVDA'], '2222.SR');
        expect(list).toEqual(['AAPL', 'MSFT', '1120.SR']);
    });

    it('ignores invalid entries', () => {
        expect(normalizeCompareInputs(['!!', '', 'AAPL'], 'MSFT')).toEqual(['AAPL']);
    });
});

import { describe, expect, it } from 'vitest';
import { CSV_HEADER, candlesToCsv, csvFileName, csvTime } from '@/lib/chart-export';
import type { Candle } from '@/lib/yahoo-candles';

const bar = (time: number, close: number): Candle => ({
    time,
    open: close - 1,
    high: close + 2,
    low: close - 3,
    close,
    volume: 1000 + close,
});

describe('csvTime', () => {
    it('writes the bar time as an ISO UTC instant', () => {
        expect(csvTime(0)).toBe('1970-01-01T00:00:00.000Z');
        expect(csvTime(1_700_000_000)).toBe('2023-11-14T22:13:20.000Z');
    });
});

describe('candlesToCsv', () => {
    it('carries the header even when there are no bars', () => {
        expect(candlesToCsv([])).toBe(CSV_HEADER);
    });

    it('writes one row per bar, oldest first, with the numbers untouched', () => {
        const csv = candlesToCsv([bar(0, 10), bar(60, 11)]);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(3);
        expect(lines[0]).toBe(CSV_HEADER);
        expect(lines[1]).toBe('1970-01-01T00:00:00.000Z,9,12,7,10,1010');
        expect(lines[2]).toBe('1970-01-01T00:01:00.000Z,10,13,8,11,1011');
    });
});

describe('csvFileName', () => {
    it('strips the exchange suffix and keeps the interval', () => {
        expect(csvFileName('4013.SR', '1d')).toBe('openstock-4013SR-1d.csv');
        expect(csvFileName('AAPL', '5m')).toBe('openstock-AAPL-5m.csv');
    });
});

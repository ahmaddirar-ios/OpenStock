import { describe, expect, it } from 'vitest';
import { ema, macd, rsi, sma } from '@/lib/indicators';

describe('sma', () => {
    it('stays null until the window is full, then averages it', () => {
        expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    });

    it('returns one value per input, so it lines up with the candles', () => {
        expect(sma([1, 2], 5)).toEqual([null, null]);
    });
});

describe('ema', () => {
    it('is seeded with the SMA of the first window, then weights the newest value', () => {
        // k = 2 / (3 + 1) = 0.5
        expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    });

    it('reacts faster to a jump than the SMA does', () => {
        // Both are seeded with the same SMA, so the difference only shows on the bar after the jump.
        const series = [10, 10, 10, 10, 30, 30, 30];
        expect(ema(series, 5)[5] as number).toBeGreaterThan(sma(series, 5)[5] as number);
    });
});

describe('rsi', () => {
    it('is 100 when nothing ever fell and 0 when nothing ever rose', () => {
        expect(rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 14)[14]).toBe(100);
        expect(rsi([15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 14)[14]).toBe(0);
    });

    it('matches Wilder’s worked example inside a point of the published value', () => {
        const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
        const value = rsi(closes, 14)[14] as number;
        expect(value).toBeGreaterThan(69);
        expect(value).toBeLessThan(72);
    });

    it('says nothing before the window is full', () => {
        expect(rsi([1, 2, 3], 14).every((v) => v === null)).toBe(true);
    });
});

describe('macd', () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 5);

    it('aligns with the input and starts once the slow EMA does', () => {
        const { macd: line } = macd(values);
        expect(line).toHaveLength(values.length);
        expect(line.slice(0, 25).every((v) => v === null)).toBe(true);
        expect(line[30]).not.toBeNull();
    });

    it('defines the histogram as the gap between the line and its signal', () => {
        const { macd: line, signal, histogram } = macd(values);
        const i = 40;
        expect(histogram[i]).toBeCloseTo((line[i] as number) - (signal[i] as number), 10);
    });
});

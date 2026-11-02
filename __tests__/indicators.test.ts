import { describe, expect, it } from 'vitest';
import { atr, bollinger, ema, macd, rsi, sma, vwap } from '@/lib/indicators';

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


describe('bollinger', () => {
    it('centres on the SMA and widens by k standard deviations', () => {
        const { middle, upper, lower } = bollinger([1, 2, 3, 4, 5], 5, 2);
        expect(middle[4]).toBe(3);
        // Population σ of 1..5 is √2, so the bands sit 2σ away.
        expect(upper[4]).toBeCloseTo(3 + 2 * Math.SQRT2);
        expect(lower[4]).toBeCloseTo(3 - 2 * Math.SQRT2);
        expect(middle[3]).toBeNull();
        expect(upper[4]).not.toBeNull();
    });

    it('has no width on a flat series', () => {
        const { upper, middle, lower } = bollinger([7, 7, 7], 3, 2);
        expect(middle[2]).toBeCloseTo(7);
        expect(upper[2]).toBeCloseTo(7);
        expect(lower[2]).toBeCloseTo(7);
    });
});

describe('vwap', () => {
    const day = 1_600_000_000; // 2020-09-13, midday UTC

    it('weights the typical price by volume and resets at a UTC day boundary', () => {
        const bars = [
            { time: day, high: 11, low: 9, close: 10, volume: 100 },
            { time: day + 3_600, high: 13, low: 11, close: 12, volume: 300 },
            { time: day + 86_400, high: 21, low: 19, close: 20, volume: 100 },
        ];
        const out = vwap(bars);
        expect(out[0]).toBeCloseTo(10);
        expect(out[1]).toBeCloseTo((10 * 100 + 12 * 300) / 400);
        expect(out[2]).toBeCloseTo(20); // a new session starts over
    });

    it('anchors once on daily bars, where a session reset would be meaningless', () => {
        const bars = [
            { time: day, high: 11, low: 9, close: 10, volume: 100 },
            { time: day + 86_400, high: 21, low: 19, close: 20, volume: 300 },
        ];
        expect(vwap(bars)[1]).toBeCloseTo((10 * 100 + 20 * 300) / 400);
    });

    it('survives a zero-volume bar without dividing by zero', () => {
        expect(vwap([{ time: day, high: 5, low: 5, close: 5, volume: 0 }])[0]).toBeNull();
    });
});

describe('atr', () => {
    it("is Wilder's smoothed true range, null until the first window closes", () => {
        const bars = [
            { high: 10, low: 8, close: 9 },
            { high: 12, low: 9, close: 11 },
            { high: 13, low: 11, close: 12 },
        ];
        const out = atr(bars, 2);
        // TR0 = 10 − 8 = 2; TR1 = max(12 − 9, |12 − 9|, |9 − 9|) = 3 → seed (2 + 3) / 2.
        expect(out[1]).toBeCloseTo(2.5);
        // TR2 = max(13 − 11, |13 − 11|, |11 − 11|) = 2 → (2.5 · 1 + 2) / 2.
        expect(out[2]).toBeCloseTo(2.25);
        expect(out[0]).toBeNull();
    });
});

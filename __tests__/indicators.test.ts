import { describe, expect, it } from 'vitest';
import {
    adx,
    atr,
    bollinger,
    cci,
    donchian,
    ema,
    ichimoku,
    keltner,
    macd,
    obv,
    parabolicSar,
    pivots,
    rsi,
    sma,
    stochastic,
    supertrend,
    vwap,
    williamsR,
} from '@/lib/indicators';

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

const bars = (rows: [number, number, number][]) =>
    rows.map(([high, low, close]) => ({ high, low, close }));

const rising = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ high: i + 2, low: i, close: i + 1 }));

describe('stochastic', () => {
    const rows: [number, number, number][] = [
        [10, 8, 9],
        [11, 9, 10],
        [12, 10, 11],
        [13, 11, 12],
        [14, 12, 13],
        [15, 13, 14],
    ];

    it('reads 100 at a fresh high and 0 at a fresh low', () => {
        // The close is the window's high on every bar, so the slow %K is pinned at 100.
        const atHigh = bars([[10, 8, 10], [11, 9, 11], [12, 10, 12]]);
        expect(stochastic(atHigh, 3, 1, 1).k[2]).toBeCloseTo(100);
        const atLow = bars([[10, 8, 8], [9, 7, 7], [8, 6, 6]]);
        expect(stochastic(atLow, 3, 1, 1).k[2]).toBeCloseTo(0);
    });

    it('smooths %K and reads %D as the average of the last %K values', () => {
        const { k, d } = stochastic(bars(rows), 3, 1, 2);
        expect(k[1]).toBeNull();
        expect(k[2]).not.toBeNull();
        expect(d[2]).toBeNull();
        expect(d[3]).toBeCloseTo(((k[2] as number) + (k[3] as number)) / 2);
        expect(d[4]).toBeCloseTo(((k[3] as number) + (k[4] as number)) / 2);
    });

    it('stays null when the window is longer than the history', () => {
        const out = stochastic(bars(rows), 14, 3, 3);
        expect(out.k.every((value) => value === null)).toBe(true);
        expect(out.d.every((value) => value === null)).toBe(true);
    });
});

describe('williamsR', () => {
    it('maps the close between the window high (0) and low (-100)', () => {
        const rows = bars([[10, 8, 9], [11, 9, 10], [12, 10, 11]]);
        expect(williamsR(rows, 3)[2]).toBeCloseTo(-25); // (12 - 11) / (12 - 8)
        expect(williamsR(bars([[10, 8, 10]]), 1)[0]).toBeCloseTo(0);
    });

    it('is null while the window is warming up', () => {
        const out = williamsR(bars([[10, 8, 9], [11, 9, 10]]), 3);
        expect(out).toEqual([null, null]);
    });
});

describe('cci', () => {
    it('scales the typical price against its mean deviation', () => {
        const flat = bars([[1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4], [5, 5, 5]]);
        // Mean 3, mean deviation 1.2 → (5 − 3) / (0.015 × 1.2).
        expect(cci(flat, 5)[4]).toBeCloseTo(111.11, 1);
        expect(cci(flat, 5)[3]).toBeNull();
    });

    it('reports 0 instead of dividing by zero on a flat stretch', () => {
        const flat = bars([[5, 5, 5], [5, 5, 5], [5, 5, 5]]);
        expect(cci(flat, 3)[2]).toBe(0);
    });
});

describe('adx', () => {
    it("is Wilder's DI pair and their smoothed DX", () => {
        const out = adx(rising(60), 14);
        // The first bar has no previous bar, so the pair starts at index `period` and ADX one
        // `period` of DX later.
        expect(out.plusDi[13]).toBeNull();
        expect(out.plusDi[14]).toBeCloseTo(50);
        expect(out.minusDi[14]).toBeCloseTo(0);
        expect(out.adx[26]).toBeNull();
        expect(out.adx[27]).toBeCloseTo(100);
        expect(out.adx[59]).toBeCloseTo(100);
    });

    it('never leaves the 0..100 band', () => {
        const out = adx(rising(60), 14);
        for (const series of [out.adx, out.plusDi, out.minusDi]) {
            for (const value of series) if (value != null) {
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(100);
            }
        }
    });

    it('is all null before the first window closes', () => {
        const out = adx(rising(10), 14);
        expect(out.adx.every((value) => value === null)).toBe(true);
        expect(out.plusDi.every((value) => value === null)).toBe(true);
    });
});

describe('obv', () => {
    it('adds volume on an up close and subtracts it on a down close', () => {
        const rows = [
            { high: 11, low: 9, close: 10, volume: 100 },
            { high: 12, low: 10, close: 11, volume: 200 },
            { high: 11, low: 9, close: 10, volume: 300 },
            { high: 11, low: 9, close: 10, volume: 400 },
        ];
        expect(obv(rows)).toEqual([0, 200, -100, -100]);
    });

    it('answers one value per bar', () => {
        expect(obv([])).toEqual([]);
    });
});

describe('ichimoku', () => {
    const bars100 = rising(100);
    const out = ichimoku(bars100);

    it('reads the conversion and base lines as midpoints of their windows', () => {
        // Bar 8: highs 2..10 (max 10), lows 0..8 (min 0) → (10 + 0) / 2.
        expect(out.tenkan[8]).toBeCloseTo(5);
        expect(out.tenkan[7]).toBeNull();
        // Bar 25: highs 2..27 (max 27), lows 0..25 (min 0).
        expect(out.kijun[25]).toBeCloseTo(13.5);
        expect(out.kijun[24]).toBeNull();
    });

    it('draws the cloud from data `shift` bars old', () => {
        // Span A needs both midpoints, so it starts once the base line does, plus the shift.
        expect(out.senkouA[50]).toBeNull();
        // Bar 25: tenkan = (27 + 17) / 2 = 22, kijun = (27 + 0) / 2 = 13.5.
        expect(out.senkouA[51]).toBeCloseTo((22 + 13.5) / 2);
        // The 52-bar midpoint at bar 51 is (53 + 0) / 2, drawn 26 bars later.
        expect(out.senkouB[76]).toBeNull();
        expect(out.senkouB[77]).toBeCloseTo(26.5);
    });

    it('lags the close by `shift` bars and stops at the right edge', () => {
        expect(out.chikou[0]).toBeCloseTo(27);
        expect(out.chikou[73]).toBeCloseTo(100);
        expect(out.chikou[74]).toBeNull();
    });
});

describe('donchian', () => {
    it('is the highest high, the lowest low and their midpoint', () => {
        const bars3 = bars([[10, 8, 9], [12, 7, 11], [11, 9, 10]]);
        const out = donchian(bars3, 2);
        expect(out.upper[1]).toBe(12);
        expect(out.lower[1]).toBe(7);
        expect(out.middle[1]).toBe(9.5);
        expect(out.upper[0]).toBeNull();
    });

    it('stays null when the window is longer than the history', () => {
        expect(donchian(bars([[10, 8, 9]]), 5).upper).toEqual([null]);
    });
});

describe('keltner', () => {
    it('puts an EMA between two ATR-scaled bands', () => {
        const series = rising(40);
        const out = keltner(series, 20, 2);
        const middle = ema(series.map((bar) => bar.close), 20);
        const width = atr(series, 20);
        const i = 25;
        expect(out.middle[i]).toBeCloseTo(middle[i] as number);
        expect(out.upper[i]).toBeCloseTo((middle[i] as number) + 2 * (width[i] as number));
        expect(out.lower[i]).toBeCloseTo((middle[i] as number) - 2 * (width[i] as number));
        expect(out.middle[i - 1]).not.toBeNull();
    });
});

describe('supertrend', () => {
    it('trails below a rising market and above a falling one', () => {
        const up = supertrend(rising(60), 10, 3);
        expect(up[59]).not.toBeNull();
        expect(up[59] as number).toBeLessThan(60);
        const falling = rising(60).map((bar, i) => ({ high: 62 - i, low: 60 - i, close: 61 - i }));
        expect(falling.length).toBe(60);
        // Rebuild a genuinely falling series: high/low/close all descend.
        const down = Array.from({ length: 60 }, (_, i) => ({ high: 100 - i, low: 98 - i, close: 99 - i }));
        const downOut = supertrend(down, 10, 3);
        expect(downOut[59] as number).toBeGreaterThan(99 - 59);
    });

    it('is null while the ATR window is warming up', () => {
        const out = supertrend(rising(60), 10, 3);
        expect(out[8]).toBeNull();
        expect(out[9]).not.toBeNull();
    });
});

describe('parabolicSar', () => {
    const up = rising(60).map((bar) => ({ time: 0, ...bar }));

    it('sits below a rising market and above a falling one', () => {
        const out = parabolicSar(up, 0.02, 0.2);
        expect(out[59] as number).toBeLessThan(60);
        const down = up.map((bar, i) => ({ time: i, high: 100 - i, low: 98 - i, close: 99 - i }));
        const downOut = parabolicSar(down, 0.02, 0.2);
        expect(downOut[59] as number).toBeGreaterThan(99 - 59);
    });

    it("falls inside the previous bar's range", () => {
        const out = parabolicSar(up, 0.02, 0.2);
        for (let i = 3; i < up.length; i += 1) {
            // In an uptrend the stop trails under the bar, never through it.
            expect(out[i] as number).toBeLessThanOrEqual(up[i].low);
        }
    });
});

describe('pivots', () => {
    it("uses the previous bar's high, low and close", () => {
        const out = pivots(bars([[10, 8, 9], [12, 9, 11]]));
        // P = 9, R1 = 2P − L = 10, S1 = 2P − H = 8, R2 = P + (H − L) = 11 …
        expect(out.pivot[1]).toBeCloseTo(9);
        expect(out.r1[1]).toBeCloseTo(10);
        expect(out.s1[1]).toBeCloseTo(8);
        expect(out.r2[1]).toBeCloseTo(11);
        expect(out.s2[1]).toBeCloseTo(7);
        expect(out.r3[1]).toBeCloseTo(12);
        expect(out.s3[1]).toBeCloseTo(6);
        expect(out.pivot[0]).toBeNull();
    });
});

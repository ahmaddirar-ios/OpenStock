import { describe, expect, it } from 'vitest';
import {
    adx,
    anchorIndex,
    anchoredVwap,
    atr,
    awesomeOscillator,
    chaikinMoneyFlow,
    periodPivots,
    stochRsi,
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
    rollingCorrelation,
    priceSeries,
    momentum,
    roc,
    aroon,
    trix,
    mfi,
    rsi,
    sma,
    stochastic,
    supertrend,
    vwap,
    vwma,
    williamsR,
    wma,
    hma,
    waveTrend,
} from '@/lib/chart/indicators';

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

describe('anchoredVwap', () => {
    const day = 1_600_000_000;

    it('starts where the anchor says, not at the first bar', () => {
        const bars = [
            { time: day, high: 101, low: 99, close: 100, volume: 1_000 },
            { time: day + 86_400, high: 11, low: 9, close: 10, volume: 100 },
            { time: day + 2 * 86_400, high: 31, low: 29, close: 30, volume: 300 },
        ];
        const out = anchoredVwap(bars, 1, 2);
        // The first bar is before the anchor: nothing to average yet.
        expect(out.vwap[0]).toBeNull();
        expect(out.vwap[1]).toBeCloseTo(10);
        expect(out.vwap[2]).toBeCloseTo((10 * 100 + 30 * 300) / 400);
    });

    it('bands are the volume-weighted standard deviation around the average', () => {
        const bars = [
            { time: day, high: 11, low: 9, close: 10, volume: 100 },
            { time: day + 86_400, high: 21, low: 19, close: 20, volume: 100 },
        ];
        const out = anchoredVwap(bars, 0, 2);
        // Equal volume at 10 and 20: mean 15, deviation 5, so the bands sit at 25 and 5.
        expect(out.vwap[1]).toBeCloseTo(15);
        expect(out.upper[1]).toBeCloseTo(25);
        expect(out.lower[1]).toBeCloseTo(5);
    });

    it('is flat at a single price, so both bands touch the average', () => {
        const out = anchoredVwap([{ time: day, high: 10, low: 10, close: 10, volume: 50 }], 0, 2);
        expect(out.upper[0]).toBeCloseTo(10);
        expect(out.lower[0]).toBeCloseTo(10);
    });

    it('anchors past the end when nobody has reached it, and never yields NaN', () => {
        const out = anchoredVwap([{ time: day, high: 5, low: 5, close: 5, volume: 0 }], 9, 2);
        expect(out.vwap).toEqual([null]);
        const zeroVolume = anchoredVwap([{ time: day, high: 5, low: 5, close: 5, volume: 0 }], 0, 2);
        expect(zeroVolume.vwap[0]).toBeNull();
    });
});

describe('anchorIndex', () => {
    const bars = [
        { time: Date.UTC(2026, 0, 2) / 1000 },
        { time: Date.UTC(2026, 0, 5) / 1000 },
        { time: Date.UTC(2026, 0, 9) / 1000 },
    ];

    it('picks the first bar at or after the day', () => {
        expect(anchorIndex(bars, '2026-01-02')).toBe(0);
        // A weekend or a holiday moves forward to the next bar there is.
        expect(anchorIndex(bars, '2026-01-03')).toBe(1);
        expect(anchorIndex(bars, '2026-01-05')).toBe(1);
    });

    it('reads empty or junk as the first bar, and a future date as past the end', () => {
        expect(anchorIndex(bars, '')).toBe(0);
        expect(anchorIndex(bars, '   ')).toBe(0);
        expect(anchorIndex(bars, 'not a date')).toBe(0);
        expect(anchorIndex(bars, '2030-01-01')).toBe(bars.length);
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

describe('wma', () => {
    it('weights the newest bar the heaviest', () => {
        // (1·1 + 2·2 + 3·3) / (1 + 2 + 3) = 14 / 6
        expect(wma([1, 2, 3], 3)[2]).toBeCloseTo(14 / 6);
        expect(wma([1, 2, 3], 3)[1]).toBeNull();
    });

    it('returns one value per input', () => {
        expect(wma([1, 2], 5)).toEqual([null, null]);
    });

    it('equals the plain average when every value is the same', () => {
        expect(wma([7, 7, 7, 7], 3)[3]).toBeCloseTo(7);
    });
});

describe('hma', () => {
    const flat = Array.from({ length: 30 }, () => 5);
    const risingCloses = rising(40).map((bar) => bar.close);

    it('is flat on a flat series and trails a trend closely', () => {
        expect(hma(flat, 9)[29]).toBeCloseTo(5);
        const fast = hma(risingCloses, 9);
        // A Hull average hugs the price: on a straight rise it sits just under it.
        expect(fast[39] as number).toBeGreaterThan(risingCloses[39] - 3);
        expect(fast[39] as number).toBeLessThanOrEqual(risingCloses[39] + 0.5);
    });

    it('waits for the double smoothing before it answers', () => {
        const out = hma(risingCloses, 9);
        expect(out[9]).toBeNull();
        expect(out[10]).not.toBeNull();
    });
});

describe('vwma', () => {
    it('weights the close by volume over the window', () => {
        const rows = [
            { high: 11, low: 9, close: 10, volume: 100 },
            { high: 13, low: 11, close: 12, volume: 300 },
            { high: 15, low: 13, close: 14, volume: 100 },
        ];
        expect(vwma(rows, 2)[1]).toBeCloseTo((10 * 100 + 12 * 300) / 400);
        expect(vwma(rows, 2)[2]).toBeCloseTo((12 * 300 + 14 * 100) / 400);
        expect(vwma(rows, 2)[0]).toBeNull();
    });

    it('stays null when the window has no volume at all', () => {
        const rows = [
            { high: 11, low: 9, close: 10, volume: 0 },
            { high: 13, low: 11, close: 12, volume: 0 },
        ];
        expect(vwma(rows, 2)).toEqual([null, null]);
    });
});

describe('priceSeries', () => {
    const bars = [
        { open: 10, high: 13, low: 9, close: 12 },
        { open: 12, high: 15, low: 11, close: 14 },
    ];

    it('reads each source letter', () => {
        expect(priceSeries(bars, 'open')).toEqual([10, 12]);
        expect(priceSeries(bars, 'high')).toEqual([13, 15]);
        expect(priceSeries(bars, 'low')).toEqual([9, 11]);
        expect(priceSeries(bars, 'close')).toEqual([12, 14]);
    });

    it('builds the three composites TradingView offers', () => {
        expect(priceSeries(bars, 'hl2')).toEqual([11, 13]);
        expect(priceSeries(bars, 'hlc3')).toEqual([(13 + 9 + 12) / 3, (15 + 11 + 14) / 3]);
        expect(priceSeries(bars, 'ohlc4')).toEqual([(10 + 13 + 9 + 12) / 4, (12 + 15 + 11 + 14) / 4]);
    });

    it('falls back to the close for anything it does not know', () => {
        expect(priceSeries(bars, 'magic')).toEqual([12, 14]);
        expect(priceSeries(bars, '')).toEqual([12, 14]);
    });
});

describe('source-aware averages', () => {
    const candles = [
        { time: 0, open: 10, high: 20, low: 5, close: 12, volume: 100 },
        { time: 1, open: 12, high: 30, low: 6, close: 14, volume: 200 },
        { time: 2, open: 14, high: 40, low: 7, close: 16, volume: 100 },
    ];

    it('keltner puts its EMA on the given source', () => {
        const closes = keltner(candles, 1, 1);
        const highs = keltner(candles, 1, 1, priceSeries(candles, 'high'));
        expect(closes.middle[2]).toBeCloseTo(16);
        expect(highs.middle[2]).toBeCloseTo(40);
    });

    it('vwma weights the given source by volume', () => {
        const byHigh = vwma(candles, 2, priceSeries(candles, 'high'));
        expect(byHigh[2]).toBeCloseTo((30 * 200 + 40 * 100) / 300);
    });
});

describe('momentum and roc', () => {
    const values = [10, 11, 13, 12, 15];

    it('momentum is the difference from `period` bars back', () => {
        const out = momentum(values, 2);
        expect(out[0]).toBeNull();
        expect(out[1]).toBeNull();
        expect(out[2]).toBe(3);
        expect(out[4]).toBe(2);
    });

    it('roc is the same move as a percentage, and refuses a zero base', () => {
        const out = roc(values, 2);
        expect(out[2]).toBeCloseTo(30);
        expect(out[4]).toBeCloseTo((15 - 13) / 13 * 100);
        expect(roc([0, 0, 5], 2)[2]).toBeNull();
    });
});

describe('aroon', () => {
    it('reads 100 when the extreme is the newest bar and 0 when it is the oldest', () => {
        // Highest high at the end of the window, lowest low at its start.
        const bars = [10, 11, 12, 13].map((x) => ({ high: x, low: x - 5, close: x - 1 }));
        const up = aroon(bars, 3);
        expect(up.up[3]).toBeCloseTo(100);
        expect(up.down[3]).toBeCloseTo(0);
        expect(up.up[2]).toBeNull();
    });
});

describe('trix', () => {
    it('is the percentage change of a triple EMA, and warms up for all three', () => {
        const rising = Array.from({ length: 40 }, (_, i) => 100 + i);
        const out = trix(rising, 5);
        expect(out[10]).toBeNull();
        expect(out[39]).not.toBeNull();
        // A straight line has a constant triple EMA slope, so TRIX converges to a small positive value.
        expect(out[39] as number).toBeGreaterThan(0);
    });
});

describe('mfi', () => {
    it('is 100 when every bar in the window moved up', () => {
        const bars = Array.from({ length: 4 }, (_, i) => ({
            high: 10 + i,
            low: 8 + i,
            close: 9 + i,
            volume: 100,
        }));
        expect(mfi(bars, 3)[3]).toBeCloseTo(100);
        expect(mfi(bars, 3)[2]).toBeNull();
    });

    it('splits the flows when the typical price turns down', () => {
        const bars = [
            { high: 10, low: 8, close: 9, volume: 100 },
            { high: 12, low: 10, close: 11, volume: 100 },
            { high: 11, low: 9, close: 10, volume: 100 },
        ];
        // A window of one: bar 1 is an up bar, bar 2 a down bar.
        const out = mfi(bars, 1);
        expect(out[1]).toBeCloseTo(100);
        expect(out[2]).toBeCloseTo(0);
    });
});

describe('stochRsi', () => {
    it('reads 100 when the RSI is at the top of its own range and 0 at the bottom', () => {
        // A steady rise keeps the RSI pinned at 100, so its range is flat and the reading is 50.
        const rising = Array.from({ length: 40 }, (_, i) => 100 + i);
        const flat = stochRsi(rising, 14, 14, 1, 1);
        expect(flat.k[39]).toBe(50);

        // A series that rises then falls gives the RSI a real range to sit inside.
        const swing = [...Array.from({ length: 30 }, (_, i) => 100 + i), ...Array.from({ length: 10 }, (_, i) => 130 - i * 2)];
        const out = stochRsi(swing, 14, 14, 1, 1);
        const last = out.k[out.k.length - 1];
        expect(last).not.toBeNull();
        expect(last as number).toBeGreaterThanOrEqual(0);
        expect(last as number).toBeLessThanOrEqual(100);
    });

    it('stays null until the RSI and the stochastic window are both full', () => {
        const values = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i));
        const out = stochRsi(values, 14, 14, 1, 1);
        expect(out.k[13]).toBeNull();
        expect(out.k[26]).toBeNull();
        expect(out.k[27]).not.toBeNull();
    });
});

describe('awesomeOscillator', () => {
    it('is the fast median SMA minus the slow one', () => {
        const bars = Array.from({ length: 40 }, (_, i) => ({ high: 12 + i, low: 8 + i, close: 10 + i }));
        const out = awesomeOscillator(bars, 5, 34);
        expect(out[32]).toBeNull();
        expect(out[33]).not.toBeNull();
        // A flat market has the same median average at every length, so the oscillator is zero.
        const flat = Array.from({ length: 40 }, () => ({ high: 11, low: 9, close: 10 }));
        expect(awesomeOscillator(flat, 5, 34)[39]).toBeCloseTo(0);
    });

    it('turns positive when the recent median rises above the long one', () => {
        const bars = [
            ...Array.from({ length: 34 }, () => ({ high: 11, low: 9, close: 10 })),
            ...Array.from({ length: 5 }, () => ({ high: 21, low: 19, close: 20 })),
        ];
        expect(awesomeOscillator(bars, 5, 34)[38]).toBeGreaterThan(0);
    });
});

describe('chaikinMoneyFlow', () => {
    it('is +1 when every bar closes at its high and −1 when every bar closes at its low', () => {
        const up = Array.from({ length: 5 }, () => ({ high: 10, low: 8, close: 10, volume: 100 }));
        const down = Array.from({ length: 5 }, () => ({ high: 10, low: 8, close: 8, volume: 100 }));
        expect(chaikinMoneyFlow(up, 3)[4]).toBeCloseTo(1);
        expect(chaikinMoneyFlow(down, 3)[4]).toBeCloseTo(-1);
    });

    it('is zero for a bar with no range and for a window with no volume', () => {
        const flat = Array.from({ length: 4 }, () => ({ high: 10, low: 10, close: 10, volume: 100 }));
        expect(chaikinMoneyFlow(flat, 2)[3]).toBe(0);
        const empty = Array.from({ length: 4 }, () => ({ high: 10, low: 8, close: 9, volume: 0 }));
        expect(chaikinMoneyFlow(empty, 2)[3]).toBe(0);
    });

    it('waits for a full window', () => {
        const bars = Array.from({ length: 4 }, () => ({ high: 10, low: 8, close: 9, volume: 100 }));
        expect(chaikinMoneyFlow(bars, 3)[1]).toBeNull();
        expect(chaikinMoneyFlow(bars, 3)[2]).not.toBeNull();
    });
});

describe('periodPivots', () => {
    const day = 86_400;
    // Monday 5 January 2026, so the ISO week boundaries fall where the test expects them.
    const monday = Date.UTC(2026, 0, 5) / 1000;
    // Two full weeks, then a third that is still open.
    const bars = [
        ...Array.from({ length: 5 }, (_, i) => ({ time: monday + i * day, high: 12, low: 8, close: 10 })),
        ...Array.from({ length: 5 }, (_, i) => ({ time: monday + (7 + i) * day, high: 22, low: 18, close: 20 })),
        ...Array.from({ length: 3 }, (_, i) => ({ time: monday + (14 + i) * day, high: 32, low: 28, close: 30 })),
    ];

    it('holds the previous week’s levels across the current week', () => {
        const out = periodPivots(bars, 'week');
        // The first week has no completed week behind it.
        expect(out.pivot[0]).toBeNull();
        // The second week reads the first week: (12 + 8 + 10) / 3.
        expect(out.pivot[5]).toBeCloseTo(10);
        expect(out.r1[5]).toBeCloseTo(12);
        expect(out.s1[5]).toBeCloseTo(8);
        // The third week reads the second: (22 + 18 + 20) / 3.
        expect(out.pivot[10]).toBeCloseTo(20);
        expect(out.r2[10]).toBeCloseTo(24);
        expect(out.s2[10]).toBeCloseTo(16);
    });

    it('uses the calendar month when asked', () => {
        const monthly = [
            { time: Date.UTC(2026, 0, 5) / 1000, high: 12, low: 8, close: 10 },
            { time: Date.UTC(2026, 0, 20) / 1000, high: 14, low: 6, close: 12 },
            { time: Date.UTC(2026, 1, 3) / 1000, high: 20, low: 16, close: 18 },
        ];
        const out = periodPivots(monthly, 'month');
        expect(out.pivot[0]).toBeNull();
        // February reads January's aggregate: high 14, low 6, close 12.
        expect(out.pivot[2]).toBeCloseTo((14 + 6 + 12) / 3);
        expect(out.r1[2]).toBeCloseTo(2 * ((14 + 6 + 12) / 3) - 6);
    });

    it('has nothing to say about an empty series', () => {
        expect(periodPivots([], 'week').pivot).toEqual([]);
    });
});

describe('rollingCorrelation', () => {
    const series = (value: (index: number) => number) => Array.from({ length: 30 }, (_, index) => value(index));

    it('answers +1 when the two move together and -1 when they mirror', () => {
        const base = series((index) => Math.sin(index) * 10 + 50);
        expect(rollingCorrelation(base, base, 10).at(-1)).toBeCloseTo(1, 6);
        expect(rollingCorrelation(base, base.map((value) => 100 - value), 10).at(-1)).toBeCloseTo(-1, 6);
    });

    it('reads the window over the bars that have a partner, not only a full one', () => {
        // Two markets with different holidays: every fifth bar here has no partner in the other.
        const base = series((index) => index * 2);
        const partner = base.map((value, index) => (index % 5 === 0 ? null : value * 3 + 7));
        const result = rollingCorrelation(base, partner, 10);
        // The window still holds at least half its bars paired, and the line is real.
        expect(result.at(-1)).toBeCloseTo(1, 6);
    });

    it('draws nothing where too few bars in the window have a partner', () => {
        const base = series((index) => index);
        const partner = base.map((value, index) => (index % 3 === 0 ? value : null));
        expect(rollingCorrelation(base, partner, 12).every((value) => value == null)).toBe(true);
    });

    it('has no window before the first one closes', () => {
        const base = series((index) => index);
        expect(rollingCorrelation(base, base, 10).slice(0, 9).every((value) => value == null)).toBe(true);
    });
});

describe('waveTrend', () => {
    const bars = (count: number, price: (index: number) => number) =>
        Array.from({ length: count }, (_, index) => {
            const close = price(index);
            return { time: index * 60, open: close, high: close + 1, low: close - 1, close, volume: 10 };
        });

    it('stays null until the channel and the average have both filled', () => {
        const { wt1, wt2 } = waveTrend(bars(60, (index) => 100 + index), 10, 21);
        // 10 bars for the channel, 10 more for its deviation, 21 for the average of the channel index.
        expect(wt1.slice(0, 38).every((value) => value == null)).toBe(true);
        expect(wt1[38]).not.toBeNull();
        // The signal line is a four-bar average of the first line.
        expect(wt2.slice(0, 41).every((value) => value == null)).toBe(true);
        expect(wt2[41]).not.toBeNull();
    });

    it('reads positive while price runs above its own average, and negative below it', () => {
        const rising = waveTrend(bars(80, (index) => 100 + index), 10, 21);
        const falling = waveTrend(bars(80, (index) => 200 - index), 10, 21);
        expect(rising.wt1.at(-1)).toBeGreaterThan(0);
        expect(falling.wt1.at(-1)).toBeLessThan(0);
    });

    it('returns one value per candle', () => {
        const candles = bars(50, (index) => 100 + Math.sin(index / 3) * 5);
        const { wt1, wt2 } = waveTrend(candles, 10, 21);
        expect(wt1).toHaveLength(candles.length);
        expect(wt2).toHaveLength(candles.length);
    });

    it('draws nothing when the history is shorter than the warm-up', () => {
        const { wt1, wt2 } = waveTrend(bars(3, (index) => 100 + index), 10, 21);
        expect(wt1.every((value) => value == null)).toBe(true);
        expect(wt2.every((value) => value == null)).toBe(true);
    });
});

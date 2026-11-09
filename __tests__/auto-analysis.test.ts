import { describe, expect, it } from 'vitest';
import { analyzeCandles, bollingerWidth, MIN_ANALYSIS_BARS } from '@/lib/chart/auto-analysis';
import type { Candle } from '@/lib/market/yahoo-candles';

/** A bar whose high and low straddle the close, so the pivot detector has something to work with. */
const bar = (index: number, close: number): Candle => ({
    time: 1700000000 + index * 86400,
    open: close * 0.998,
    high: close * 1.012,
    low: close * 0.988,
    close,
    volume: 1000 + (index % 7) * 120,
});

/** A wave on top of a slope: the swings the zigzag needs, plus the drift the trend factors read. */
const series = (count: number, slope: number, wave: number) =>
    Array.from({ length: count }, (_, index) => {
        const trend = 100 + index * slope;
        const ripple = Math.sin(index / 5) * wave;
        return bar(index, Math.max(1, trend + ripple));
    });

const up = series(240, 0.45, 5);
const down = series(240, -0.45, 5);
const flat = series(240, 0, 4);

describe('analyzeCandles', () => {
    it('reads an uptrend as bullish, with the trend and the structure behind it', () => {
        const read = analyzeCandles(up);
        expect(read).not.toBeNull();
        expect(read!.bias).toBe('bullish');
        expect(read!.score).toBeGreaterThan(60);
        const trend = read!.factors.find((factor) => factor.id === 'trend')!;
        const structure = read!.factors.find((factor) => factor.id === 'structure')!;
        expect(trend.bias).toBe('bullish');
        expect(structure.bias).toBe('bullish');
        expect(read!.headline).toBe('auto.headline.bullTrend');
    });

    it('reads a downtrend as bearish, the other way round', () => {
        const read = analyzeCandles(down);
        expect(read!.bias).toBe('bearish');
        expect(read!.score).toBeLessThan(40);
        expect(read!.factors.find((factor) => factor.id === 'trend')!.bias).toBe('bearish');
        expect(read!.headline).toBe('auto.headline.bearTrend');
    });

    it('refuses to pick a side when the chart has none', () => {
        const read = analyzeCandles(flat);
        expect(read!.score).toBeGreaterThanOrEqual(30);
        expect(read!.score).toBeLessThanOrEqual(70);
    });

    it('says nothing at all when there is too little history', () => {
        expect(analyzeCandles(up.slice(0, MIN_ANALYSIS_BARS - 1))).toBeNull();
        expect(analyzeCandles([])).toBeNull();
    });

    it('is the same read every time: no clock, no randomness', () => {
        expect(analyzeCandles(up)).toEqual(analyzeCandles(up));
    });

    it('puts supports under price and resistances above it', () => {
        const read = analyzeCandles(up)!;
        const supports = read.levels.filter((level) => level.kind === 'support');
        const resistances = read.levels.filter((level) => level.kind === 'resistance');
        expect(supports.every((level) => level.price < read.last)).toBe(true);
        expect(resistances.every((level) => level.price > read.last)).toBe(true);
        // The nearest support comes first, the nearest resistance too.
        expect([...supports].sort((a, b) => b.price - a.price)).toEqual(supports);
        expect([...resistances].sort((a, b) => a.price - b.price)).toEqual(resistances);
        expect(supports.length).toBeLessThanOrEqual(3);
        expect(resistances.length).toBeLessThanOrEqual(3);
    });

    it('carries the risk numbers the panel prints', () => {
        const read = analyzeCandles(up)!;
        expect(read.bars).toBe(240);
        expect(read.atrPercent).toBeGreaterThan(0);
        expect(read.trendStrength).toBeGreaterThanOrEqual(0);
        expect(read.trendStrength).toBeLessThanOrEqual(100);
        expect(['low', 'medium', 'high']).toContain(read.confidence);
    });

    it('names the patterns the chart itself would draw, when there are any', () => {
        const read = analyzeCandles(up)!;
        expect(Array.isArray(read.patterns)).toBe(true);
        expect(read.patterns.length).toBeLessThanOrEqual(3);
    });

    it('survives a chart with holes in it instead of throwing', () => {
        const holed = up.map((candle, index) => (index % 11 === 0 ? { ...candle, close: Number.NaN } : candle));
        expect(() => analyzeCandles(holed)).not.toThrow();
    });
});

describe('bollingerWidth', () => {
    it('measures the band as a percentage of its own middle', () => {
        const width = bollingerWidth(up);
        expect(width).not.toBeNull();
        expect(width!).toBeGreaterThan(0);
        expect(bollingerWidth([])).toBeNull();
    });
});

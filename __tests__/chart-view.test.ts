import { describe, expect, it } from 'vitest';
import {
    SCALE_MODES,
    SCALE_MODE_KEY,
    CHART_TYPES,
    DEFAULT_CHART_TYPE,
    heikinAshi,
    renko,
    parseChartType,
    parseRenkoBox,
    parseScaleMode,
    readChartType,
    readScaleMode,
    writeChartType,
    writeScaleMode,
    CHART_TYPE_KEY,
    type ChartType,
} from '@/lib/chart-view';
import type { Candle } from '@/lib/yahoo-candles';

const bars: Candle[] = [
    { time: 1, open: 10, high: 14, low: 8, close: 12, volume: 100 },
    { time: 2, open: 12, high: 16, low: 10, close: 15, volume: 200 },
    { time: 3, open: 15, high: 15, low: 9, close: 10, volume: 300 },
];

describe('heikinAshi', () => {
    it('smooths the four prices and keeps time and volume', () => {
        const out = heikinAshi(bars);
        // First bar: close = (10+14+8+12)/4 = 11, open = (10+12)/2 = 11.
        expect(out[0]).toEqual({ time: 1, open: 11, high: 14, low: 8, close: 11, volume: 100 });
        // Second: close = (12+16+10+15)/4 = 13.25, open = (11+11)/2 = 11.
        expect(out[1].close).toBeCloseTo(13.25);
        expect(out[1].open).toBeCloseTo(11);
        expect(out[1].high).toBe(16);
        expect(out[1].low).toBe(10);
        // Third: close = (15+15+9+10)/4 = 12.25, open = (11+13.25)/2 = 12.125.
        expect(out[2].close).toBeCloseTo(12.25);
        expect(out[2].open).toBeCloseTo(12.125);
        expect(out[2].high).toBe(15);
        expect(out[2].low).toBeCloseTo(9);
        expect(out.map((bar) => bar.time)).toEqual([1, 2, 3]);
        expect(out.map((bar) => bar.volume)).toEqual([100, 200, 300]);
    });

    it('keeps the high above and the low below both smoothed prices', () => {
        for (const bar of heikinAshi(bars)) {
            expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close));
            expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close));
        }
    });

    it('answers one bar per bar, and nothing for no bars', () => {
        expect(heikinAshi(bars)).toHaveLength(bars.length);
        expect(heikinAshi([])).toEqual([]);
    });
});

describe('parseChartType', () => {
    it('accepts exactly the six types', () => {
        for (const type of CHART_TYPES) expect(parseChartType(type)).toBe(type);
    });

    it('falls back to candles for anything else', () => {
        expect(parseChartType('magic')).toBe(DEFAULT_CHART_TYPE);
        expect(parseChartType(null)).toBe(DEFAULT_CHART_TYPE);
        expect(parseChartType(7)).toBe(DEFAULT_CHART_TYPE);
        expect(parseChartType(undefined)).toBe(DEFAULT_CHART_TYPE);
    });
});

describe('chart type storage', () => {
    const make = (initial: string | null) => {
        const store = new Map<string, string>();
        if (initial != null) store.set(CHART_TYPE_KEY, initial);
        return {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
            raw: store,
        };
    };

    it('round-trips a type', () => {
        const storage = make(null);
        writeChartType(storage, 'heikin');
        expect(storage.raw.get(CHART_TYPE_KEY)).toBe('heikin');
        expect(readChartType(storage)).toBe('heikin');
    });

    it('reads a missing or broken value as candles', () => {
        expect(readChartType(make(null))).toBe('candles');
        expect(readChartType(make('nope'))).toBe('candles');
    });

    it('survives storage that throws', () => {
        const broken = {
            getItem: () => {
                throw new Error('denied');
            },
            setItem: () => {
                throw new Error('denied');
            },
        };
        expect(readChartType(broken)).toBe('candles');
        expect(() => writeChartType(broken, 'area' as ChartType)).not.toThrow();
    });
});

describe('scale mode', () => {
    it('accepts the four modes and defaults to linear', () => {
        for (const mode of SCALE_MODES) expect(parseScaleMode(mode)).toBe(mode);
        expect(parseScaleMode('magic')).toBe('linear');
        expect(parseScaleMode(null)).toBe('linear');
        expect(parseScaleMode(3)).toBe('linear');
    });

    it('round-trips and repairs its own storage', () => {
        const store = new Map<string, string>();
        const storage = {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
        };
        writeScaleMode(storage, 'log');
        expect(store.get(SCALE_MODE_KEY)).toBe('log');
        expect(readScaleMode(storage)).toBe('log');
        store.set(SCALE_MODE_KEY, 'nope');
        expect(readScaleMode(storage)).toBe('linear');
        expect(readScaleMode({ getItem: () => { throw new Error('no'); } })).toBe('linear');
    });
});

describe('renko', () => {
    const bar = (time: number, close: number, open = close, volume = 100) => ({
        time,
        open,
        high: Math.max(open, close),
        low: Math.min(open, close),
        close,
        volume,
    });

    it('prints a brick only when a whole box is crossed', () => {
        // Box of 1, starting from 100: 100.4 is inside the box, 101 prints one, 102.5 prints one.
        const bricks = renko([bar(1, 100), bar(2, 100.4), bar(3, 101), bar(4, 102.5)], 1);
        expect(bricks.map((b) => b.close)).toEqual([101, 102]);
        expect(bricks[0].open).toBe(100);
        expect(bricks[0].high).toBe(101);
    });

    it('prints several bricks when one bar moves several boxes, with increasing times', () => {
        const bricks = renko([bar(10, 100), bar(20, 103.2)], 1);
        expect(bricks.map((b) => b.close)).toEqual([101, 102, 103]);
        expect(bricks[0].time).toBe(20);
        expect(bricks[1].time).toBeGreaterThan(bricks[0].time);
        expect(bricks[2].time).toBeGreaterThan(bricks[1].time);
        expect(bricks.every((b) => b.volume === 100)).toBe(true);
    });

    it('reverses direction after a full box the other way', () => {
        const bricks = renko([bar(1, 100), bar(2, 102), bar(3, 100.5)], 1);
        expect(bricks.map((b) => b.close)).toEqual([101, 102, 101]);
        expect(bricks[2].open).toBe(102);
        expect(bricks[2].close).toBe(101);
    });

    it('chooses half a percent of the first close when no box is given', () => {
        const bricks = renko([bar(1, 200), bar(2, 201.5)], undefined);
        expect(bricks).toHaveLength(1);
        expect(bricks[0].close).toBe(201);
    });

    it('answers nothing for no candles', () => {
        expect(renko([], 1)).toEqual([]);
    });
});

describe('renko box', () => {
    it('accepts a positive number and rejects everything else', () => {
        expect(parseRenkoBox('0.25')).toBe(0.25);
        expect(parseRenkoBox(2)).toBe(2);
        expect(parseRenkoBox('')).toBeUndefined();
        expect(parseRenkoBox('0')).toBeUndefined();
        expect(parseRenkoBox(-1)).toBeUndefined();
        expect(parseRenkoBox('abc')).toBeUndefined();
        expect(parseRenkoBox(null)).toBeUndefined();
    });
});

import { describe, expect, it } from 'vitest';
import { COUNT_GLYPHS, type Drawing } from '@/lib/chart-drawings';
import { AUTO_SENSITIVITIES, autoCount, detectPivots, type Pivot } from '@/lib/auto-count';
import type { Candle } from '@/lib/yahoo-candles';

const DAY = 86_400;
const T0 = 1_700_000_000;

/** One bar per step, walking a straight line between the turning points. */
const bar = (index: number, value: number, wick = 0.05): Candle => ({
    time: T0 + index * DAY,
    open: value,
    close: value,
    high: value + wick,
    low: value - wick,
    volume: 1,
});

/** A clean zigzag: no noise, `steps` bars per leg, so every turning point is a real extreme. */
function candlesFrom(points: number[], steps = 8, wick = 0.05): Candle[] {
    const bars: Candle[] = [bar(0, points[0], wick)];
    let index = 0;
    for (let leg = 1; leg < points.length; leg += 1) {
        const from = points[leg - 1];
        const to = points[leg];
        for (let step = 1; step <= steps; step += 1) {
            index += 1;
            bars.push(bar(index, from + ((to - from) * step) / steps, wick));
        }
    }
    return bars;
}

// 100 → 120 → 105 → 140 → 110 → 160 → 100: a clean zigzag whose every leg beats a 3% threshold.
const ZIGZAG = candlesFrom([100, 120, 105, 140, 110, 160, 100]);
const ZIGZAG_PIVOTS = [120.05, 104.95, 140.05, 109.95, 160.05];
const threePercent = { mode: 'percent', percent: 0.03 } as const;

const prices = (pivots: Pivot[]) => pivots.map((p) => Number(p.price.toFixed(2)));
const kinds = (pivots: Pivot[]) => pivots.map((p) => p.kind);

describe('detectPivots', () => {
    it('finds the turning points of a clean zigzag, alternating high and low', () => {
        const pivots = detectPivots(ZIGZAG, threePercent);

        expect(kinds(pivots)).toEqual(['high', 'low', 'high', 'low', 'high']);
        expect(prices(pivots)).toEqual(ZIGZAG_PIVOTS);
    });

    it('anchors every pivot to a real bar, never to an invented time', () => {
        const pivots = detectPivots(ZIGZAG, threePercent);
        const times = new Set(ZIGZAG.map((c) => c.time));

        expect(pivots.length).toBeGreaterThan(0);
        for (const pivot of pivots) expect(times.has(pivot.time)).toBe(true);
    });

    it('never puts two pivots on the same bar when an outside bar reverses', () => {
        // Bar 3 makes a new high (130) and a low (100) far enough below it to confirm the reversal.
        // The high pivot is that bar; the low leg must start on the next bar, not on the same one.
        const bars: Candle[] = [
            bar(0, 100),
            bar(1, 110),
            bar(2, 120),
            { time: T0 + 3 * DAY, open: 120, close: 124, high: 130, low: 100, volume: 1 },
            bar(4, 105),
            { time: T0 + 5 * DAY, open: 100, close: 108, high: 110, low: 92, volume: 1 },
            bar(6, 106),
        ];
        const pivots = detectPivots(bars, threePercent);
        const times = pivots.map((p) => p.time);

        expect(kinds(pivots)).toEqual(['high', 'low']);
        expect(prices(pivots)).toEqual([130, 92]);
        expect(new Set(times).size).toBe(times.length);
    });

    it('leaves the last extreme unconfirmed when nothing has reversed after it yet', () => {
        // The series ends on a downtrend, so the closing low is not a pivot until price turns.
        const pivots = detectPivots(ZIGZAG, threePercent);

        expect(pivots[pivots.length - 1]?.kind).toBe('high');
    });

    it('ignores a swing smaller than the threshold', () => {
        // A 1.3% dip inside a leg that keeps trending: noise, not a pivot.
        const noisy = candlesFrom([100, 112, 110.5, 130], 8, 0.02);

        expect(detectPivots(noisy, threePercent)).toEqual([]);
    });

    it('keeps that swing when the threshold is smaller', () => {
        const noisy = candlesFrom([100, 112, 110.5, 130], 8, 0.02);

        expect(prices(detectPivots(noisy, { mode: 'percent', percent: 0.005 }))).toEqual([112.02, 110.48]);
    });

    it('adapts to the instrument in atr mode: the same shape at ten times the price', () => {
        const small = detectPivots(candlesFrom([100, 120, 105, 140, 110, 160, 100]), { mode: 'atr' });
        const large = detectPivots(candlesFrom([1000, 1200, 1050, 1400, 1100, 1600, 1000], 8, 0.5), { mode: 'atr' });

        expect(kinds(large)).toEqual(kinds(small));
        expect(prices(large)).toEqual(ZIGZAG_PIVOTS.map((p) => p * 10));
    });

    it('demands a bigger move in atr mode when the bars themselves are wide', () => {
        // Same closes, four times the bar range: the atr threshold swallows the swing.
        const quiet = candlesFrom([100, 108, 104, 120], 8, 0.05);
        const wild = candlesFrom([100, 108, 104, 120], 8, 4);

        expect(detectPivots(quiet, { mode: 'atr' }).length).toBeGreaterThan(detectPivots(wild, { mode: 'atr' }).length);
        expect(detectPivots(wild, { mode: 'atr' }).length).toBeLessThanOrEqual(1);
    });

    it('returns nothing for a flat or empty series instead of guessing', () => {
        expect(detectPivots([], { mode: 'atr' })).toEqual([]);
        expect(detectPivots([bar(0, 100)], { mode: 'atr' })).toEqual([]);
        expect(detectPivots([bar(0, 100), bar(1, 100), bar(2, 100)], threePercent)).toEqual([]);
    });

    it('returns nothing when no usable threshold can be computed', () => {
        expect(detectPivots(candlesFrom([100, 120]), { mode: 'percent', percent: 0 })).toEqual([]);
        expect(detectPivots([bar(0, 100), bar(1, 101), bar(2, 100)], { mode: 'percent', percent: 0.5 })).toEqual([]);
    });
});

describe('autoCount', () => {
    it('numbers the last five turning points as a minor impulse', () => {
        const drawing = autoCount(ZIGZAG, { ...threePercent, degree: 'minor', kind: 'impulse' }) as Drawing;

        expect(drawing.tool).toBe('ew-count');
        expect(drawing.points.map((p) => Number(p.price.toFixed(2)))).toEqual(ZIGZAG_PIVOTS);
        expect(drawing.labels).toEqual(COUNT_GLYPHS.minor.impulse);
    });

    it('keeps the times of the pivots, so the points snap to real bars', () => {
        const drawing = autoCount(ZIGZAG, { ...threePercent, degree: 'minor', kind: 'impulse' }) as Drawing;
        const times = new Set(ZIGZAG.map((c) => c.time));

        expect(drawing.points).toHaveLength(5);
        for (const point of drawing.points) expect(times.has(point.time)).toBe(true);
    });

    it('uses the glyphs of the degree it was asked for', () => {
        const major = autoCount(ZIGZAG, { ...threePercent, degree: 'major', kind: 'impulse' }) as Drawing;
        const minute = autoCount(ZIGZAG, { ...threePercent, degree: 'minute', kind: 'impulse' }) as Drawing;

        expect(major.labels).toEqual(COUNT_GLYPHS.major.impulse);
        expect(minute.labels).toEqual(COUNT_GLYPHS.minute.impulse);
    });

    it('numbers a correction A-B-C with the correction tool', () => {
        const drawing = autoCount(ZIGZAG, { ...threePercent, degree: 'minor', kind: 'correction' }) as Drawing;

        expect(drawing.tool).toBe('ew-count-abc');
        expect(drawing.points).toHaveLength(3);
        expect(drawing.labels).toEqual(COUNT_GLYPHS.minor.correction);
    });

    it('takes the most recent window, not the first one', () => {
        const drawing = autoCount(ZIGZAG, { ...threePercent, degree: 'minor', kind: 'correction' }) as Drawing;

        expect(drawing.points.map((p) => Number(p.price.toFixed(2)))).toEqual([140.05, 109.95, 160.05]);
    });

    it('returns null, never a half count, when the series is too short', () => {
        expect(autoCount(candlesFrom([100, 130]), { ...threePercent, degree: 'minor', kind: 'impulse' })).toBeNull();
        expect(autoCount(candlesFrom([100, 130, 110]), { ...threePercent, degree: 'minor', kind: 'impulse' })).toBeNull();
        expect(autoCount(candlesFrom([100, 130, 110]), { ...threePercent, degree: 'minor', kind: 'correction' })).toBeNull();
    });

    it('gives every count its own id so two counts never collide', () => {
        const a = autoCount(ZIGZAG, { mode: 'atr', degree: 'minor', kind: 'impulse' }) as Drawing;
        const b = autoCount(ZIGZAG, { mode: 'atr', degree: 'minor', kind: 'impulse' }) as Drawing;

        expect(a.id).toBeTruthy();
        expect(a.id).not.toBe(b.id);
    });

    it('survives garbage input without throwing', () => {
        expect(autoCount([], { mode: 'atr', degree: 'minor', kind: 'impulse' })).toBeNull();
        expect(autoCount([bar(0, 50), bar(1, 50), bar(2, 50)], { mode: 'atr', degree: 'major', kind: 'correction' })).toBeNull();
    });
});

describe('AUTO_SENSITIVITIES', () => {
    it('offers atr first, then the fixed percentages the menu shows', () => {
        expect(AUTO_SENSITIVITIES[0]).toBe('atr');
        expect(AUTO_SENSITIVITIES).toEqual(['atr', '0.01', '0.03', '0.05']);
    });
});

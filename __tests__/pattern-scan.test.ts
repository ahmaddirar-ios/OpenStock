import { describe, expect, it } from 'vitest';
import { MAX_SCAN_SYMBOLS, SCAN_BATCH, SCAN_PATTERNS, pivotOptionsFor, scanCandles } from '@/lib/pattern-scan';
import type { Candle } from '@/lib/yahoo-candles';

/** A close path walked in equal steps, so the zigzag detector sees one pivot per waypoint. */
const candlesFrom = (waypoints: number[]): Candle[] => {
    const closes: number[] = [];
    for (let i = 0; i < waypoints.length - 1; i += 1) {
        const from = waypoints[i];
        const to = waypoints[i + 1];
        for (let step = 0; step < 5; step += 1) closes.push(from + ((to - from) * step) / 5);
    }
    closes.push(waypoints[waypoints.length - 1]);
    return closes.map((close, index) => ({ time: 1_000 + index * 60, open: close, high: close + 0.4, low: close - 0.4, close, volume: 100 }));
};

const percent = { mode: 'percent' as const, percent: 0.02 };

describe('scanCandles', () => {
    it('returns at most one hit per pattern, newest first', () => {
        const hits = scanCandles(candlesFrom([100, 95, 120, 90, 108, 78, 95]), SCAN_PATTERNS, percent);
        const ids = hits.map((hit) => hit.pattern);
        expect(new Set(ids).size).toBe(ids.length);
        for (let i = 1; i < hits.length; i += 1) expect(hits[i - 1].foundAt).toBeGreaterThanOrEqual(hits[i].foundAt);
    });

    it('finds the Wolfe wave when only Wolfe is asked for', () => {
        const hits = scanCandles(candlesFrom([100, 95, 120, 90, 108, 78, 95]), ['wolfe'], percent);
        expect(hits).toHaveLength(1);
        expect(hits[0].tool).toBe('wolfe');
    });

    it('never reports a harmonic variant it was not asked for', () => {
        // X 100, A 200, B 138.2, C 176, D 121.4: a Gartley. The four harmonic ids share one detector,
        // so asking for a Bat must come back empty rather than with the Gartley it found. The series
        // opens above X and closes above D so the zigzag confirms both ends as pivots.
        const gartley = candlesFrom([110, 100, 200, 138.2, 176, 121.4, 130]);
        expect(scanCandles(gartley, ['bat'], percent)).toEqual([]);
        expect(scanCandles(gartley, ['gartley'], percent).map((hit) => hit.pattern)).toEqual(['gartley']);
    });

    it('returns nothing for a straight series', () => {
        const straight = Array.from({ length: 40 }, (_, i) => 100 + i);
        expect(scanCandles(candlesFrom(straight), SCAN_PATTERNS, percent)).toEqual([]);
    });

    it('returns nothing for three bars instead of throwing', () => {
        expect(scanCandles(candlesFrom([100, 110, 105]), SCAN_PATTERNS, percent)).toEqual([]);
    });

    it('ignores an unknown pattern id rather than crashing', () => {
        expect(scanCandles(candlesFrom([100, 95, 120, 90, 108, 78, 95]), ['nope' as never], percent)).toEqual([]);
    });

    it('publishes the ceilings the client and the action both read', () => {
        expect(SCAN_BATCH).toBe(8);
        expect(MAX_SCAN_SYMBOLS).toBe(240);
    });
});

describe('pivotOptionsFor', () => {
    it('maps ATR to the ATR mode and a percentage to the percent mode', () => {
        expect(pivotOptionsFor('atr')).toEqual({ mode: 'atr' });
        expect(pivotOptionsFor('0.03')).toEqual({ mode: 'percent', percent: 0.03 });
    });
});

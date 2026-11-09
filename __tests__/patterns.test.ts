import { describe, expect, it } from 'vitest';
import { PATTERN_ORDER, PATTERN_POINTS, PATTERN_TOOL, detectWolfe, retrace, within } from '@/lib/patterns';
import { pointsNeeded } from '@/lib/chart-drawings';
import type { Pivot } from '@/lib/auto-count';
import type { Candle } from '@/lib/yahoo-candles';

const pivot = (time: number, price: number, kind: 'high' | 'low'): Pivot => ({ time, price, kind });

// The textbook bullish wave from __tests__/wolfe.test.ts, as pivots.
const bullish = [pivot(1, 100, 'low'), pivot(2, 120, 'high'), pivot(3, 90, 'low'), pivot(4, 108, 'high'), pivot(5, 78, 'low')];

const bars = (count: number, close: (i: number) => number): Candle[] =>
    Array.from({ length: count }, (_, i) => ({ time: 1000 + i * 60, open: close(i), high: close(i) + 0.4, low: close(i) - 0.4, close: close(i), volume: 10 }));

describe('the pattern vocabulary', () => {
    it('names every pattern once and gives each one a tool and a point count', () => {
        expect(new Set(PATTERN_ORDER).size).toBe(PATTERN_ORDER.length);
        for (const id of PATTERN_ORDER) {
            expect(PATTERN_TOOL[id]).toBeTruthy();
            expect(PATTERN_POINTS[id]).toBeGreaterThanOrEqual(3);
        }
    });

    it('uses each tool with exactly the number of points the tool takes, or an open-ended one', () => {
        for (const id of PATTERN_ORDER) {
            const needed = pointsNeeded(PATTERN_TOOL[id]);
            if (needed === 0) expect(PATTERN_POINTS[id]).toBeGreaterThanOrEqual(2);
            else expect(PATTERN_POINTS[id]).toBe(needed);
        }
    });
});

describe('retrace', () => {
    it('reads 0.618 for a 61.8% pullback of a rising leg', () => {
        expect(retrace(100, 200, 161.8)).toBeCloseTo(0.618, 3);
    });

    it('reads the same fraction for a falling leg', () => {
        expect(retrace(200, 100, 138.2)).toBeCloseTo(0.618, 3);
    });

    it('returns 0 instead of Infinity when the leg has no height', () => {
        expect(retrace(100, 100, 120)).toBe(0);
    });
});

describe('within', () => {
    it('accepts a value inside the band and one on the tolerance edge', () => {
        expect(within(0.618, 0.382, 0.618)).toBe(true);
        expect(within(0.65, 0.382, 0.618)).toBe(true);
    });

    it('rejects a value outside the band', () => {
        expect(within(0.8, 0.382, 0.618)).toBe(false);
    });
});

describe('detectWolfe', () => {
    it('reads the textbook wave, with the fifth point as the invalidation', () => {
        const hit = detectWolfe(bullish, bars(10, (i) => 100 + i));
        expect(hit?.pattern).toBe('wolfe');
        expect(hit?.direction).toBe('bullish');
        expect(hit?.tool).toBe('wolfe');
        expect(hit?.labels).toEqual(['1', '2', '3', '4', '5']);
        expect(hit?.invalidation).toBe(78);
        expect(hit?.confirmed).toBe(true);
        expect(hit?.foundAt).toBe(5);
    });

    it('returns null for five pivots that are not a wave', () => {
        const broken = [pivot(1, 100, 'low'), pivot(2, 120, 'high'), pivot(3, 90, 'low'), pivot(4, 125, 'high'), pivot(5, 78, 'low')];
        expect(detectWolfe(broken, bars(10, (i) => 100 + i))).toBeNull();
    });

    it('returns null for a flat series rather than a NaN hit', () => {
        const flat = [pivot(1, 100, 'low'), pivot(2, 100, 'high'), pivot(3, 100, 'low'), pivot(4, 100, 'high'), pivot(5, 100, 'low')];
        expect(detectWolfe(flat, bars(10, () => 100))).toBeNull();
    });
});

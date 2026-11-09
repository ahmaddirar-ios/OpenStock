import { describe, expect, it } from 'vitest';
import { PATTERN_ORDER, PATTERN_POINTS, PATTERN_TOOL, detectCypher, detectHarmonic, detectWolfe, retrace, within } from '@/lib/patterns';
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

// X low, A high, B low, C high, D low: a bullish Gartley (D retraces 0.786 of XA).
const gartley = [pivot(1, 100, 'low'), pivot(2, 200, 'high'), pivot(3, 138.2, 'low'), pivot(4, 176, 'high'), pivot(5, 121.4, 'low')];

describe('detectHarmonic', () => {
    it('names the variant whose ratios all hold', () => {
        const hit = detectHarmonic(gartley, bars(10, (i) => 100 + i));
        expect(hit?.pattern).toBe('gartley');
        expect(hit?.direction).toBe('bullish');
        expect(hit?.tool).toBe('xabcd');
        expect(hit?.labels).toEqual(['X', 'A', 'B', 'C', 'D']);
        expect(hit?.invalidation).toBe(121.4);
        expect(hit?.target).toBe(200);
    });

    it('reads the mirrored shape as bearish', () => {
        const mirror = gartley.map((p) => pivot(p.time, 300 - p.price, p.kind === 'high' ? 'low' : 'high'));
        expect(detectHarmonic(mirror, bars(10, (i) => 100 + i))?.direction).toBe('bearish');
    });

    it('returns null when point C retraces almost nothing of AB', () => {
        const broken = [gartley[0], gartley[1], gartley[2], pivot(4, 139, 'high'), gartley[4]];
        expect(detectHarmonic(broken, bars(10, (i) => 100 + i))).toBeNull();
    });
});

describe('detectCypher', () => {
    it('accepts the shape whose C overshoots A and whose D is 0.786 of XC', () => {
        const cypher = [pivot(1, 100, 'low'), pivot(2, 200, 'high'), pivot(3, 140, 'low'), pivot(4, 215, 'high'), pivot(5, 124.61, 'low')];
        const hit = detectCypher(cypher, bars(10, (i) => 100 + i));
        expect(hit?.pattern).toBe('cypher');
        expect(hit?.tool).toBe('cypher');
    });

    it('returns null when C stays inside XA', () => {
        expect(detectCypher(gartley, bars(10, (i) => 100 + i))).toBeNull();
    });
});

describe('the extension harmonics', () => {
    it('reads a Butterfly as bearish when XA rises, because D lands above A', () => {
        // XA rises, D extends 1.27 past A, so D is a high and the trade is the reversal down.
        const butterfly = [pivot(1, 100, 'low'), pivot(2, 200, 'high'), pivot(3, 121.4, 'low'), pivot(4, 176.4, 'high'), pivot(5, 227, 'low')];
        const hit = detectHarmonic(butterfly, bars(10, (i) => 100 + i));
        expect(hit?.pattern).toBe('butterfly');
        expect(hit?.direction).toBe('bearish');
        expect(hit?.invalidation).toBe(227);
        expect(hit?.target).toBe(200);
    });
});

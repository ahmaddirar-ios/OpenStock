import { describe, expect, it } from 'vitest';
import { PATTERN_ORDER, PATTERN_POINTS, PATTERN_TOOL, detectCypher, detectHarmonic, detectHeadShoulders, detectTriangle, detectWolfe, retrace, within } from '@/lib/patterns';
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

// Closes on the pivots' own clock: bar i sits at time i + 1, so a pattern measured at times 1..5 is
// confirmed or not by bar 5's close. The brief's `bars()` clock (1000+) is unrelated to the pivots'
// and projects the neckline to 1638, where every close breaks it.
const closesAt = (closes: number[]): Candle[] =>
    closes.map((close, i) => ({ time: i + 1, open: close, high: close + 0.4, low: close - 0.4, close, volume: 10 }));

// LS, N1, head, N2, RS — a completed bearish head & shoulders. The neckline through N1 (2, 100) and
// N2 (4, 102) is 101 at the head's time and 103 at the right shoulder's.
const hs = [pivot(1, 120, 'high'), pivot(2, 100, 'low'), pivot(3, 140, 'high'), pivot(4, 102, 'low'), pivot(5, 121, 'high')];
const broken = closesAt([130, 120, 115, 110, 100]);
const forming = closesAt([110, 110, 110, 110, 110]);

describe('detectHeadShoulders', () => {
    it('labels the five points the hs tool takes and measures the move off the neckline', () => {
        const hit = detectHeadShoulders(hs, broken);
        expect(hit?.pattern).toBe('hs');
        expect(hit?.tool).toBe('hs');
        expect(hit?.labels).toEqual(['LS', 'N1', 'H', 'N2', 'RS']);
        expect(hit?.direction).toBe('bearish');
        expect(hit?.invalidation).toBe(140);
        // The neckline sits at 101 and the head is 39 above it, so the target is 62.
        expect(hit?.target).toBeCloseTo(62, 0);
        expect(hit?.confirmed).toBe(true);
    });

    it('reports the same shape as forming while the close is still above the neckline', () => {
        expect(detectHeadShoulders(hs, forming)?.confirmed).toBe(false);
    });

    it('returns null when the second shoulder is far below the first', () => {
        const lopsided = [hs[0], hs[1], hs[2], hs[3], pivot(5, 90, 'high')];
        expect(detectHeadShoulders(lopsided, broken)).toBeNull();
    });
});

describe('detectTriangle', () => {
    it('reads falling highs over rising lows as symmetric', () => {
        const symmetric = [pivot(1, 130, 'high'), pivot(2, 90, 'low'), pivot(3, 122, 'high'), pivot(4, 98, 'low')];
        const hit = detectTriangle(symmetric, closesAt([110, 110, 110, 110]));
        expect(hit?.pattern).toBe('triangle');
        expect(hit?.tool).toBe('triangle');
        expect(hit?.labels).toEqual(['1', '2', '3', '4']);
    });

    it('returns null when the two lines diverge', () => {
        const diverging = [pivot(1, 120, 'high'), pivot(2, 100, 'low'), pivot(3, 132, 'high'), pivot(4, 88, 'low')];
        expect(detectTriangle(diverging, closesAt([110, 110, 110, 110]))).toBeNull();
    });

    it('measures the breakout from the side price left, with the far side as the invalidation', () => {
        // At t=6 the upper line is 110 and the lower 106; the first leg is 40 tall.
        const symmetric = [pivot(1, 130, 'high'), pivot(2, 90, 'low'), pivot(3, 122, 'high'), pivot(4, 98, 'low')];
        const hit = detectTriangle(symmetric, closesAt([110, 108, 111, 109, 112, 115]));
        expect(hit?.direction).toBe('bullish');
        expect(hit?.confirmed).toBe(true);
        expect(hit?.target).toBeCloseTo(150, 0);
        expect(hit?.invalidation).toBeCloseTo(106, 0);
    });
});

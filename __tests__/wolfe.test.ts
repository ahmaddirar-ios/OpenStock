import { describe, expect, it } from 'vitest';
import { checkWolfe, findWolfe, wolfeDirection } from '@/lib/wolfe';
import type { DrawPoint } from '@/lib/chart/drawings';
import type { Candle } from '@/lib/market/yahoo-candles';

const at = (time: number, price: number): DrawPoint => ({ time, price });

// A textbook bullish wave: 1 is a low, 2 a high, 3 a lower low, 4 a lower high that stays inside
// the channel, and 5 a low that pierces the 1-3 line. The 1-3 and 2-4 lines converge.
const bullish: DrawPoint[] = [at(1, 100), at(2, 120), at(3, 90), at(4, 108), at(5, 78)];

// The rising mirror: 1 a high, 2 a low, 3 a higher high, 4 a higher low, 5 a high above the 1-3 line.
const bearish: DrawPoint[] = [at(1, 100), at(2, 80), at(3, 110), at(4, 92), at(5, 122)];

describe('wolfeDirection', () => {
    it('reads a falling five-point structure as bullish', () => {
        expect(wolfeDirection(bullish)).toBe('bullish');
    });

    it('reads a rising five-point structure as bearish', () => {
        expect(wolfeDirection(bearish)).toBe('bearish');
    });

    it('needs five points', () => {
        expect(wolfeDirection(bullish.slice(0, 4))).toBeNull();
    });
});

describe('checkWolfe', () => {
    it('accepts both textbook waves', () => {
        expect(checkWolfe(bullish)).toEqual({ ok: true, direction: 'bullish' });
        expect(checkWolfe(bearish)).toEqual({ ok: true, direction: 'bearish' });
    });

    it('rejects a point 4 that breaks point 2, because the lines would not converge', () => {
        const broken = [at(1, 100), at(2, 120), at(3, 90), at(4, 125), at(5, 78)];
        expect(checkWolfe(broken)).toMatchObject({ ok: false, reason: 'point4' });
    });

    it('rejects a point 5 that never pierces the 1-3 line', () => {
        const broken = [at(1, 100), at(2, 120), at(3, 90), at(4, 108), at(5, 85)];
        expect(checkWolfe(broken)).toMatchObject({ ok: false, reason: 'point5' });
    });

    it('rejects lines that diverge instead of converging', () => {
        // 2-4 falls more slowly than 1-3, so the two lines open up to the right.
        const broken = [at(1, 100), at(2, 120), at(3, 90), at(4, 112), at(5, 78)];
        expect(checkWolfe(broken)).toMatchObject({ ok: false, reason: 'converge' });
    });

    it('rejects a point 3 that does not extend past point 1', () => {
        const broken = [at(1, 100), at(2, 120), at(3, 105), at(4, 108), at(5, 78)];
        expect(checkWolfe(broken)).toMatchObject({ ok: false, reason: 'order' });
    });

    it('rejects points that are not in time order', () => {
        const broken = [at(1, 100), at(3, 120), at(2, 90), at(4, 108), at(5, 78)];
        expect(checkWolfe(broken)).toMatchObject({ ok: false, reason: 'order' });
    });
});

/** A close path walked in equal steps, so the zigzag detector sees one pivot per waypoint. */
const candlesFrom = (waypoints: number[]): Candle[] => {
    const closes: number[] = [];
    for (let i = 0; i < waypoints.length - 1; i += 1) {
        const from = waypoints[i];
        const to = waypoints[i + 1];
        for (let step = 0; step < 5; step += 1) closes.push(from + ((to - from) * step) / 5);
    }
    closes.push(waypoints[waypoints.length - 1]);
    return closes.map((close, index) => ({
        time: 1_000 + index * 60,
        open: close,
        high: close + 0.4,
        low: close - 0.4,
        close,
        volume: 100,
    }));
};

describe('findWolfe', () => {
    it('finds the wave in the candles and returns it as an ordinary drawing', () => {
        const drawing = findWolfe(candlesFrom([100, 95, 120, 90, 108, 78, 95]), { mode: 'percent', percent: 0.02 });
        expect(drawing?.tool).toBe('wolfe');
        expect(drawing?.labels).toEqual(['1', '2', '3', '4', '5']);
        expect(drawing?.points).toHaveLength(5);
        // The drawing is an ordinary one: five chart points that pass the wave's own rules.
        expect(checkWolfe(drawing?.points ?? []).ok).toBe(true);
        // The pivots it picked are the turns of the walk, not bars from the straight legs.
        const prices = (drawing?.points ?? []).map((point) => point.price);
        expect(prices[0]).toBeCloseTo(95, 0);
        expect(prices[1]).toBeCloseTo(120, 0);
        expect(prices[2]).toBeCloseTo(90, 0);
        expect(prices[3]).toBeCloseTo(108, 0);
        expect(prices[4]).toBeCloseTo(78, 0);
    });

    it('returns null when the series never turns enough times', () => {
        const straight = Array.from({ length: 40 }, (_, i) => 100 + i);
        expect(findWolfe(candlesFrom(straight), { mode: 'percent', percent: 0.01 })).toBeNull();
    });

    it('returns null when the turns do not form a wave', () => {
        // A clean zigzag whose point 4 breaks point 2: no valid window anywhere.
        expect(findWolfe(candlesFrom([95, 100, 120, 90, 130, 80, 140]), { mode: 'percent', percent: 0.01 })).toBeNull();
    });
});

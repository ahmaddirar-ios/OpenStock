import { newDrawingId, type DrawPoint, type Drawing } from '@/lib/chart/drawings';
import { detectPivots, type PivotOptions } from '@/lib/chart/auto-count';
import type { Candle } from '@/lib/market/yahoo-candles';

/**
 * Wolfe waves: five alternating turns whose two channel lines converge, and whose fifth point
 * pierces the 1-3 line before the move turns back toward the 1-4 line.
 *
 * The rules are the published ones, not a shape a trader eyeballs:
 * - 1, 3 and 5 sit on one side, 2 and 4 on the other.
 * - 3 extends past 1 in the direction of the trend (a lower low in a falling structure).
 * - 4 stays between 2 and 3, so the 1-3 and 2-4 lines converge instead of opening up.
 * - 5 pierces the 1-3 line. That overshoot is the entry, not point 3.
 * - The target is the 1-4 line extended (Wolfe's EPA), not the 1-3 line.
 *
 * A bullish wave is the falling structure that ends a decline; a bearish wave is its rising mirror.
 */

export type WolfeDirection = 'bullish' | 'bearish';

export type WolfeReason = 'points' | 'order' | 'point4' | 'point5' | 'converge';

export type WolfeCheck = { ok: true; direction: WolfeDirection } | { ok: false; reason: WolfeReason };

/** The price of the line through `a` and `b` at `time`, extended past both ends. */
export const lineAt = (a: DrawPoint, b: DrawPoint, time: number): number => {
    const span = b.time - a.time;
    if (span === 0) return a.price;
    return a.price + ((b.price - a.price) / span) * (time - a.time);
};

const slope = (a: DrawPoint, b: DrawPoint): number => {
    const span = b.time - a.time;
    return span === 0 ? 0 : (b.price - a.price) / span;
};

/**
 * Reads the five points and says whether they are a wave. The direction is decided by point 2
 * against point 1, so a mirrored structure is checked by the same rules with the signs flipped.
 */
export function checkWolfe(points: readonly DrawPoint[]): WolfeCheck {
    if (points.length < 5) return { ok: false, reason: 'points' };
    const [p1, p2, p3, p4, p5] = points;
    // The turns have to happen in order; a shuffled set is not a wave however good it looks.
    if (!(p1.time < p2.time && p2.time < p3.time && p3.time < p4.time && p4.time < p5.time)) {
        return { ok: false, reason: 'order' };
    }

    const bullish = p2.price > p1.price;
    const direction: WolfeDirection = bullish ? 'bullish' : 'bearish';
    const above = (value: number, line: number) => (bullish ? value > line : value < line);
    const below = (value: number, line: number) => (bullish ? value < line : value > line);

    // 2 is the first turn away from 1, and 3 has to extend past 1 in the trend's direction.
    if (!(bullish ? p3.price < p1.price : p3.price > p1.price)) return { ok: false, reason: 'order' };
    // 4 is the turn after 3, and it must stay between 2 and 3 or the channel cannot converge.
    if (!(below(p4.price, p2.price) && above(p4.price, p3.price))) return { ok: false, reason: 'point4' };
    // 5 pierces the 1-3 line: the false break that ends the wave.
    if (!(below(p5.price, lineAt(p1, p3, p5.time)))) return { ok: false, reason: 'point5' };
    // The two channel lines must converge to the right, which is what makes the wedge a wedge.
    const channel = slope(p1, p3);
    const other = slope(p2, p4);
    if (!(bullish ? other < channel : other > channel)) return { ok: false, reason: 'converge' };

    return { ok: true, direction };
}

/** The direction of a valid wave, or null when the five points are not one. */
export function wolfeDirection(points: readonly DrawPoint[]): WolfeDirection | null {
    const check = checkWolfe(points);
    return check.ok ? check.direction : null;
}

/** The five points as an ordinary drawing, so it drags, recolours and deletes like any other. */
export function wolfeDrawing(points: readonly DrawPoint[]): Drawing {
    return {
        id: newDrawingId(),
        tool: 'wolfe',
        points: points.slice(0, 5).map((point) => ({ time: point.time, price: point.price })),
        labels: ['1', '2', '3', '4', '5'],
    };
}

/**
 * The most recent wave in the candles, found from the same zigzag the automatic Elliott count uses.
 * Windows are read newest first, so a fresh wave wins over an older one that is still valid.
 */
export function findWolfe(candles: Candle[], options: PivotOptions): Drawing | null {
    const pivots = detectPivots(candles, options);
    for (let end = pivots.length; end >= 5; end -= 1) {
        const window = pivots.slice(end - 5, end).map((pivot) => ({ time: pivot.time, price: pivot.price }));
        if (checkWolfe(window).ok) return wolfeDrawing(window);
    }
    return null;
}

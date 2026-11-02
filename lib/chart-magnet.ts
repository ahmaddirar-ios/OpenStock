// Magnet snapping for the drawing layer: every point the trader places or drags lands on a bar's
// time and on one of its four prices, when that price is close enough on screen to feel intended.
// Kept pure — the caller supplies the price-to-pixel mapping — so the rule is testable without a chart.

import type { DrawPoint } from '@/lib/chart-drawings';

export type MagnetBar = {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
};

/** How close, in pixels, a level has to be before a point is pulled onto it. */
export const MAGNET_PIXELS = 14;

/** The bar nearest in time. A drawing is anchored to a bar, so the nearest one is the honest target. */
export function nearestBar(bars: readonly MagnetBar[], time: number): MagnetBar | null {
    let best: MagnetBar | null = null;
    let distance = Infinity;
    for (const bar of bars) {
        const gap = Math.abs(bar.time - time);
        if (gap < distance) {
            distance = gap;
            best = bar;
        }
    }
    return best;
}

/**
 * Pulls a point onto the nearest of the bar's O/H/L/C. If no level is within `maxPixels` the point is
 * returned untouched — a magnet that always jumps would fight the trader on every empty area.
 */
export function snapPoint(
    point: DrawPoint,
    bar: MagnetBar,
    priceToY: (price: number) => number | null,
    maxPixels = MAGNET_PIXELS,
): DrawPoint {
    const from = priceToY(point.price);
    if (from == null) return point;

    let price = point.price;
    let distance = Infinity;
    for (const level of [bar.open, bar.high, bar.low, bar.close]) {
        const y = priceToY(level);
        if (y == null) continue;
        const gap = Math.abs(y - from);
        if (gap < distance) {
            distance = gap;
            price = level;
        }
    }

    return distance <= maxPixels ? { time: bar.time, price } : point;
}

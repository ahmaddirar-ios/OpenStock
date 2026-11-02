// Line Break: a new box prints only when the close clears the extreme of the last `count` boxes, so
// ordinary pullbacks leave the chart alone and only genuine continuation advances it. Each box is a
// vertical bar from the previous level to the new one, coloured by its direction.

export type LineBreakPoint = { time: number; price: number; up: boolean };

/**
 * Turns closes into Line Break boxes. `count` is the number of prior boxes a close must exceed (3 is
 * the classic three-line break). A box keeps the time of the bar that printed it, with one-second
 * increments for the extra boxes of a single bar, so times stay strictly increasing.
 */
export function lineBreak(candles: readonly { time: number; close: number }[], count = 3): LineBreakPoint[] {
    if (candles.length === 0) return [];
    const lines = Math.max(1, Math.floor(count));
    const points: LineBreakPoint[] = [{ time: candles[0].time, price: candles[0].close, up: true }];

    for (let i = 1; i < candles.length; i += 1) {
        const close = candles[i].close;
        // The window is the last `lines` levels; a break has to clear all of them.
        const window = points.slice(-lines).map((point) => point.price);
        const high = Math.max(...window);
        const low = Math.min(...window);
        if (close > high) points.push({ time: candles[i].time, price: close, up: true });
        else if (close < low) points.push({ time: candles[i].time, price: close, up: false });
    }

    for (let i = 1; i < points.length; i += 1) {
        if (points[i].time <= points[i - 1].time) points[i].time = points[i - 1].time + 1;
    }
    return points;
}

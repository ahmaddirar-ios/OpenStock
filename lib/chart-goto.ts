// "Go to date": the arithmetic behind jumping the chart to a bar, kept apart from the host so it
// can be tested without a canvas. The host owns the visible range; this file only says which bar
// the trader meant and how wide a window to open around it.

/** The index of the bar closest to `target`, or -1 when there are no bars. */
export function nearestBarIndex(times: readonly number[], target: number): number {
    if (times.length === 0) return -1;
    let best = 0;
    let bestDelta = Math.abs(times[0] - target);
    for (let i = 1; i < times.length; i += 1) {
        const delta = Math.abs(times[i] - target);
        if (delta < bestDelta) {
            bestDelta = delta;
            best = i;
        }
    }
    return best;
}

/** Whether the visible range already reaches the newest bar (within a bar or two). */
export function isAtLatest(range: { from: number; to: number } | null, count: number): boolean {
    if (!range || count <= 0) return true;
    return range.to >= count - 2;
}

/** The range that keeps the current width but ends at the newest bar. */
export function latestRange(range: { from: number; to: number } | null, count: number): { from: number; to: number } {
    if (count <= 0) return { from: -1, to: 1 };
    const span = range ? Math.max(10, range.to - range.from) : Math.min(count, 120);
    return { from: Math.max(-1, count - span), to: count };
}

/**
 * A window of `span` bars centred on `index`, clamped so it never runs past the series. The chart
 * accepts a logical range from -1 (one empty slot before the first bar) to `count` (one after the
 * last), which is why the clamp uses those bounds rather than 0 and count - 1.
 */
export function centredRange(index: number, count: number, span: number): { from: number; to: number } {
    if (count <= 0) return { from: -1, to: 1 };
    const width = Math.max(2, Math.min(span, count + 2));
    const half = width / 2;
    let from = index - half;
    let to = index + half;
    if (from < -1) {
        to += -1 - from;
        from = -1;
    }
    if (to > count) {
        from -= to - count;
        to = count;
    }
    return { from: Math.max(-1, from), to: Math.min(count, to) };
}

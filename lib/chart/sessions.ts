// Session breaks: when a market is shut, its bars simply stop. Drawing them as one continuous strip
// hides what actually happened overnight, so the gaps are filled with empty slots — one per missing
// interval — and the candles on either side stand apart. The bars themselves never change.

export type BreakCandle = { time: number };

/**
 * The interval the data is really on: the **smallest** positive gap between consecutive bars. The
 * smallest, not the average, because gaps only ever grow — a weekend or a holiday is a gap, an extra
 * bar between two others is not.
 */
export function intervalStep(times: readonly number[]): number {
    let step = 0;
    for (let i = 1; i < times.length; i += 1) {
        const gap = times[i] - times[i - 1];
        if (gap > 0 && (step === 0 || gap < step)) step = gap;
    }
    return step;
}

/**
 * The bars plus empty slots across every gap longer than one-and-a-half intervals. The first bar is
 * the reference: a gap is anything after it that skips at least one whole interval.
 */
export function withSessionBreaks<T extends BreakCandle>(
    candles: readonly T[],
    step = intervalStep(candles.map((c) => c.time)),
): (T | BreakCandle)[] {
    if (candles.length < 2 || step <= 0) return candles.slice();
    const out: (T | BreakCandle)[] = [candles[0]];
    for (let i = 1; i < candles.length; i += 1) {
        const previous = candles[i - 1].time;
        const gap = candles[i].time - previous;
        if (gap > step * 1.5) {
            for (let time = previous + step; time < candles[i].time; time += step) out.push({ time });
        }
        out.push(candles[i]);
    }
    return out;
}

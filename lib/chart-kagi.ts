// Kagi: the price line turns only when the market retraces a set percentage, so ordinary noise
// never makes a corner. The line is thick and green while the trend makes higher highs (yang) and
// thin and red while it makes lower lows (yin).

export type KagiPoint = { time: number; price: number; yin: boolean };

/**
 * Turns closes into Kagi corners. `reversal` is the retracement that flips the line, as a fraction
 * (0.04 is four percent). A corner keeps the time of the bar that caused it; two corners in one bar
 * get one-second increments so times stay strictly increasing.
 */
export function kagi(candles: readonly { time: number; close: number }[], reversal = 0.04): KagiPoint[] {
    if (candles.length === 0) return [];
    const flip = reversal > 0 ? reversal : 0.04;
    const points: KagiPoint[] = [{ time: candles[0].time, price: candles[0].close, yin: false }];
    let yin = false;
    let extreme = candles[0].close;
    let level = candles[0].close;

    for (let i = 1; i < candles.length; i += 1) {
        const close = candles[i].close;
        if (!yin) {
            if (close > extreme) {
                extreme = close;
                level = close;
            } else if (close <= extreme * (1 - flip)) {
                // A yang line turns down at its high; from here the lows count.
                points.push({ time: candles[i].time, price: level, yin: false });
                yin = true;
                extreme = close;
                level = close;
                points.push({ time: candles[i].time, price: level, yin: true });
            }
        } else if (close < extreme) {
            extreme = close;
            level = close;
        } else if (close >= extreme * (1 + flip)) {
            points.push({ time: candles[i].time, price: level, yin: true });
            yin = false;
            extreme = close;
            level = close;
            points.push({ time: candles[i].time, price: level, yin: false });
        }
    }

    // Strictly increasing times: the library indexes bars by time.
    for (let i = 1; i < points.length; i += 1) {
        if (points[i].time <= points[i - 1].time) points[i].time = points[i - 1].time + 1;
    }
    return points;
}

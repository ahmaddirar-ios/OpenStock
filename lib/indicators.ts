// Indicator maths, kept apart from the chart so it can be tested without a browser.
// Every function returns one value per input value, null while its window is not full yet, so the
// result lines up with the candles on the chart.

export type Series = (number | null)[];

/** Simple moving average of the last `period` values. */
export function sma(values: number[], period: number): Series {
    if (period < 1) return values.map(() => null);
    const out: Series = [];
    let sum = 0;
    for (let i = 0; i < values.length; i += 1) {
        sum += values[i];
        if (i >= period) sum -= values[i - period];
        out.push(i >= period - 1 ? sum / period : null);
    }
    return out;
}

/** Exponential moving average, seeded with the SMA of the first window (the usual convention). */
export function ema(values: number[], period: number): Series {
    if (period < 1 || values.length < period) return values.map(() => null);
    const k = 2 / (period + 1);
    const out: Series = values.map(() => null);
    let running = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out[period - 1] = running;
    for (let i = period; i < values.length; i += 1) {
        running = values[i] * k + running * (1 - k);
        out[i] = running;
    }
    return out;
}

/** Wilder's RSI: average gain against average loss, smoothed rather than restarted each bar. */
export function rsi(values: number[], period = 14): Series {
    const out: Series = values.map(() => null);
    if (values.length <= period) return out;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= period; i += 1) {
        const change = values[i] - values[i - 1];
        if (change >= 0) gain += change;
        else loss -= change;
    }
    gain /= period;
    loss /= period;
    out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    for (let i = period + 1; i < values.length; i += 1) {
        const change = values[i] - values[i - 1];
        gain = (gain * (period - 1) + Math.max(change, 0)) / period;
        loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
        out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
    return out;
}

export type Macd = { macd: Series; signal: Series; histogram: Series };

/** MACD: the fast EMA minus the slow one, its signal line, and the gap between them. */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): Macd {
    const fastLine = ema(values, fast);
    const slowLine = ema(values, slow);
    const line: Series = values.map((_, i) =>
        fastLine[i] != null && slowLine[i] != null ? (fastLine[i] as number) - (slowLine[i] as number) : null,
    );

    // The signal line is an EMA of the line itself, which starts once the slow EMA does.
    const dense = line.map((v) => v ?? 0);
    const signalRaw = ema(dense, signalPeriod);
    const signal: Series = line.map((v, i) => (v == null ? null : signalRaw[i]));
    const histogram: Series = line.map((v, i) => (v != null && signal[i] != null ? v - (signal[i] as number) : null));
    return { macd: line, signal, histogram };
}

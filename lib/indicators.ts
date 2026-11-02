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


export type Bollinger = { upper: Series; middle: Series; lower: Series };

/**
 * Bollinger Bands: the SMA with a band k population standard deviations either side, measured over
 * the same window. Population (not sample) is what the charting platforms draw.
 */
export function bollinger(values: number[], period = 20, k = 2): Bollinger {
    const middle = sma(values, period);
    const upper: Series = [];
    const lower: Series = [];
    for (let i = 0; i < values.length; i += 1) {
        const mean = middle[i];
        if (mean == null) {
            upper.push(null);
            lower.push(null);
            continue;
        }
        let squares = 0;
        for (let j = i - period + 1; j <= i; j += 1) squares += (values[j] - mean) ** 2;
        const deviation = Math.sqrt(squares / period);
        upper.push(mean + k * deviation);
        lower.push(mean - k * deviation);
    }
    return { upper, middle, lower };
}

const SESSION_SECONDS = 86_400;

export type VolumeBar = { time: number; high: number; low: number; close: number; volume: number };

/**
 * VWAP: the typical price weighted by volume. The anchor is read from the data, not from a setting:
 * an intraday series resets at each **UTC day** (both the Saudi and the US session sit inside one
 * UTC day), while a daily or coarser series anchors once at its first bar — a session VWAP on a
 * daily chart would just be the typical price. A bar with no volume contributes nothing and reads
 * null until volume appears.
 */
export function vwap(candles: readonly VolumeBar[]): Series {
    if (candles.length === 0) return [];
    const gaps: number[] = [];
    for (let i = 1; i < candles.length; i += 1) gaps.push(candles[i].time - candles[i - 1].time);
    gaps.sort((a, b) => a - b);
    const median = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 0;
    const perSession = median > 0 && median < SESSION_SECONDS;

    const out: Series = [];
    let weighted = 0;
    let volume = 0;
    let session = -1;
    for (const candle of candles) {
        const day = Math.floor(candle.time / SESSION_SECONDS);
        if (perSession && day !== session) {
            weighted = 0;
            volume = 0;
            session = day;
        }
        weighted += ((candle.high + candle.low + candle.close) / 3) * candle.volume;
        volume += candle.volume;
        out.push(volume > 0 ? weighted / volume : null);
    }
    return out;
}

export type RangeBar = { high: number; low: number; close: number };

/** Average True Range, Wilder-smoothed, seeded on the mean of the first `period` true ranges. */
export function atr(candles: readonly RangeBar[], period = 14): Series {
    const out: Series = candles.map(() => null);
    if (candles.length === 0 || period < 1 || candles.length < period) return out;

    const ranges = candles.map((bar, i) => {
        if (i === 0) return bar.high - bar.low;
        const previous = candles[i - 1].close;
        return Math.max(bar.high - bar.low, Math.abs(bar.high - previous), Math.abs(bar.low - previous));
    });

    let running = ranges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    out[period - 1] = running;
    for (let i = period; i < candles.length; i += 1) {
        running = (running * (period - 1) + ranges[i]) / period;
        out[i] = running;
    }
    return out;
}

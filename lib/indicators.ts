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

export type Stochastic = { k: Series; d: Series };

const highest = (bars: readonly RangeBar[], from: number, to: number) => {
    let value = -Infinity;
    for (let i = from; i <= to; i += 1) value = Math.max(value, bars[i].high);
    return value;
};

const lowest = (bars: readonly RangeBar[], from: number, to: number) => {
    let value = Infinity;
    for (let i = from; i <= to; i += 1) value = Math.min(value, bars[i].low);
    return value;
};

/** Moving average over a series that may still be warming up: null until its whole window is real. */
function smoothSeries(values: Series, period: number): Series {
    if (period < 1) return values.map(() => null);
    const out: Series = values.map(() => null);
    let sum = 0;
    let filled = 0;
    for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        if (value == null) {
            sum = 0;
            filled = 0;
            continue;
        }
        sum += value;
        filled += 1;
        if (filled > period) {
            const leaving = values[i - period];
            if (leaving == null) {
                sum = 0;
                filled = 0;
                continue;
            }
            sum -= leaving;
            filled = period;
        }
        if (filled === period) out[i] = sum / period;
    }
    return out;
}

/**
 * The slow stochastic: raw %K sits the close between the window's low (0) and high (100), is
 * smoothed over `smooth` bars, and %D is a `dPeriod` average of that. A window with no range at all
 * reads 50 — the close is neither near the high nor the low — instead of dividing by zero.
 */
export function stochastic(candles: readonly RangeBar[], kPeriod = 14, smooth = 3, dPeriod = 3): Stochastic {
    const out = candles.map(() => null) as Series;
    for (let i = kPeriod - 1; i < candles.length; i += 1) {
        const high = highest(candles, i - kPeriod + 1, i);
        const low = lowest(candles, i - kPeriod + 1, i);
        out[i] = high === low ? 50 : (100 * (candles[i].close - low)) / (high - low);
    }
    const k = smoothSeries(out, smooth);
    const d = smoothSeries(k, dPeriod);
    return { k, d };
}

/**
 * Williams %R: the same position as stochastic %K, read the other way round and inverted, so a fresh
 * high is 0 and a fresh low is −100.
 */
export function williamsR(candles: readonly RangeBar[], period = 14): Series {
    const out = candles.map(() => null) as Series;
    for (let i = period - 1; i < candles.length; i += 1) {
        const high = highest(candles, i - period + 1, i);
        const low = lowest(candles, i - period + 1, i);
        out[i] = high === low ? 0 : (-100 * (high - candles[i].close)) / (high - low);
    }
    return out;
}

/**
 * CCI: how far the typical price sits from its own average, in units of mean deviation (Lambert's
 * 0.015 scaling keeps it inside roughly ±100 for a normal trend).
 */
export function cci(candles: readonly RangeBar[], period = 20): Series {
    const typical = candles.map((bar) => (bar.high + bar.low + bar.close) / 3);
    const mean = sma(typical, period);
    return typical.map((price, i) => {
        const average = mean[i];
        if (average == null) return null;
        let deviation = 0;
        for (let j = i - period + 1; j <= i; j += 1) deviation += Math.abs(typical[j] - average);
        deviation /= period;
        return deviation === 0 ? 0 : (price - average) / (0.015 * deviation);
    });
}

export type Adx = { adx: Series; plusDi: Series; minusDi: Series };

/**
 * Wilder's directional system. The true range and the two directional movements are smoothed from
 * the first bar that has a previous one (`period` values), so the DI pair starts at index `period`
 * and ADX — itself a Wilder average of DX — at index `2 · period − 1`. That is one bar later than
 * the "first bar counts as a movement" shortcut some platforms take, and it is deliberate: bar 0 has
 * no previous high or low to compare against.
 */
export function adx(candles: readonly RangeBar[], period = 14): Adx {
    const plusDi = candles.map(() => null) as Series;
    const minusDi = candles.map(() => null) as Series;
    const adxOut = candles.map(() => null) as Series;
    if (period < 1 || candles.length <= period) return { adx: adxOut, plusDi, minusDi };

    const range: number[] = [];
    const up: number[] = [];
    const down: number[] = [];
    for (let i = 1; i < candles.length; i += 1) {
        const bar = candles[i];
        const previous = candles[i - 1];
        range.push(
            Math.max(bar.high - bar.low, Math.abs(bar.high - previous.close), Math.abs(bar.low - previous.close)),
        );
        const upMove = bar.high - previous.high;
        const downMove = previous.low - bar.low;
        up.push(upMove > downMove && upMove > 0 ? upMove : 0);
        down.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    const total = (values: number[], from: number, count: number) =>
        values.slice(from, from + count).reduce((sum, value) => sum + value, 0);

    let rangeSum = total(range, 0, period);
    let upSum = total(up, 0, period);
    let downSum = total(down, 0, period);

    const dx: number[] = [];
    for (let i = period; i < candles.length; i += 1) {
        if (i > period) {
            // Wilder's running sum: drop one period's worth, add the new bar.
            rangeSum = rangeSum - rangeSum / period + range[i - 1];
            upSum = upSum - upSum / period + up[i - 1];
            downSum = downSum - downSum / period + down[i - 1];
        }
        const plus = rangeSum === 0 ? 0 : (100 * upSum) / rangeSum;
        const minus = rangeSum === 0 ? 0 : (100 * downSum) / rangeSum;
        plusDi[i] = plus;
        minusDi[i] = minus;
        const sum = plus + minus;
        dx.push(sum === 0 ? 0 : (100 * Math.abs(plus - minus)) / sum);
    }

    if (dx.length < period) return { adx: adxOut, plusDi, minusDi };
    let running = dx.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    adxOut[2 * period - 1] = running;
    for (let k = period; k < dx.length; k += 1) {
        running = (running * (period - 1) + dx[k]) / period;
        adxOut[period + k] = running;
    }
    return { adx: adxOut, plusDi, minusDi };
}

export type ObvBar = { close: number; volume: number };

/** On-balance volume: a running total that adds the bar's volume on an up close, subtracts on a down. */
export function obv(candles: readonly ObvBar[]): Series {
    const out: Series = [];
    let running = 0;
    for (let i = 0; i < candles.length; i += 1) {
        if (i > 0) {
            const change = candles[i].close - candles[i - 1].close;
            running += change > 0 ? candles[i].volume : change < 0 ? -candles[i].volume : 0;
        }
        out.push(running);
    }
    return out;
}

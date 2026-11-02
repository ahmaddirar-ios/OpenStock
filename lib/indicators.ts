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

/** A bar with all four prices — what a study's source selector needs. */
export type SourceBar = { open: number; high: number; low: number; close: number };

/**
 * The price a study averages, exactly as TradingView names it: one of the four prices, or the
 * composites `(H+L)/2`, `(H+L+C)/3` and `(O+H+L+C)/4`. An unknown name reads the close, so a stale
 * stored value can never make a study blank.
 */
export function priceSeries(candles: readonly SourceBar[], source: string): number[] {
    switch (source) {
        case 'open':
            return candles.map((bar) => bar.open);
        case 'high':
            return candles.map((bar) => bar.high);
        case 'low':
            return candles.map((bar) => bar.low);
        case 'hl2':
            return candles.map((bar) => (bar.high + bar.low) / 2);
        case 'hlc3':
            return candles.map((bar) => (bar.high + bar.low + bar.close) / 3);
        case 'ohlc4':
            return candles.map((bar) => (bar.open + bar.high + bar.low + bar.close) / 4);
        default:
            return candles.map((bar) => bar.close);
    }
}

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

export type Ichimoku = {
    tenkan: Series;
    kijun: Series;
    senkouA: Series;
    senkouB: Series;
    chikou: Series;
};

const midpoint = (candles: readonly RangeBar[], i: number, period: number): number | null =>
    i < period - 1 ? null : (highest(candles, i - period + 1, i) + lowest(candles, i - period + 1, i)) / 2;

/**
 * Ichimoku. Five lines, three of them moved in time: the cloud (`senkouA`, `senkouB`) is the value
 * computed `shift` bars *earlier* — read that as a projection, drawn up to the last candle — and the
 * lagging span (`chikou`) is the close `shift` bars *later*, so on the chart it trails the price.
 * Because everything is computed from the candles the host was given, a replay only sees the bars it
 * has revealed: `chikou` is empty where the later close does not exist yet.
 */
export function ichimoku(candles: readonly RangeBar[], conversion = 9, base = 26, spanB = 52, shift = 26): Ichimoku {
    const tenkan = candles.map((_, i) => midpoint(candles, i, conversion));
    const kijun = candles.map((_, i) => midpoint(candles, i, base));
    const span52 = candles.map((_, i) => midpoint(candles, i, spanB));

    const senkouA: Series = candles.map((_, i) => {
        const from = i - shift;
        if (from < 0) return null;
        const a = tenkan[from];
        const b = kijun[from];
        return a == null || b == null ? null : (a + b) / 2;
    });
    const senkouB: Series = candles.map((_, i) => {
        const from = i - shift;
        return from < 0 ? null : span52[from];
    });
    const chikou: Series = candles.map((_, i) => {
        const at = i + shift;
        return at < candles.length ? candles[at].close : null;
    });

    return { tenkan, kijun, senkouA, senkouB, chikou };
}

export type Donchian = { upper: Series; middle: Series; lower: Series };

/** Donchian channel: the highest high, the lowest low, and the middle of the two. */
export function donchian(candles: readonly RangeBar[], period = 20): Donchian {
    const upper = candles.map((_, i) => (i < period - 1 ? null : highest(candles, i - period + 1, i)));
    const lower = candles.map((_, i) => (i < period - 1 ? null : lowest(candles, i - period + 1, i)));
    const middle = upper.map((value, i) => {
        const low = lower[i];
        return value == null || low == null ? null : (value + low) / 2;
    });
    return { upper, middle, lower };
}

export type Keltner = { upper: Series; middle: Series; lower: Series };

/** Keltner channel: an EMA of the close, banded by a multiple of ATR. */
export function keltner(
    candles: readonly RangeBar[],
    period = 20,
    multiplier = 2,
    values = candles.map((bar) => bar.close),
): Keltner {
    const middle = ema(values, period);
    const width = atr(candles, period);
    const band = (sign: number): Series =>
        middle.map((value, i) => {
            const spread = width[i];
            return value == null || spread == null ? null : value + sign * multiplier * spread;
        });
    return { upper: band(1), middle, lower: band(-1) };
}

/**
 * Supertrend: an ATR band that only ratchets in the direction of the trend and flips when the close
 * crosses it. The line is the active band — below the price while the trend is up, above it while it
 * is down.
 */
export function supertrend(candles: readonly RangeBar[], period = 10, multiplier = 3): Series {
    const width = atr(candles, period);
    const out: Series = candles.map(() => null);
    let upper = 0;
    let lower = 0;
    let up = true;
    let started = false;

    for (let i = 0; i < candles.length; i += 1) {
        const spread = width[i];
        if (spread == null) continue;
        const bar = candles[i];
        const middle = (bar.high + bar.low) / 2;
        const basicUpper = middle + multiplier * spread;
        const basicLower = middle - multiplier * spread;

        if (!started) {
            upper = basicUpper;
            lower = basicLower;
            up = bar.close >= middle;
            started = true;
            out[i] = up ? lower : upper;
            continue;
        }

        const previousClose = candles[i - 1].close;
        upper = basicUpper < upper || previousClose > upper ? basicUpper : upper;
        lower = basicLower > lower || previousClose < lower ? basicLower : lower;
        up = up ? bar.close > lower : bar.close > upper;
        out[i] = up ? lower : upper;
    }
    return out;
}

/**
 * Parabolic SAR: an accelerating stop that trails the price, flipping sides when it is touched.
 * `step` is the acceleration increment, `max` its ceiling.
 */
export function parabolicSar(candles: readonly RangeBar[], step = 0.02, max = 0.2): Series {
    const out: Series = candles.map(() => null);
    if (candles.length < 2) return out;

    const first = candles[0];
    const second = candles[1];
    let up = second.close >= first.close;
    let acceleration = step;
    // The stop starts at the extreme of the side the market is leaving.
    let sar = up ? first.low : first.high;
    let extreme = up ? Math.max(first.high, second.high) : Math.min(first.low, second.low);
    out[1] = sar;

    for (let i = 2; i < candles.length; i += 1) {
        const bar = candles[i];
        const previous = candles[i - 1];
        sar += acceleration * (extreme - sar);

        if (up) {
            // Never above the last two lows, or the reversal would happen instantly.
            sar = Math.min(sar, previous.low, candles[i - 2].low);
            if (bar.low < sar) {
                up = false;
                sar = extreme;
                extreme = bar.low;
                acceleration = step;
            } else if (bar.high > extreme) {
                extreme = bar.high;
                acceleration = Math.min(max, acceleration + step);
            }
        } else {
            sar = Math.max(sar, previous.high, candles[i - 2].high);
            if (bar.high > sar) {
                up = true;
                sar = extreme;
                extreme = bar.high;
                acceleration = step;
            } else if (bar.low < extreme) {
                extreme = bar.low;
                acceleration = Math.min(max, acceleration + step);
            }
        }
        out[i] = sar;
    }
    return out;
}

export type Pivots = { pivot: Series; r1: Series; r2: Series; r3: Series; s1: Series; s2: Series; s3: Series };

/**
 * Classic floor pivots from the **previous bar** — on a daily chart that is yesterday's high/low/close,
 * which is the usual reading, and it stays honest on any other interval instead of pretending it knows
 * the session calendar.
 */
export function pivots(candles: readonly RangeBar[]): Pivots {
    const build = (rule: (p: number, h: number, l: number) => number): Series =>
        candles.map((_, i) => {
            if (i === 0) return null;
            const high = candles[i - 1].high;
            const low = candles[i - 1].low;
            const close = candles[i - 1].close;
            const p = (high + low + close) / 3;
            return rule(p, high, low);
        });

    return {
        pivot: build((p) => p),
        r1: build((p, _h, l) => 2 * p - l),
        s1: build((p, h) => 2 * p - h),
        r2: build((p, h, l) => p + (h - l)),
        s2: build((p, h, l) => p - (h - l)),
        r3: build((p, h, l) => h + 2 * (p - l)),
        s3: build((p, h, l) => l - 2 * (h - p)),
    };
}

/** Weighted moving average: the newest bar carries the heaviest weight (1 … period). */
export function wma(values: number[], period: number): Series {
    if (period < 1 || values.length < period) return values.map(() => null);
    const weight = (period * (period + 1)) / 2;
    const out: Series = values.map(() => null);
    for (let i = period - 1; i < values.length; i += 1) {
        let sum = 0;
        for (let j = 0; j < period; j += 1) sum += values[i - period + 1 + j] * (j + 1);
        out[i] = sum / weight;
    }
    return out;
}

/**
 * Hull moving average: the WMA of `period` pulled forward by the WMA of half of it, then smoothed
 * over the square root of the period. It hugs the price far closer than an SMA of the same length.
 */
export function hma(values: number[], period = 9): Series {
    if (period < 2) return values.map(() => null);
    const half = Math.max(1, Math.round(period / 2));
    const root = Math.max(1, Math.round(Math.sqrt(period)));
    const full = wma(values, period);
    const halfLine = wma(values, half);
    const inner: Series = values.map((_, i) => {
        const a = full[i];
        const b = halfLine[i];
        return a == null || b == null ? null : 2 * b - a;
    });

    // The final smoothing runs over `inner`, which is still warming up: it only reads once `root`
    // consecutive real values exist.
    const out: Series = values.map(() => null);
    for (let i = 0; i < inner.length; i += 1) {
        if (i < root - 1) continue;
        let sum = 0;
        let weight = 0;
        let complete = true;
        for (let j = 0; j < root; j += 1) {
            const value = inner[i - root + 1 + j];
            if (value == null) {
                complete = false;
                break;
            }
            sum += value * (j + 1);
            weight += j + 1;
        }
        if (complete) out[i] = sum / weight;
    }
    return out;
}

/** Volume-weighted moving average: the mean close, where each bar counts by its volume. */
export function vwma(
    candles: readonly { close: number; volume: number }[],
    period = 20,
    values = candles.map((bar) => bar.close),
): Series {
    const out: Series = candles.map(() => null);
    for (let i = period - 1; i < candles.length; i += 1) {
        let weighted = 0;
        let volume = 0;
        for (let j = i - period + 1; j <= i; j += 1) {
            weighted += values[j] * candles[j].volume;
            volume += candles[j].volume;
        }
        out[i] = volume > 0 ? weighted / volume : null;
    }
    return out;
}

/** Momentum: how far the value has moved from `period` bars ago, in price units. */
export function momentum(values: number[], period = 10): Series {
    const out: Series = values.map(() => null);
    for (let i = period; i < values.length; i += 1) out[i] = values[i] - values[i - period];
    return out;
}

/** Rate of change: the same move as a percentage of the older value. */
export function roc(values: number[], period = 9): Series {
    const out: Series = values.map(() => null);
    for (let i = period; i < values.length; i += 1) {
        const base = values[i - period];
        out[i] = base === 0 ? null : ((values[i] - base) / base) * 100;
    }
    return out;
}

export type Aroon = { up: Series; down: Series };

/**
 * Aroon: how recently the window's high and low happened. The newest bar reads 100, the oldest 0 —
 * a trend is a high Aroon up, a range is both lines middling.
 */
export function aroon(candles: readonly RangeBar[], period = 14): Aroon {
    const up: Series = candles.map(() => null);
    const down: Series = candles.map(() => null);
    for (let i = period; i < candles.length; i += 1) {
        let highAt = i;
        let lowAt = i;
        for (let j = i - period; j <= i; j += 1) {
            if (candles[j].high >= candles[highAt].high) highAt = j;
            if (candles[j].low <= candles[lowAt].low) lowAt = j;
        }
        up[i] = ((period - (i - highAt)) / period) * 100;
        down[i] = ((period - (i - lowAt)) / period) * 100;
    }
    return { up, down };
}

/**
 * TRIX: the one-bar percentage change of a triple-smoothed EMA. Triple smoothing removes the noise
 * an EMA still carries, and the change turns it into an oscillator around zero.
 */
/** An EMA over a series that already has warm-up nulls: smoothed after the first real value only. */
const emaOn = (series: Series, period: number): Series => {
    const start = series.findIndex((value) => value != null);
    if (start < 0) return series.map(() => null);
    const smoothed = ema(series.slice(start) as number[], period);
    return series.map((_, i) => (i < start ? null : smoothed[i - start] ?? null));
};

export function trix(values: number[], period = 15): Series {
    const first = ema(values, period);
    const second = emaOn(first, period);
    const third = emaOn(second, period);
    const out: Series = values.map(() => null);
    for (let i = 1; i < values.length; i += 1) {
        const before = third[i - 1];
        const now = third[i];
        // All three EMAs have to be real before the change means anything.
        if (before == null || now == null || before === 0) continue;
        out[i] = ((now - before) / before) * 100;
    }
    return out;
}

/**
 * Money Flow Index: RSI weighted by volume. Each bar's typical price is compared with the previous
 * one, its money flow (typical price × volume) is booked as positive or negative, and the index is
 * the share of positive flow in the window.
 */
export function mfi(candles: readonly { high: number; low: number; close: number; volume: number }[], period = 14): Series {
    const out: Series = candles.map(() => null);
    const typical = candles.map((bar) => (bar.high + bar.low + bar.close) / 3);
    for (let i = period; i < candles.length; i += 1) {
        let positive = 0;
        let negative = 0;
        for (let j = i - period + 1; j <= i; j += 1) {
            const flow = typical[j] * candles[j].volume;
            if (typical[j] > typical[j - 1]) positive += flow;
            else if (typical[j] < typical[j - 1]) negative += flow;
        }
        if (negative === 0) out[i] = positive === 0 ? 50 : 100;
        else out[i] = 100 - 100 / (1 + positive / negative);
    }
    return out;
}

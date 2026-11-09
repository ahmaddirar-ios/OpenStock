import { COUNT_GLYPHS, COUNT_TOOL, newDrawingId, pointsNeeded, type CountDegree, type CountKind, type Drawing } from '@/lib/chart-drawings';
import type { Candle } from '@/lib/yahoo-candles';

/**
 * Automatic wave numbering: the turning points a trader would mark by hand, found from the bars.
 *
 * A zigzag with an adaptive threshold, the way charting platforms do it. A new leg only starts when
 * price reverses by more than the threshold, so noise inside a trend is ignored; a pivot is emitted
 * only once the reversal that confirms it has happened, which is why the very last extreme of a
 * series is normally still open.
 *
 * Two thresholds, both scale free:
 * - `atr` (the default) follows the instrument's own volatility, so wide bars demand a wider swing.
 * - `percent` is the fixed percentage a trader thinks in, for when the volatility is not the point.
 */

export type PivotKind = 'high' | 'low';

export type Pivot = {
    /** The bar the extreme happened on. */
    time: number;
    price: number;
    kind: PivotKind;
};

/** What the sensitivity picker in the toolbar offers, `atr` first. */
export const AUTO_SENSITIVITIES = ['atr', '0.01', '0.03', '0.05'] as const;

export type AutoSensitivity = (typeof AUTO_SENSITIVITIES)[number];

export type PivotOptions = {
    mode: 'atr' | 'percent';
    /** `percent` mode only: the reversal that starts a leg, as a fraction of price. */
    percent?: number;
    /** `atr` mode only: bars in the average true range. */
    atrPeriod?: number;
    /** `atr` mode only: how many average ranges a reversal has to clear. */
    atrMultiple?: number;
};

export type AutoCountOptions = PivotOptions & { degree: CountDegree; kind: CountKind };

const DEFAULT_PERCENT = 0.03;
const DEFAULT_ATR_PERIOD = 14;
const DEFAULT_ATR_MULTIPLE = 2;

const isUsable = (candle: Candle): boolean =>
    Boolean(candle) &&
    Number.isFinite(candle.time) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close) &&
    candle.high >= candle.low;

/** One bar's true range: its own span, or the gap it left from the previous close. */
const trueRange = (candle: Candle, previous: Candle | undefined): number =>
    previous
        ? Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close))
        : candle.high - candle.low;

/**
 * Wilder's average true range, aligned with the bars: the value at `i` uses bars up to `i` only, so
 * a threshold never depends on bars the user cannot see yet.
 */
function atrSeries(candles: Candle[], period: number): number[] {
    const out: number[] = [];
    let atr = 0;
    for (let i = 0; i < candles.length; i += 1) {
        const range = trueRange(candles[i], candles[i - 1]);
        if (i === 0) atr = range;
        else if (i < period) atr = (atr * i + range) / (i + 1);
        else atr = (atr * (period - 1) + range) / period;
        out.push(atr);
    }
    return out;
}

/** The turning points of `candles`, oldest first, alternating high and low. */
export function detectPivots(candles: Candle[], options: PivotOptions): Pivot[] {
    const bars = Array.isArray(candles) ? candles.filter(isUsable) : [];
    if (bars.length < 2) return [];

    const period = Math.max(1, Math.floor(options.atrPeriod ?? DEFAULT_ATR_PERIOD));
    const multiple = options.atrMultiple ?? DEFAULT_ATR_MULTIPLE;
    const percent = options.percent ?? DEFAULT_PERCENT;
    const ranges = options.mode === 'atr' ? atrSeries(bars, period) : null;

    const pivots: Pivot[] = [];
    let direction: 'up' | 'down' | null = null;
    let high = -Infinity;
    let highIndex = 0;
    let low = Infinity;
    let lowIndex = 0;

    for (let i = 0; i < bars.length; i += 1) {
        const candle = bars[i];
        if (candle.high > high) {
            high = candle.high;
            highIndex = i;
        }
        if (candle.low < low) {
            low = candle.low;
            lowIndex = i;
        }

        const threshold = options.mode === 'atr' ? multiple * (ranges?.[i] ?? 0) : percent * candle.close;
        // Without a usable threshold every bar would look like a reversal, so stop here.
        if (!(threshold > 0)) return pivots;

        if (direction === null) {
            if (high - low >= threshold) {
                direction = highIndex > lowIndex ? 'up' : 'down';
                high = candle.high;
                highIndex = i;
                low = candle.low;
                lowIndex = i;
            }
            continue;
        }

        if (direction === 'up' && high - candle.low >= threshold) {
            const pivotIndex = highIndex;
            pivots.push({ time: bars[pivotIndex].time, price: high, kind: 'high' });
            direction = 'down';
            high = -Infinity;
            highIndex = i + 1;
            // An outside bar can make the high and the reversal low at once. Two pivots on one bar
            // would be a zero-width leg, so the down leg starts on the next bar instead.
            if (pivotIndex === i) {
                low = Infinity;
                lowIndex = i + 1;
            } else {
                low = candle.low;
                lowIndex = i;
            }
            continue;
        }

        if (direction === 'down' && candle.high - low >= threshold) {
            const pivotIndex = lowIndex;
            pivots.push({ time: bars[pivotIndex].time, price: low, kind: 'low' });
            direction = 'up';
            low = Infinity;
            lowIndex = i + 1;
            if (pivotIndex === i) {
                high = -Infinity;
                highIndex = i + 1;
            } else {
                high = candle.high;
                highIndex = i;
            }
        }
    }

    return pivots;
}

/**
 * The most recent count over the series, drawn as an ordinary drawing: a normal tool id, the glyphs
 * of the requested degree, and the pivots' own timestamps, so it snaps, drags, recolours and deletes
 * exactly like a count placed by hand. `null` when the series has not turned enough times yet.
 */
export function autoCount(candles: Candle[], options: AutoCountOptions): Drawing | null {
    const tool = COUNT_TOOL[options.kind];
    const need = pointsNeeded(tool);
    const pivots = detectPivots(candles, options);
    if (pivots.length < need) return null;

    return {
        id: newDrawingId(),
        tool,
        points: pivots.slice(-need).map((pivot) => ({ time: pivot.time, price: pivot.price })),
        labels: [...COUNT_GLYPHS[options.degree][options.kind]],
    };
}

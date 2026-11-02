// What the chart knows about the bar under the crosshair: that bar's OHLC and volume, its change
// against the previous close, and the value of every indicator drawn on the chart at that bar.
// Pure, so the legend's numbers are pinned by tests instead of by a browser run.

import type { Series } from '@/lib/indicators';
import type { Candle } from '@/lib/yahoo-candles';

/**
 * One series per drawn study line, each aligned to the candles by index. Keys are the host's own
 * `${studyIndex}:${lineKey}`, so two studies of the same kind stay apart.
 */
export type ReadoutSeries = Record<string, Series>;

export type BarReadout = {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    /** Close minus the previous bar's close. Null on the first bar. */
    change: number | null;
    /** `change` as a share of the previous close. Null without a usable previous close. */
    changePercent: number | null;
    /** Only the studies that have a value on this bar: a period still warming up is absent. */
    indicators: Record<string, number>;
};

/**
 * The bar that had closed at `time`: exactly that bar, or the last one before it when the time
 * falls between bars. Outside the series the readout clamps to the nearest end rather than
 * inventing a bar — a hover past the last candle is still the last candle.
 */
const indexFor = (candles: readonly Candle[], time: number): number => {
    let low = 0;
    let high = candles.length - 1;
    let answer = 0;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (candles[mid].time <= time) {
            answer = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return answer;
};

/**
 * The readout for `time`, or for the last bar when `time` is null — which is what leaving the
 * chart means: the legend falls back to the latest bar instead of going blank.
 */
export function readoutAt(
    candles: readonly Candle[],
    series: ReadoutSeries = {},
    time: number | null = null,
): BarReadout | null {
    if (candles.length === 0) return null;
    const index = time == null ? candles.length - 1 : indexFor(candles, time);
    const candle = candles[index];
    const previous = index > 0 ? candles[index - 1].close : null;
    const change = previous == null ? null : candle.close - previous;
    const changePercent = previous == null || previous === 0 ? null : ((change as number) / previous) * 100;

    const indicators: Record<string, number> = {};
    for (const [key, values] of Object.entries(series)) {
        const value = values?.[index];
        if (typeof value === 'number' && Number.isFinite(value)) indicators[key] = value;
    }

    return {
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        change,
        changePercent,
        indicators,
    };
}

const SIZE_UNITS: readonly [number, string][] = [
    [1_000_000_000_000, 'T'],
    [1_000_000_000, 'B'],
    [1_000_000, 'M'],
    [1_000, 'K'],
];

/**
 * Volume in the compact form a chart legend uses (`1.53K`, `1.23M`), so a six-figure share count
 * does not push the rest of the legend off the pane. Digits stay Latin here: the caller localises
 * them the way every other number in the app is localised.
 */
export function compactVolume(value: number): string {
    if (!Number.isFinite(value)) return '—';
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs < 1_000) return `${sign}${Math.round(abs)}`;
    for (const [size, unit] of SIZE_UNITS) {
        if (abs >= size) return `${sign}${Number((abs / size).toFixed(2))}${unit}`;
    }
    return `${sign}${Math.round(abs)}`;
}

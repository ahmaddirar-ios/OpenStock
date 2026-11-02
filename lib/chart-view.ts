// How the same candles are drawn. The data never changes with the chart type; the host renders it as
// bodies, hollow bodies, bars, a line or an area, and Heikin Ashi additionally smooths the four
// prices. Kept out of the host so the smoothing is testable without a canvas.

import type { StringKey } from '@/lib/i18n';
import type { Candle } from '@/lib/yahoo-candles';

export type ChartType = 'candles' | 'hollow' | 'heikin' | 'bars' | 'line' | 'area';

/** The order the menu lists them in: the three candle readings, then bars, then the two lines. */
export const CHART_TYPES: readonly ChartType[] = ['candles', 'hollow', 'heikin', 'bars', 'line', 'area'];

export const DEFAULT_CHART_TYPE: ChartType = 'candles';

export const CHART_TYPE_KEYS: Record<ChartType, StringKey> = {
    candles: 'chart.type.candles',
    hollow: 'chart.type.hollow',
    heikin: 'chart.type.heikin',
    bars: 'chart.type.bars',
    line: 'chart.type.line',
    area: 'chart.type.area',
};

/** Anything that is not one of the six reads as the default: a chart never opens in an unknown mode. */
export function parseChartType(value: unknown): ChartType {
    return typeof value === 'string' && (CHART_TYPES as readonly string[]).includes(value)
        ? (value as ChartType)
        : DEFAULT_CHART_TYPE;
}

export const CHART_TYPE_KEY = 'openstock:chart-type';

type Readable = Pick<Storage, 'getItem'>;
type Writable = Pick<Storage, 'setItem'>;

export function readChartType(storage: Readable): ChartType {
    try {
        return parseChartType(storage.getItem(CHART_TYPE_KEY));
    } catch {
        return DEFAULT_CHART_TYPE;
    }
}

export function writeChartType(storage: Writable, type: ChartType): void {
    try {
        storage.setItem(CHART_TYPE_KEY, type);
    } catch {
        /* private mode: the type still applies for this visit */
    }
}

/**
 * Heikin Ashi: the open is the midpoint of the previous smoothed bar, the close the mean of the four
 * prices, and the high/low are widened to contain both. The first bar has no previous one, so its
 * open is the midpoint of its own open and close. Volume and time pass through untouched.
 */
export function heikinAshi(candles: readonly Candle[]): Candle[] {
    const out: Candle[] = [];
    let previousOpen = 0;
    let previousClose = 0;

    candles.forEach((candle, index) => {
        const close = (candle.open + candle.high + candle.low + candle.close) / 4;
        const open = index === 0 ? (candle.open + candle.close) / 2 : (previousOpen + previousClose) / 2;
        out.push({
            time: candle.time,
            open,
            high: Math.max(candle.high, open, close),
            low: Math.min(candle.low, open, close),
            close,
            volume: candle.volume,
        });
        previousOpen = open;
        previousClose = close;
    });

    return out;
}

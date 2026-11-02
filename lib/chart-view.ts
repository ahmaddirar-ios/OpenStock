// How the same candles are drawn. The data never changes with the chart type; the host renders it as
// bodies, hollow bodies, bars, a line or an area, and Heikin Ashi additionally smooths the four
// prices. Kept out of the host so the smoothing is testable without a canvas.

import type { StringKey } from '@/lib/i18n';
import type { Candle } from '@/lib/yahoo-candles';

export type ChartType = 'candles' | 'hollow' | 'heikin' | 'bars' | 'line' | 'area' | 'renko' | 'kagi';

/** The order the menu lists them in: the three candle readings, then bars, then the two lines. */
export const CHART_TYPES: readonly ChartType[] = [
    'candles',
    'hollow',
    'heikin',
    'bars',
    'line',
    'area',
    'renko',
    'kagi',
];

export const DEFAULT_CHART_TYPE: ChartType = 'candles';

export const CHART_TYPE_KEYS: Record<ChartType, StringKey> = {
    candles: 'chart.type.candles',
    hollow: 'chart.type.hollow',
    heikin: 'chart.type.heikin',
    bars: 'chart.type.bars',
    line: 'chart.type.line',
    area: 'chart.type.area',
    renko: 'chart.type.renko',
    kagi: 'chart.type.kagi',
};

/** Anything that is not one of the six reads as the default: a chart never opens in an unknown mode. */
export function parseChartType(value: unknown): ChartType {
    return typeof value === 'string' && (CHART_TYPES as readonly string[]).includes(value)
        ? (value as ChartType)
        : DEFAULT_CHART_TYPE;
}

export const CHART_TYPE_KEY = 'openstock:chart-type';

/** How the price axis spaces its labels: arithmetic, multiplicative, or percent from the base bar. */
export type ScaleMode = 'linear' | 'log' | 'percent' | 'indexed';

export const SCALE_MODES: readonly ScaleMode[] = ['linear', 'log', 'percent', 'indexed'];

export const SCALE_MODE_KEYS: Record<ScaleMode, StringKey> = {
    linear: 'chart.scale.linear',
    log: 'chart.scale.log',
    percent: 'chart.scale.percent',
    indexed: 'chart.scale.indexed',
};

export function parseScaleMode(value: unknown): ScaleMode {
    return typeof value === 'string' && (SCALE_MODES as readonly string[]).includes(value)
        ? (value as ScaleMode)
        : 'linear';
}

export const SCALE_MODE_KEY = 'openstock:chart-scale';

/** The Renko box is an absolute price step, so it is stored and edited as a number. */
export function parseRenkoBox(value: unknown): number | undefined {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : undefined;
}

export const RENKO_BOX_KEY = 'openstock:chart-renko-box';

/** How far the price must retrace before a Kagi line turns, as a fraction. */
export function parseKagiReversal(value: unknown): number | undefined {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) && number > 0 && number < 1 ? number : undefined;
}

export const KAGI_KEY = 'openstock:chart-kagi';

export function readKagiReversal(storage: Readable): number | undefined {
    try {
        return parseKagiReversal(storage.getItem(KAGI_KEY));
    } catch {
        return undefined;
    }
}

export function writeKagiReversal(storage: Pick<Storage, 'setItem' | 'removeItem'>, value: number | undefined): void {
    try {
        if (value == null) storage.removeItem(KAGI_KEY);
        else storage.setItem(KAGI_KEY, String(value));
    } catch {
        /* private mode: the reversal still applies for this visit */
    }
}

export const INVERT_KEY = 'openstock:chart-invert';

export function parseInvert(value: unknown): boolean {
    return value === '1' || value === 'true' || value === true;
}

export function readInvert(storage: Readable): boolean {
    try {
        return parseInvert(storage.getItem(INVERT_KEY));
    } catch {
        return false;
    }
}

export function writeInvert(storage: Writable, on: boolean): void {
    try {
        storage.setItem(INVERT_KEY, on ? '1' : '0');
    } catch {
        /* private mode: the flip still applies for this visit */
    }
}

export function readRenkoBox(storage: Readable): number | undefined {
    try {
        return parseRenkoBox(storage.getItem(RENKO_BOX_KEY));
    } catch {
        return undefined;
    }
}

export function writeRenkoBox(storage: Pick<Storage, 'setItem' | 'removeItem'>, box: number | undefined): void {
    try {
        if (box == null) storage.removeItem(RENKO_BOX_KEY);
        else storage.setItem(RENKO_BOX_KEY, String(box));
    } catch {
        /* private mode: the box still applies for this visit */
    }
}

export function readScaleMode(storage: Readable): ScaleMode {
    try {
        return parseScaleMode(storage.getItem(SCALE_MODE_KEY));
    } catch {
        return 'linear';
    }
}

export function writeScaleMode(storage: Writable, mode: ScaleMode): void {
    try {
        storage.setItem(SCALE_MODE_KEY, mode);
    } catch {
        /* private mode: the scale still applies for this visit */
    }
}

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
 * Renko bricks: a new brick prints only when the price moves a whole box from the last brick's
 * close, so time falls away and the chart becomes a pure record of direction. The width defaults to
 * half a percent of the first close, rounded to two decimals, because the box is a choice the chart
 * makes until the trader is offered one.
 *
 * Bricks keep the time of the bar that printed them; when one bar prints several, each extra brick
 * is stamped one second later, so the times stay strictly increasing (the chart library's rule) and
 * every brick is still traceable to its bar.
 */
export function renko(candles: readonly Candle[], box?: number): Candle[] {
    if (candles.length === 0) return [];
    const size = box && box > 0 ? box : Math.max(0.01, Number((candles[0].close * 0.005).toFixed(2)));
    const bricks: Candle[] = [];
    let base = candles[0].close;
    let stamp = candles[0].time;

    const push = (from: number, to: number, time: number, volume: number) => {
        bricks.push({
            time: bricks.length === 0 ? time : Math.max(time, bricks[bricks.length - 1].time + 1),
            open: from,
            high: Math.max(from, to),
            low: Math.min(from, to),
            close: to,
            volume,
        });
        base = to;
        stamp = bricks[bricks.length - 1].time;
    };

    for (const candle of candles) {
        // A gap can print several bricks at once: keep going while the price is a whole box away.
        while (candle.close >= base + size) push(base, Number((base + size).toFixed(4)), candle.time, candle.volume);
        while (candle.close <= base - size) push(base, Number((base - size).toFixed(4)), candle.time, candle.volume);
        stamp = Math.max(stamp, candle.time);
    }
    return bricks;
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

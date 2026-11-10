import {
    adx,
    atr,
    bollinger,
    ema,
    macd,
    obv,
    rsi,
    sma,
    vwap,
    type Series,
} from '@/lib/chart/indicators';
import type { Candle } from '@/lib/market/yahoo-candles';

// One study over the same bars the chart has. Pure and shared by the route and its tests; the
// indicator maths itself stays in lib/chart/indicators.ts so the API can never disagree with a pane.

export const API_INDICATORS = ['sma', 'ema', 'rsi', 'macd', 'bollinger', 'atr', 'adx', 'obv', 'vwap'] as const;
export type ApiIndicator = (typeof API_INDICATORS)[number];

export const isApiIndicator = (value: unknown): value is ApiIndicator =>
    typeof value === 'string' && (API_INDICATORS as readonly string[]).includes(value);

export type IndicatorSpec = {
    indicator: ApiIndicator;
    period: number;
    fast: number;
    slow: number;
    signal: number;
    stdDev: number;
};

export type IndicatorPoint = { t: number } & Record<string, number | null>;

export type IndicatorResult = {
    indicator: ApiIndicator;
    params: Record<string, number>;
    points: IndicatorPoint[];
};

/** Drop leading warm-up points, keep interior nulls, and never emit a point that has no value. */
const pointsFrom = (candles: readonly Candle[], seriesByKey: Record<string, Series>): IndicatorPoint[] => {
    const keys = Object.keys(seriesByKey);
    const length = Math.max(0, ...keys.map((key) => seriesByKey[key].length));
    let first = length;
    for (let index = 0; index < length; index += 1) {
        if (keys.some((key) => Number.isFinite(seriesByKey[key][index]))) {
            first = index;
            break;
        }
    }
    const points: IndicatorPoint[] = [];
    for (let index = first; index < length; index += 1) {
        const candle = candles[index];
        if (!candle) continue;
        const point: IndicatorPoint = { t: candle.time };
        let hasValue = false;
        for (const key of keys) {
            const value = seriesByKey[key][index];
            point[key] = Number.isFinite(value) ? (value as number) : null;
            if (Number.isFinite(value)) hasValue = true;
        }
        if (hasValue) points.push(point);
    }
    return points;
};

export function computeIndicator(candles: readonly Candle[], spec: IndicatorSpec): IndicatorResult {
    const closes = candles.map((candle) => candle.close);
    const period = spec.period;

    switch (spec.indicator) {
        case 'sma':
            return { indicator: 'sma', params: { period }, points: pointsFrom(candles, { value: sma(closes, period) }) };
        case 'ema':
            return { indicator: 'ema', params: { period }, points: pointsFrom(candles, { value: ema(closes, period) }) };
        case 'rsi':
            return { indicator: 'rsi', params: { period }, points: pointsFrom(candles, { value: rsi(closes, period) }) };
        case 'macd': {
            const result = macd(closes, spec.fast, spec.slow, spec.signal);
            return {
                indicator: 'macd',
                params: { fast: spec.fast, slow: spec.slow, signal: spec.signal },
                points: pointsFrom(candles, {
                    macd: result.macd,
                    signal: result.signal,
                    histogram: result.histogram,
                }),
            };
        }
        case 'bollinger': {
            const result = bollinger(closes, period, spec.stdDev);
            return {
                indicator: 'bollinger',
                params: { period, stdDev: spec.stdDev },
                points: pointsFrom(candles, {
                    upper: result.upper,
                    middle: result.middle,
                    lower: result.lower,
                }),
            };
        }
        case 'atr':
            return { indicator: 'atr', params: { period }, points: pointsFrom(candles, { value: atr(candles, period) }) };
        case 'adx': {
            const result = adx(candles, period);
            return {
                indicator: 'adx',
                params: { period },
                points: pointsFrom(candles, {
                    adx: result.adx,
                    plusDi: result.plusDi,
                    minusDi: result.minusDi,
                }),
            };
        }
        case 'obv':
            return {
                indicator: 'obv',
                params: {},
                points: pointsFrom(candles, {
                    value: obv(candles.map((candle) => ({ close: candle.close, volume: candle.volume }))),
                }),
            };
        case 'vwap':
            return { indicator: 'vwap', params: {}, points: pointsFrom(candles, { value: vwap(candles) }) };
    }
}

/** The bars a study needs before its first reading, so a short series is refused honestly. */
export const minimumBars = (spec: IndicatorSpec): number =>
    spec.indicator === 'macd'
        ? spec.slow + spec.signal
        : spec.indicator === 'bollinger'
            ? spec.period
            : spec.indicator === 'obv' || spec.indicator === 'vwap'
                ? 2
                : spec.period + 1;

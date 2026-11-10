// Compare: plot a symbol against others as percent change from the first bar of the shared range,
// so a Saudi stock and a US stock can be read on the same axis. Pure and IO-free.

import { yahooCandleSymbol, type Candle } from '@/lib/market/yahoo-candles';

export type ComparePoint = { time: number; value: number };

/** How many symbols can be compared at once (besides the one being charted). */
export const COMPARE_LIMIT = 3;

// A plain US ticker has no exchange suffix, which the chart's own resolver rejects; compare accepts it.
const PLAIN_TICKER = /^[A-Z]{1,6}(\.[A-Z]{1,2})?$/;

/**
 * Resolves a comparison symbol to the Yahoo form. Suffixed symbols (2222.SR, 0700.HK) use the chart
 * resolver; a plain ticker (AAPL) is accepted as-is; anything else is rejected.
 */
export function compareYahooSymbol(input: string): string | null {
    const upper = (input || '').trim().toUpperCase();
    if (!upper) return null;
    const direct = yahooCandleSymbol(upper);
    if (direct) return direct;
    return PLAIN_TICKER.test(upper) ? upper : null;
}

/**
 * Percent change from the first usable close at or after `from`, so every series is measured from
 * the same date when symbols carry different amounts of history. Points before `from` are dropped.
 */
export function percentSeries(candles: Candle[], from = -Infinity): ComparePoint[] {
    const window = candles.filter((candle) => candle.time >= from);
    const first = window.find((candle) => Number.isFinite(candle.close) && candle.close > 0)?.close;
    if (!first) return [];
    return window.map((candle) => ({ time: candle.time, value: (candle.close / first - 1) * 100 }));
}

/** The latest percent change of a series, or null when it cannot be computed. */
export function latestChange(candles: Candle[], from = -Infinity): number | null {
    const points = percentSeries(candles, from);
    return points.length === 0 ? null : points[points.length - 1].value;
}

/** Cleans a list of compare inputs: keeps valid, drops the charted symbol, de-dupes, caps at the limit. */
export function normalizeCompareInputs(inputs: string[], self: string): string[] {
    const selfUpper = (self || '').trim().toUpperCase();
    const out: string[] = [];
    for (const input of inputs) {
        const symbol = compareYahooSymbol(input);
        if (!symbol || symbol === selfUpper) continue;
        if (!out.includes(symbol)) out.push(symbol);
        if (out.length >= COMPARE_LIMIT) break;
    }
    return out;
}

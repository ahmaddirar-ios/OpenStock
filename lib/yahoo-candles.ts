// Candles for exchanges TradingView will not license in embeds (TADAWUL, LSE, HKEX, TSE, …).
// Yahoo prices those symbols for us already, so the chart reads from the same place the quotes do.
// Pure functions, covered by tests; the network call lives in lib/actions/yahoo-candles.actions.ts.

import { normalizeYahooSymbol } from '@/lib/yahoo';

export type Candle = {
    /** Seconds since the epoch, the unit lightweight-charts wants. */
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

export type CandleSet = {
    candles: Candle[];
    currency: string;
};

// Yahoo uses the same exchange suffix the app's symbols already carry (2222.SR, VOD.L, 0700.HK,
// 7203.T), so a symbol needs no translation — but only a symbol that has one is worth asking for.
// The TADAWUL: form the dashboard uses is normalised through the shared helper first.
const SUFFIXED_SYMBOL = /^[A-Z0-9][A-Z0-9.&-]{0,20}\.[A-Z]{1,4}$/;

export function yahooCandleSymbol(symbol: string): string | null {
    const upper = (symbol || '').trim().toUpperCase();
    const tadawul = normalizeYahooSymbol(upper);
    if (tadawul) return tadawul;
    return SUFFIXED_SYMBOL.test(upper) ? upper : null;
}

// Yahoo only accepts certain range/interval pairs; keeping them here means the interface can never
// ask for a combination Yahoo rejects (1m is limited to a week, intraday to months).
export const CANDLE_INTERVALS = [
    { id: '1m', range: '5d' },
    { id: '5m', range: '1mo' },
    { id: '15m', range: '1mo' },
    { id: '60m', range: '3mo' },
    { id: '1d', range: '6mo' },
    { id: '1wk', range: '2y' },
] as const;

export type CandleInterval = (typeof CANDLE_INTERVALS)[number];
export const DEFAULT_CANDLE_INTERVAL = '1d';

/** The interval a request asked for, falling back to the daily one. */
export const intervalById = (id: string): CandleInterval =>
    CANDLE_INTERVALS.find((interval) => interval.id === id) ?? CANDLE_INTERVALS[4];

type YahooChartJson = {
    chart?: {
        result?: Array<{
            meta?: { currency?: string };
            timestamp?: number[];
            indicators?: {
                quote?: Array<{
                    open?: (number | null)[];
                    high?: (number | null)[];
                    low?: (number | null)[];
                    close?: (number | null)[];
                    volume?: (number | null)[];
                }>;
            };
        }>;
    };
};

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * A /v8/finance/chart response as candles. Yahoo pads closed hours and holidays with nulls, and the
 * arrays are parallel, so a bar is kept only when it has a full OHLC; its volume defaults to zero.
 * Bars come back oldest first, which is the order a chart draws them in.
 */
export function candlesFromChart(json: unknown): CandleSet | null {
    const result = (json as YahooChartJson)?.chart?.result?.[0];
    const times = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    if (!result || times.length === 0 || !quote) return null;

    const candles: Candle[] = [];
    for (let i = 0; i < times.length; i += 1) {
        const { open, high, low, close, volume } = {
            open: quote.open?.[i],
            high: quote.high?.[i],
            low: quote.low?.[i],
            close: quote.close?.[i],
            volume: quote.volume?.[i],
        };
        if (!finite(times[i]) || !finite(open) || !finite(high) || !finite(low) || !finite(close)) continue;
        candles.push({ time: times[i], open, high, low, close, volume: finite(volume) ? volume : 0 });
    }
    if (candles.length === 0) return null;

    // Yahoo occasionally repeats a timestamp; a chart wants each time exactly once.
    const unique = candles.filter((candle, i) => i === 0 || candle.time > candles[i - 1].time);
    return { candles: unique, currency: result.meta?.currency || '' };
}

import type { Candle, CandleSet } from '@/lib/market/yahoo-candles';
import type { YahooLiveQuote } from '@/lib/market/yahoo';

// Turning the app's internal shapes into the API's compact ones. Pure, so tests pin the contract
// without a network call or a Mongo connection.

export type ApiBar = { t: number; o: number; h: number; l: number; c: number; v: number };

const price = (value: number): number => Number(value.toFixed(6));

export const serializeBar = (candle: Candle): ApiBar => ({
    t: candle.time,
    o: price(candle.open),
    h: price(candle.high),
    l: price(candle.low),
    c: price(candle.close),
    v: Math.round(candle.volume),
});

/**
 * The candle payload. `limit` trims the tail *after* the fetch, so the newest bars — the ones a
 * script is usually after — are the ones kept.
 */
export function serializeCandles(set: CandleSet, limit = 0): {
    currency: string;
    previousClose?: number;
    candles: ApiBar[];
} {
    const bars = set.candles.map(serializeBar);
    return {
        currency: set.currency,
        ...(Number.isFinite(set.previousClose) ? { previousClose: set.previousClose } : {}),
        candles: limit > 0 ? bars.slice(-limit) : bars,
    };
}

export type ApiQuote = {
    price: number;
    change: number;
    changePercent: number;
    time?: number;
    name?: string;
    currency?: string;
};

export const serializeQuote = (quote: YahooLiveQuote): ApiQuote => ({
    price: price(quote.c),
    change: price(quote.d),
    changePercent: price(quote.dp),
    ...(Number.isFinite(quote.t) ? { time: quote.t } : {}),
    ...(quote.name ? { name: quote.name } : {}),
    ...(quote.currency ? { currency: quote.currency } : {}),
});

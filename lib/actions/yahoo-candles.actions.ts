'use server';

import { aggregateCandles, candlesFromChart, intervalById, yahooCandleSymbol, type CandleSet } from '@/lib/yahoo-candles';
import { compareYahooSymbol } from '@/lib/compare';

// Candles from Yahoo Finance for the exchanges TradingView will not embed — the same free, keyless
// source lib/actions/yahoo.actions.ts already uses for Saudi quotes. One call per symbol and
// interval behind a one-minute cache, so a page of charts costs a handful of requests.
// A bar size Yahoo does not price (2h, 4h) is requested as hours and folded here, so the client only
// ever deals with the interval it asked for.
async function fetchCandles(yahooSymbol: string, intervalId: string): Promise<CandleSet | null> {
    const { id, request, aggregate } = intervalById(intervalId);
    const { interval, range } = request;

    try {
        const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 60 } },
        );
        if (!res.ok) return null;
        const set = candlesFromChart(await res.json());
        if (!set) {
            console.error('Yahoo returned no candles for', yahooSymbol, id);
            return null;
        }
        return { ...set, candles: aggregateCandles(set.candles, aggregate ?? 1) };
    } catch (error) {
        console.error('Yahoo candles error', yahooSymbol, id, error);
        return null;
    }
}

export async function getYahooCandles(symbol: string, intervalId: string): Promise<CandleSet | null> {
    const yahooSymbol = yahooCandleSymbol(symbol);
    if (!yahooSymbol) return null;
    return fetchCandles(yahooSymbol, intervalId);
}

/**
 * Candles for a chart pane: a plain US ticker (AAPL) is accepted as well as a suffixed listing
 * (2222.SR), which is what the grid's symbol field hands over. Everything else is the same call.
 */
export async function getSymbolCandles(symbol: string, intervalId: string): Promise<CandleSet | null> {
    const yahooSymbol = compareYahooSymbol(symbol);
    if (!yahooSymbol) return null;
    return fetchCandles(yahooSymbol, intervalId);
}

/** Candles for a comparison symbol: plain US tickers are accepted too, not only suffixed ones. */
export async function getCompareCandles(symbol: string, intervalId: string): Promise<CandleSet | null> {
    return getSymbolCandles(symbol, intervalId);
}

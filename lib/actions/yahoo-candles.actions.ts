'use server';

import { aggregateCandles, candlesFromChart, intervalById, yahooCandleSymbol, type CandleSet } from '@/lib/yahoo-candles';

// Candles from Yahoo Finance for the exchanges TradingView will not embed — the same free, keyless
// source lib/actions/yahoo.actions.ts already uses for Saudi quotes. One call per symbol and
// interval behind a one-minute cache, so a page of charts costs a handful of requests.
// A bar size Yahoo does not price (2h, 4h) is requested as hours and folded here, so the client only
// ever deals with the interval it asked for.
export async function getYahooCandles(symbol: string, intervalId: string): Promise<CandleSet | null> {
    const yahooSymbol = yahooCandleSymbol(symbol);
    if (!yahooSymbol) return null;
    const { id, request, aggregate } = intervalById(intervalId);
    const { interval, range } = request;

    try {
        const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 60 } },
        );
        if (!res.ok) return null;
        const set = candlesFromChart(await res.json());
        if (!set) console.error('Yahoo returned no candles for', yahooSymbol, id);
        if (!set) return null;
        return { ...set, candles: aggregateCandles(set.candles, aggregate ?? 1) };
    } catch (error) {
        console.error('Yahoo candles error', yahooSymbol, id, error);
        return null;
    }
}

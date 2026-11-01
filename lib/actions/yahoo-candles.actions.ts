'use server';

import { candlesFromChart, intervalById, yahooCandleSymbol, type CandleSet } from '@/lib/yahoo-candles';

// Candles from Yahoo Finance for the exchanges TradingView will not embed — the same free, keyless
// source lib/actions/yahoo.actions.ts already uses for Saudi quotes. One call per symbol and
// interval behind a one-minute cache, so a page of charts costs a handful of requests.
export async function getYahooCandles(symbol: string, intervalId: string): Promise<CandleSet | null> {
    const yahooSymbol = yahooCandleSymbol(symbol);
    if (!yahooSymbol) return null;
    const { id, range } = intervalById(intervalId);

    try {
        const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${id}&range=${range}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 60 } },
        );
        if (!res.ok) return null;
        const set = candlesFromChart(await res.json());
        if (!set) console.error('Yahoo returned no candles for', yahooSymbol, id);
        return set;
    } catch (error) {
        console.error('Yahoo candles error', yahooSymbol, id, error);
        return null;
    }
}

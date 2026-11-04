'use server';

import { dailyQuoteFromChart, liveQuoteFromChart, normalizeYahooSymbol, type YahooDailyQuote, type YahooLiveQuote } from '@/lib/yahoo';
import { quoteTtlSeconds } from '@/lib/market-data';

const yahooHeaders = { 'User-Agent': 'Mozilla/5.0' };

// Daily Tadawul quotes from Yahoo Finance (free, no key, covers .SR), keyed by the symbol passed in.
// One chart call per symbol (no batch endpoint without login) behind a shared 5-minute cache,
// so the Saudi dashboard costs ~17 requests every 5 minutes, not per user.
export async function getYahooDailyQuotes(symbols: string[]): Promise<Record<string, YahooDailyQuote>> {
    const entries = await Promise.all(
        symbols.map(async (symbol) => {
            const yahooSymbol = normalizeYahooSymbol(symbol);
            if (!yahooSymbol) return [symbol, null] as const;
            try {
                const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`, {
                    headers: yahooHeaders,
                    next: { revalidate: 300 },
                });
                if (!res.ok) return [symbol, null] as const;
                return [symbol, dailyQuoteFromChart(await res.json())] as const;
            } catch (e) {
                console.error('Yahoo daily quote error', symbol, e);
                return [symbol, null] as const;
            }
        }),
    );
    return Object.fromEntries(entries.filter(([, q]) => q)) as Record<string, YahooDailyQuote>;
}

/**
 * Tadawul quotes for on-screen prices, in the shape /api/quotes already speaks.
 *
 * Yahoo's free feed is ~15 minutes behind the exchange, but it keeps moving through the session,
 * so a page that polls during Riyadh hours is never further behind than the source itself.
 * One minute while the session runs, five once it shuts.
 */
export async function getYahooQuotes(symbols: string[]): Promise<Record<string, YahooLiveQuote>> {
    if (symbols.length === 0) return {};
    const revalidate = quoteTtlSeconds(symbols);
    const entries = await Promise.all(
        symbols.map(async (symbol) => {
            const yahooSymbol = normalizeYahooSymbol(symbol);
            if (!yahooSymbol) return [symbol, null] as const;
            try {
                const res = await fetch(
                    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d`,
                    { headers: yahooHeaders, next: { revalidate } },
                );
                if (!res.ok) return [symbol, null] as const;
                return [symbol, liveQuoteFromChart(await res.json())] as const;
            } catch (e) {
                console.error('Yahoo live quote error', symbol, e);
                return [symbol, null] as const;
            }
        }),
    );
    return Object.fromEntries(entries.filter(([, q]) => q)) as Record<string, YahooLiveQuote>;
}

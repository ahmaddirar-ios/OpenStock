// Tadawul quotes in bulk, for the screener and the market page.
//
// Yahoo answers one symbol per request, which is 388 requests for the Saudi market and a 429 storm
// when the market is busy (measured 2026-11-04). TradingView's public scanner answers the same
// question for up to ~200 tickers in one call, with the sector, market cap and P/E that Yahoo's
// free chart endpoint never returns. Both feeds are ~15 minutes behind the exchange; the label the
// UI prints is the promise, not the transport.

import { quoteTtlSeconds } from '@/lib/market-data';

export type SaudiQuote = {
    symbol: string;        // app form: 2222.SR
    name: string;
    sector: string;
    price: number;
    changePercent: number;
    changeAbs: number;
    volume: number;
    marketCap: number;
    peRatio: number | null;
};

const SCANNER_URL = 'https://scanner.tradingview.com/global/scan';
const COLUMNS = ['close', 'change', 'change_abs', 'volume', 'market_cap_basic', 'price_earnings_ttm', 'sector', 'description'];
const MAX_PER_REQUEST = 200;
const CONCURRENCY = 2;

/** `2222.SR` -> `TADAWUL:2222`; anything else -> null. */
export function scannerTicker(symbol: string): string | null {
    const match = /^(\d{4})\.SR$/i.exec((symbol || '').trim());
    return match ? `TADAWUL:${match[1]}` : null;
}

type ScannerRow = { s: string; d: (number | string | null)[] };

/**
 * One scanner row -> the quote the app speaks. Returns null when the row cannot be priced: a
 * suspended company comes back with a null close, and a zero price is not a price.
 */
export function saudiQuoteFromRow(row: ScannerRow): SaudiQuote | null {
    const [close, change, changeAbs, volume, marketCap, pe, sector, name] = row.d ?? [];
    const ticker = /^TADAWUL:(\d+)$/.exec(row.s ?? '')?.[1];
    if (!ticker) return null;
    const price = typeof close === 'number' ? close : Number(close);
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
        symbol: `${ticker}.SR`,
        name: typeof name === 'string' ? name : `${ticker}.SR`,
        sector: typeof sector === 'string' ? sector : '',
        price,
        changePercent: typeof change === 'number' ? change : 0,
        changeAbs: typeof changeAbs === 'number' ? changeAbs : 0,
        volume: typeof volume === 'number' ? volume : 0,
        marketCap: typeof marketCap === 'number' ? marketCap : 0,
        peRatio: typeof pe === 'number' && Number.isFinite(pe) ? pe : null,
    };
}

async function scanBatch(tickers: string[]): Promise<SaudiQuote[]> {
    try {
        const res = await fetch(SCANNER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            body: JSON.stringify({ symbols: { tickers }, columns: COLUMNS }),
            // The feed itself is 15 minutes behind; one minute of caching costs nothing and keeps
            // a page that polls from turning into traffic.
            next: { revalidate: 60 },
        });
        if (!res.ok) {
            console.error('TradingView scanner failed', res.status);
            return [];
        }
        const json = (await res.json()) as { data?: ScannerRow[] };
        return (json.data ?? []).map(saudiQuoteFromRow).filter((q): q is SaudiQuote => q !== null);
    } catch (error) {
        console.error('TradingView scanner error', error);
        return [];
    }
}

/**
 * Quotes for as many Tadawul listings as asked for, keyed by the app symbol. Requests are batched
 * 200 at a time and never overlap more than two at once, so a market page costs two calls, not 388.
 */
export async function fetchSaudiQuotes(symbols: string[]): Promise<Record<string, SaudiQuote>> {
    const wanted = [...new Set(symbols.map((s) => s.trim().toUpperCase()))];
    const pairs = wanted
        .map((symbol) => ({ symbol, ticker: scannerTicker(symbol) }))
        .filter((p): p is { symbol: string; ticker: string } => p.ticker !== null);
    if (pairs.length === 0) return {};

    const chunks: { symbol: string; ticker: string }[][] = [];
    for (let i = 0; i < pairs.length; i += MAX_PER_REQUEST) chunks.push(pairs.slice(i, i + MAX_PER_REQUEST));

    const out: Record<string, SaudiQuote> = {};
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const group = chunks.slice(i, i + CONCURRENCY);
        const results = await Promise.all(group.map((chunk) => scanBatch(chunk.map((p) => p.ticker))));
        for (const quotes of results) for (const quote of quotes) out[quote.symbol] = quote;
    }
    return out;
}

/** How long the caller may keep what it got: the same session-aware TTL the rest of the app uses. */
export const saudiQuoteTtl = (symbols: string[], now = new Date()) => quoteTtlSeconds(symbols, now);

export type SaudiIndexQuote = { price: number; changePercent: number; changeAbs: number; name: string };

/** TASI itself. The scanner answers indices on the same endpoint, and the name comes back localized. */
export async function fetchSaudiIndex(): Promise<SaudiIndexQuote | null> {
    try {
        const res = await fetch(SCANNER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            body: JSON.stringify({ symbols: { tickers: ['TADAWUL:TASI'] }, columns: ['close', 'change', 'change_abs', 'description'] }),
            next: { revalidate: 60 },
        });
        if (!res.ok) return null;
        const json = (await res.json()) as { data?: { s: string; d: (number | string | null)[] }[] };
        const row = json.data?.[0];
        const [close, change, changeAbs, name] = row?.d ?? [];
        const price = typeof close === 'number' ? close : Number(close);
        if (!Number.isFinite(price) || price <= 0) return null;
        return {
            price,
            changePercent: typeof change === 'number' ? change : 0,
            changeAbs: typeof changeAbs === 'number' ? changeAbs : 0,
            name: typeof name === 'string' ? name : 'TASI',
        };
    } catch (error) {
        console.error('TradingView index error', error);
        return null;
    }
}

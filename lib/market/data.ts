// How fresh market numbers are. Safe to import from client components (no keys here).
//
//   cached   (default) Public instance: quotes refresh while a session is running
//                       and fall back to hourly once it is shut.
//   realtime           OpenStock Cloud or self-hosted with your own Finnhub keys:
//                       quotes refresh every 15s while a session is running.
import { newYorkNow, sessionOf } from '@/lib/market/session';
import { getMarket, isMarketOpen } from '@/lib/market/markets';

export type DataMode = 'cached' | 'realtime';

const dataMode = process.env.NEXT_PUBLIC_ROVEX_DATA_MODE ?? process.env.NEXT_PUBLIC_OPENSTOCK_DATA_MODE;
export const DATA_MODE: DataMode = dataMode === 'realtime' ? 'realtime' : 'cached';

export const isRealtime = DATA_MODE === 'realtime';

/** Binance pairs, which neither exchange calendar applies to: crypto trades every hour of the week. */
export const isCryptoQuote = (symbol: string) => (symbol || '').trim().toUpperCase().startsWith('BINANCE:');

/** Tadawul listings, priced from Yahoo Finance (Finnhub's free plan returns 403 for them). */
export const isSaudiQuote = (symbol: string) => {
    const upper = (symbol || '').trim().toUpperCase();
    return /^\d+\.SR$/.test(upper) || /^TADAWUL:[A-Z0-9]+$/.test(upper);
};

const TADAWUL = getMarket('sa');

// A price is only worth a request while the tape is moving. Sunday to Thursday 10:00-15:00 in
// Riyadh for Saudi listings, and crypto never closes at all.
export function isQuoteLive(symbols: string[] = [], now = new Date()): boolean {
    if (symbols.some(isCryptoQuote)) return true;
    const saudi = symbols.filter(isSaudiQuote);
    if (saudi.length > 0 && isMarketOpen(TADAWUL, now)) return true;
    // A page showing nothing but Tadawul listings lives on the Riyadh calendar, not the New York one.
    if (saudi.length > 0 && saudi.length === symbols.length) return false;
    const { weekday, minutes } = newYorkNow(now);
    const phase = sessionOf(weekday, minutes).phase;
    return phase === 'pre' || phase === 'open' || phase === 'after';
}

// While a session runs: 15s on Cloud/self-hosted, 60s on the shared free key.
// When it is shut: 5 minutes for realtime (alerts still need a number), an hour otherwise.
const LIVE_TTL = isRealtime ? 15 : 60;
const CLOSED_TTL = isRealtime ? 300 : 3600;
// Yahoo has no key and no quota, but its Tadawul feed only moves every 15 minutes anyway.
const SAUDI_LIVE_TTL = 60;
const SAUDI_CLOSED_TTL = 300;
// Finnhub free allows 60 calls a minute and the key is shared by every visitor,
// so a long watchlist gets a slower TTL instead of a 429 storm.
const REQUESTS_PER_MINUTE = 50;

export function quoteTtlSeconds(symbols: string[] = [], now = new Date()): number {
    const live = isQuoteLive(symbols, now);
    const priced = symbols.filter((s) => !isSaudiQuote(s));
    if (symbols.length > 0 && priced.length === 0) return live ? SAUDI_LIVE_TTL : SAUDI_CLOSED_TTL;
    if (!live) return CLOSED_TTL;
    const quotaFloor = Math.ceil((priced.length * 60) / REQUESTS_PER_MINUTE);
    return Math.max(LIVE_TTL, quotaFloor);
}

// Email price alerts are an OpenStock Cloud feature: on in realtime mode (Cloud or self-hosted), off on the free site.
export const alertsEnabled = isRealtime;

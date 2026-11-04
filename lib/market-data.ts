// How fresh market numbers are. Safe to import from client components (no keys here).
//
//   cached   (default) Public instance: quotes refresh while a session is running
//                       and fall back to hourly once it is shut.
//   realtime           OpenStock Cloud or self-hosted with your own Finnhub keys:
//                       quotes refresh every 15s while a session is running.
import { newYorkNow, sessionOf } from '@/lib/market-session';

export type DataMode = 'cached' | 'realtime';

const dataMode = process.env.NEXT_PUBLIC_ROVEX_DATA_MODE ?? process.env.NEXT_PUBLIC_OPENSTOCK_DATA_MODE;
export const DATA_MODE: DataMode = dataMode === 'realtime' ? 'realtime' : 'cached';

export const isRealtime = DATA_MODE === 'realtime';

// A price is only worth a request while the tape is moving. Crypto never closes,
// so a Binance pair stays live on a Sunday night just like it is at 10:00 ET.
export function isQuoteLive(symbols: string[] = [], now = new Date()): boolean {
    if (symbols.some((s) => s.trim().toUpperCase().startsWith('BINANCE:'))) return true;
    const { weekday, minutes } = newYorkNow(now);
    const phase = sessionOf(weekday, minutes).phase;
    return phase === 'pre' || phase === 'open' || phase === 'after';
}

// While a session runs: 15s on Cloud/self-hosted, 60s on the shared free key.
// When it is shut: 5 minutes for realtime (alerts still need a number), an hour otherwise.
const LIVE_TTL = isRealtime ? 15 : 60;
const CLOSED_TTL = isRealtime ? 300 : 3600;
// Finnhub free allows 60 calls a minute and the key is shared by every visitor,
// so a long watchlist gets a slower TTL instead of a 429 storm.
const REQUESTS_PER_MINUTE = 50;

export function quoteTtlSeconds(symbols: string[] = [], now = new Date()): number {
    if (!isQuoteLive(symbols, now)) return CLOSED_TTL;
    const quotaFloor = Math.ceil((symbols.length * 60) / REQUESTS_PER_MINUTE);
    return Math.max(LIVE_TTL, quotaFloor);
}

// Email price alerts are an OpenStock Cloud feature: on in realtime mode (Cloud or self-hosted), off on the free site.
export const alertsEnabled = isRealtime;

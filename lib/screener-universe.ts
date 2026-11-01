// The screener's universe: every company we can name, from the two static directories we already
// keep — the 518 US index members (with GICS sector, exchange and index membership) and the 388
// Tadawul listings (with Arabic names). Metadata is static, so filtering and sorting never wait on
// a network call; only the prices are fetched, cached, and stored in the screener snapshot.

import { US_TICKERS } from '@/lib/seo/tickers';
import { SAUDI_SYMBOLS } from '@/lib/saudi-symbols';

export type ScreenerMarket = 'us' | 'sa';

export type UniverseEntry = {
    symbol: string;
    name: string;
    /** Arabic trading name when we have one (Tadawul). */
    nameAr?: string;
    market: ScreenerMarket;
    /** GICS sector for US listings; empty for Tadawul until a sector source is added. */
    sector: string;
    exchange: string;
    indexes: string[];
};

export const SCREENER_UNIVERSE: UniverseEntry[] = [
    ...US_TICKERS.map((ticker) => ({
        symbol: ticker.symbol,
        name: ticker.name,
        market: 'us' as const,
        sector: ticker.sector,
        exchange: ticker.exchange,
        indexes: ticker.indexes,
    })),
    ...SAUDI_SYMBOLS.map((company) => ({
        symbol: company.symbol,
        name: company.name,
        nameAr: company.nameAr,
        market: 'sa' as const,
        sector: '',
        exchange: 'TADAWUL',
        indexes: [],
    })),
];

export const SCREENER_TOTAL = SCREENER_UNIVERSE.length;

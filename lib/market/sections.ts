// The world outside Tadawul: the regional and global indices, the commodities, the currencies and
// the two coins — a small, curated board rather than everything the scanner can answer.
//
// Curated on purpose. A list we chose is a list we can rank, name in Arabic and keep honest; a
// search over "every index" would put a hundred rows on the page and none of them about the market
// a Saudi trader actually reads in the morning. Every ticker here was verified against the scanner
// (2026-11-05): 30 of 30 answer in a single request, which is why the whole board costs one call.
//
// The feed is the same fifteen-minute-delayed one the rest of the app uses, and the page says so.

import type { ScannerRow } from '@/lib/market/tradingview-scanner';
import type { StringKey } from '@/lib/i18n';

export type SectionId = 'gulf' | 'world' | 'commodities' | 'currencies' | 'crypto';

export type SectionRow = {
    /** The scanner's own symbol, the only thing the endpoint is asked for. */
    ticker: string;
    /** The short label printed beside the name: SPX, EUR/USD, BTC. */
    short: string;
    nameKey: StringKey;
    /** The market the row belongs to, printed in the table's first column: US, Saudi, Dubai… */
    marketKey: StringKey;
};

export type MarketSection = {
    id: SectionId;
    nameKey: StringKey;
    rows: readonly SectionRow[];
};

export const MARKET_SECTIONS: readonly MarketSection[] = [
    {
        id: 'gulf',
        nameKey: 'world.section.gulf',
        rows: [
            { ticker: 'TADAWUL:TASI', short: 'TASI', nameKey: 'world.name.tasi', marketKey: 'world.market.saudi' },
            { ticker: 'DFM:DFMGI', short: 'DFMGI', nameKey: 'world.name.dubai', marketKey: 'world.market.dubai' },
            { ticker: 'ADX:FADGI', short: 'FADGI', nameKey: 'world.name.abudhabi', marketKey: 'world.market.abudhabi' },
            { ticker: 'KSE:BKP', short: 'BKP', nameKey: 'world.name.kuwait', marketKey: 'world.market.kuwait' },
            { ticker: 'EGX:EGX30', short: 'EGX30', nameKey: 'world.name.egypt', marketKey: 'world.market.egypt' },
        ],
    },
    {
        id: 'world',
        nameKey: 'world.section.world',
        rows: [
            { ticker: 'SP:SPX', short: 'SPX', nameKey: 'world.name.spx', marketKey: 'world.market.us' },
            { ticker: 'NASDAQ:NDX', short: 'NDX', nameKey: 'world.name.ndx', marketKey: 'world.market.us' },
            { ticker: 'DJ:DJI', short: 'DJI', nameKey: 'world.name.dji', marketKey: 'world.market.us' },
            { ticker: 'XETR:DAX', short: 'DAX', nameKey: 'world.name.dax', marketKey: 'world.market.germany' },
            { ticker: 'KRX:KOSPI', short: 'KOSPI', nameKey: 'world.name.kospi', marketKey: 'world.market.korea' },
            { ticker: 'HSI:HSI', short: 'HSI', nameKey: 'world.name.hsi', marketKey: 'world.market.hongkong' },
            { ticker: 'SSE:000001', short: 'SSEC', nameKey: 'world.name.shanghai', marketKey: 'world.market.china' },
            { ticker: 'TVC:VIX', short: 'VIX', nameKey: 'world.name.vix', marketKey: 'world.market.us' },
            { ticker: 'TVC:US10Y', short: 'US10Y', nameKey: 'world.name.us10y', marketKey: 'world.market.us' },
            { ticker: 'TVC:DXY', short: 'DXY', nameKey: 'world.name.dxy', marketKey: 'world.market.us' },
        ],
    },
    {
        id: 'commodities',
        nameKey: 'world.section.commodities',
        rows: [
            { ticker: 'COMEX:GC1!', short: 'GC', nameKey: 'world.name.gold', marketKey: 'world.market.commodities' },
            { ticker: 'COMEX:SI1!', short: 'SI', nameKey: 'world.name.silver', marketKey: 'world.market.commodities' },
            { ticker: 'COMEX:HG1!', short: 'HG', nameKey: 'world.name.copper', marketKey: 'world.market.commodities' },
            { ticker: 'ICEEUR:BRN1!', short: 'BRN', nameKey: 'world.name.brent', marketKey: 'world.market.commodities' },
            { ticker: 'NYMEX:CL1!', short: 'CL', nameKey: 'world.name.wti', marketKey: 'world.market.commodities' },
            { ticker: 'NYMEX:NG1!', short: 'NG', nameKey: 'world.name.gas', marketKey: 'world.market.commodities' },
            { ticker: 'CBOT:ZC1!', short: 'ZC', nameKey: 'world.name.corn', marketKey: 'world.market.commodities' },
        ],
    },
    {
        id: 'currencies',
        nameKey: 'world.section.currencies',
        rows: [
            { ticker: 'FX_IDC:EURUSD', short: 'EUR/USD', nameKey: 'world.name.eurusd', marketKey: 'world.market.currencies' },
            { ticker: 'FX_IDC:GBPUSD', short: 'GBP/USD', nameKey: 'world.name.gbpusd', marketKey: 'world.market.currencies' },
            { ticker: 'FX_IDC:USDJPY', short: 'USD/JPY', nameKey: 'world.name.usdjpy', marketKey: 'world.market.currencies' },
            { ticker: 'FX_IDC:USDSAR', short: 'USD/SAR', nameKey: 'world.name.usdsar', marketKey: 'world.market.currencies' },
            { ticker: 'FX_IDC:USDJOD', short: 'USD/JOD', nameKey: 'world.name.usdjod', marketKey: 'world.market.currencies' },
            { ticker: 'FX_IDC:USDTRY', short: 'USD/TRY', nameKey: 'world.name.usdtry', marketKey: 'world.market.currencies' },
        ],
    },
    {
        id: 'crypto',
        nameKey: 'world.section.crypto',
        rows: [
            { ticker: 'BITSTAMP:BTCUSD', short: 'BTC', nameKey: 'world.name.btc', marketKey: 'world.market.crypto' },
            { ticker: 'BITSTAMP:ETHUSD', short: 'ETH', nameKey: 'world.name.eth', marketKey: 'world.market.crypto' },
        ],
    },
];

/** Every ticker the board asks the scanner for, in one request. */
export const WORLD_TICKERS: readonly string[] = MARKET_SECTIONS.flatMap((section) => section.rows.map((row) => row.ticker));

const BY_TICKER = new Map(MARKET_SECTIONS.flatMap((section) => section.rows.map((row) => [row.ticker, row] as const)));

export type WorldQuote = {
    ticker: string;
    short: string;
    nameKey: StringKey;
    marketKey: StringKey;
    price: number;
    changePercent: number;
    changeAbs: number;
};

/**
 * One scanner row -> the quote the board prints. A row we did not ask for, or one the feed answered
 * with no price (a market that has not opened yet), comes back null rather than as a zero.
 */
export function worldQuoteFromRow(row: ScannerRow): WorldQuote | null {
    const known = BY_TICKER.get(row.s);
    if (!known) return null;
    const [close, change, changeAbs] = row.d ?? [];
    const price = typeof close === 'number' ? close : Number(close);
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
        ticker: row.s,
        short: known.short,
        nameKey: known.nameKey,
        marketKey: known.marketKey,
        price,
        changePercent: typeof change === 'number' ? change : 0,
        changeAbs: typeof changeAbs === 'number' ? changeAbs : 0,
    };
}

/** The rows of one section, in the order they were declared, with the ones the feed missed left out. */
export function sectionQuotes(section: MarketSection, quotes: readonly WorldQuote[]): WorldQuote[] {
    const byTicker = new Map(quotes.map((quote) => [quote.ticker, quote]));
    return section.rows.map((row) => byTicker.get(row.ticker)).filter((quote): quote is WorldQuote => quote !== undefined);
}

// Dividends and results dates for Tadawul listings.
//
// Yahoo's free endpoints do not answer these for Saudi companies (the quoteSummary modules need a
// crumb and the chart carries only what a range covers). The TradingView scanner does, on the same
// batch endpoint the quotes already use, so a stock page costs one extra call for one company.
// Coverage measured 2026-11-04 over 15 Tadawul names: yield 12/15, ex-date 12/15, last results
// 15/15, next results 14/15, payout ratio 15/15.

import { scannerTicker, scanRows, type ScannerRow } from '@/lib/tradingview-scanner';

export type SaudiFundamentals = {
    symbol: string;
    /** Percent, as the exchange quotes it: 5.19 means 5.19%. */
    dividendYield: number | null;
    /** Epoch ms, or null when the company has never paid or the feed is silent. */
    exDividendDate: number | null;
    dividendPayDate: number | null;
    /** Share of profit paid out, in percent. Negative means the payout outran the profit. */
    payoutRatio: number | null;
    lastEarningsDate: number | null;
    nextEarningsDate: number | null;
    peRatio: number | null;
};

/** Asked for in this order; `fundamentalsFromRow` reads the values positionally. */
export const FUNDAMENTAL_COLUMNS = [
    'dividends_yield',
    'dividend_ex_date_recent',
    'dividend_payment_date_recent',
    'dividend_payout_ratio_ttm',
    'earnings_release_date',
    'earnings_release_next_date',
    'price_earnings_ttm',
];

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** The scanner speaks epoch seconds; the app speaks milliseconds, like every other timestamp in it. */
const stamp = (value: unknown): number | null => {
    const seconds = num(value);
    return seconds && seconds > 0 ? Math.round(seconds * 1000) : null;
};

export function fundamentalsFromRow(row: ScannerRow): SaudiFundamentals | null {
    const ticker = /^TADAWUL:(\d+)$/.exec(row.s ?? '')?.[1];
    if (!ticker) return null;
    const [yieldPct, exDate, payDate, payout, lastEarnings, nextEarnings, pe] = row.d ?? [];
    return {
        symbol: `${ticker}.SR`,
        dividendYield: num(yieldPct),
        exDividendDate: stamp(exDate),
        dividendPayDate: stamp(payDate),
        payoutRatio: num(payout),
        lastEarningsDate: stamp(lastEarnings),
        nextEarningsDate: stamp(nextEarnings),
        peRatio: num(pe),
    };
}

/** Whole days from `now` until `timestamp`: negative once the date has passed. */
export function daysUntil(timestamp: number | null, now = Date.now()): number | null {
    if (timestamp === null) return null;
    const startOfDay = (ms: number) => Math.floor(ms / 86_400_000);
    return startOfDay(timestamp) - startOfDay(now);
}

/** Fundamentals for the Tadawul symbols asked for, keyed by the app symbol. */
export async function fetchSaudiFundamentals(symbols: string[]): Promise<Record<string, SaudiFundamentals>> {
    const tickers = [...new Set(symbols.map(scannerTicker).filter((t): t is string => t !== null))];
    if (tickers.length === 0) return {};
    // Dividends change on the company's own calendar, not the tick: a six-hour cache is plenty.
    const rows = await scanRows(tickers, FUNDAMENTAL_COLUMNS, 21_600);
    const out: Record<string, SaudiFundamentals> = {};
    for (const row of rows) {
        const fundamentals = fundamentalsFromRow(row);
        if (fundamentals) out[fundamentals.symbol] = fundamentals;
    }
    return out;
}

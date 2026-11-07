// The bars the chart is drawing, as a spreadsheet reads them. Pure, so the header, the row order
// and the timestamp format are pinned by tests rather than by a browser download.

import type { Candle } from '@/lib/yahoo-candles';

/** The columns every export carries, in the order TradingView's own export uses. */
export const CSV_HEADER = 'time,open,high,low,close,volume';

/** A bar's time as an ISO-8601 UTC instant: unambiguous in any spreadsheet locale. */
export const csvTime = (seconds: number): string => new Date(seconds * 1000).toISOString();

/** The whole series as CSV, oldest bar first, with the bar's own numbers untouched. */
export function candlesToCsv(candles: readonly Candle[]): string {
    const rows = candles.map((bar) =>
        [csvTime(bar.time), bar.open, bar.high, bar.low, bar.close, bar.volume].join(','),
    );
    return [CSV_HEADER, ...rows].join('\n');
}

/** A file name that survives every exchange suffix and interval id. */
export function csvFileName(symbol: string, intervalId: string): string {
    return `openstock-${symbol.replace(/[^A-Za-z0-9]/g, '')}-${intervalId}.csv`;
}

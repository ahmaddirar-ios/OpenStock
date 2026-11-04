import { SAUDI_SYMBOLS } from '@/lib/saudi-symbols';
import { isNomuSymbol, buildSaudiBoard, type SaudiBoard } from '@/lib/saudi-market';
import { fetchSaudiIndex, fetchSaudiQuotes, type SaudiIndexQuote } from '@/lib/tradingview-scanner';

export type SaudiBoardPayload = SaudiBoard & {
    index: SaudiIndexQuote | null;
    /** Epoch ms the prices were read. The page prints it, because the feed is 15 minutes behind. */
    asOf: number;
};

/** The main market only: Nomu sits on its own board and would skew every ranking. */
export const MAIN_MARKET_SYMBOLS = SAUDI_SYMBOLS.filter((entry) => !isNomuSymbol(entry.symbol)).map((entry) => entry.symbol);

/**
 * One pass over the main market plus the index. Two scanner calls in total, cached for a minute,
 * so the page can poll through a session without becoming traffic.
 */
export async function loadSaudiBoard(limit = 6): Promise<SaudiBoardPayload> {
    const [quotes, index] = await Promise.all([fetchSaudiQuotes(MAIN_MARKET_SYMBOLS), fetchSaudiIndex()]);
    return { ...buildSaudiBoard(Object.values(quotes), limit), index, asOf: Date.now() };
}

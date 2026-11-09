'use server';

// One batched server action for the scanner. It only does I/O: the scan itself is pure and lives in
// lib/pattern-scan.ts, so this file's exports are two types and one async function — a `'use server'`
// module may not export anything else.

import { scanCandles, pivotOptionsFor, SCAN_BATCH } from '@/lib/pattern-scan';
import { getStrategyCandles } from '@/lib/actions/yahoo-candles.actions';
import type { PatternHit, PatternId } from '@/lib/patterns';
import type { AutoSensitivity } from '@/lib/auto-count';

export type SymbolPatternHits = { symbol: string; hits: PatternHit[] };

/** `answered` is how many symbols the feed replied for; `requested` is the list after the cap. */
export type PatternScanResult = { results: SymbolPatternHits[]; answered: number; requested: number };

/**
 * Runs the pattern scan over a slice of symbols. The client walks the market in batches of
 * `SCAN_BATCH`, and this caps a single call at twice that so one request cannot ask for everything.
 * It never throws: a symbol that will not answer is a row with no hits, and the page reports the
 * honest `answered` count instead of pretending the whole list was checked.
 */
export async function scanPatternBatch(
    symbols: string[],
    patterns: PatternId[],
    intervalId: string,
    sensitivity: AutoSensitivity,
): Promise<PatternScanResult> {
    const list = Array.isArray(symbols)
        ? symbols.filter((symbol) => typeof symbol === 'string' && symbol).slice(0, SCAN_BATCH * 2)
        : [];
    if (list.length === 0) return { results: [], answered: 0, requested: 0 };

    const options = pivotOptionsFor(sensitivity);
    let answered = 0;

    const results = await Promise.all(
        list.map(async (symbol): Promise<SymbolPatternHits> => {
            try {
                const set = await getStrategyCandles(symbol, intervalId);
                if (!set || set.candles.length === 0) return { symbol, hits: [] };
                answered += 1;
                return { symbol, hits: scanCandles(set.candles, patterns, options) };
            } catch {
                // One symbol that will not answer is not a reason to fail the whole scan.
                return { symbol, hits: [] };
            }
        }),
    );

    return { results, answered, requested: list.length };
}
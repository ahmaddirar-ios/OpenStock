'use server';

// One server action behind the auto analysis panel: it only does I/O. The read itself is pure and
// lives in lib/chart/auto-analysis.ts, so a `'use server'` module exports two types and one async
// function — nothing else is allowed here.
//
// The candles come from the same cache the chart's own request fills, so opening the panel on a pane
// that is already drawn is a lookup, not a second trip to the feed.

import { analyzeCandles, type AutoAnalysis } from '@/lib/chart/auto-analysis';
import { getSymbolCandles } from '@/lib/actions/yahoo-candles.actions';

export type { AutoAnalysis };

/** The read for one symbol on one timeframe, or null when the feed has nothing to say. */
export async function analyzeSymbol(symbol: string, intervalId: string): Promise<AutoAnalysis | null> {
    const name = typeof symbol === 'string' ? symbol.trim() : '';
    if (!name) return null;
    try {
        const set = await getSymbolCandles(name, intervalId);
        if (!set || set.candles.length === 0) return null;
        return analyzeCandles(set.candles);
    } catch {
        // A feed that will not answer is a panel with nothing in it, not a broken chart.
        return null;
    }
}

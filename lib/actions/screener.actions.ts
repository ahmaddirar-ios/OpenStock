'use server';

import { connectToDatabase } from '@/database/mongoose';
import { ScreenerRowModel } from '@/database/models/screener.model';
import { refreshScreenerSlice, SCREENER_BATCH_LIMIT, type RefreshProgress } from '@/lib/screener-refresh';
import type { ScreenerRow } from '@/lib/screener';
import { screenFormulaMatch, SCREEN_BATCH, type FormulaScreenHit } from '@/lib/formula/screener';
import { getStrategyCandles } from '@/lib/actions/yahoo-candles.actions';
import { checkFormula } from '@/lib/formula/formula';

export async function getScreenerRows(): Promise<ScreenerRow[]> {
    try {
        await connectToDatabase();
        const rows = await ScreenerRowModel.find({}, { _id: 0, __v: 0 }).lean();
        return rows.map((row) => ({
            symbol: row.symbol,
            name: row.name,
            nameAr: row.nameAr,
            market: row.market,
            sector: row.sector,
            exchange: row.exchange,
            indexes: row.indexes ?? [],
            price: row.price,
            changePercent: row.changePercent,
            currency: row.currency,
            marketCap: row.marketCap ?? 0,
            peRatio: row.peRatio ?? null,
            valueTraded: row.valueTraded ?? 0,
            updatedAt: row.updatedAt ? new Date(row.updatedAt).getTime() : 0,
        }));
    } catch (error) {
        console.error('Error reading screener rows:', error);
        return [];
    }
}

/** Refreshes one batch of the universe; the page walks the universe by calling this in a loop. */
export async function refreshScreenerBatch(offset = 0, limit = SCREENER_BATCH_LIMIT): Promise<RefreshProgress> {
    return refreshScreenerSlice(offset, limit);
}

/**
 * Runs one formula over a slice of symbols and says which of them it is true for on the newest bar.
 *
 * This is the only screener filter that has to fetch: the snapshot holds a price and a change, not
 * a history. The candles come from the same cached call the strategy lab uses, so a second screen
 * over the same names is nearly free, and the client walks the list in batches so one slow symbol
 * cannot hold up the rest.
 */
export async function screenFormula(symbols: string[], expression: string, intervalId = '1d'): Promise<FormulaScreenHit[]> {
    const text = typeof expression === 'string' ? expression.trim() : '';
    if (!text || !checkFormula(text).ok) return [];
    const list = Array.isArray(symbols) ? symbols.filter((symbol) => typeof symbol === 'string' && symbol).slice(0, SCREEN_BATCH * 2) : [];
    if (list.length === 0) return [];

    const hits = await Promise.all(
        list.map(async (symbol): Promise<FormulaScreenHit> => {
            try {
                const set = await getStrategyCandles(symbol, intervalId);
                if (!set || set.candles.length === 0) return { symbol, match: false, value: null };
                const { match, value } = screenFormulaMatch(set.candles, text);
                return { symbol, match, value };
            } catch {
                // One symbol that will not answer is not a reason to fail the whole screen.
                return { symbol, match: false, value: null };
            }
        }),
    );
    return hits;
}

'use server';

import { connectToDatabase } from '@/database/mongoose';
import { ScreenerRowModel } from '@/database/models/screener.model';
import { refreshScreenerSlice, SCREENER_BATCH_LIMIT, type RefreshProgress } from '@/lib/screener-refresh';
import type { ScreenerRow } from '@/lib/screener';

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

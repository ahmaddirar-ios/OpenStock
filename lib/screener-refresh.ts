import { connectToDatabase } from '@/database/mongoose';
import { ScreenerRowModel } from '@/database/models/screener.model';
import { SCREENER_UNIVERSE, SCREENER_TOTAL } from '@/lib/screener-universe';
import { dailyQuoteFromChart } from '@/lib/yahoo';

// Shared by the server action (which the page calls to build/refresh) and the Inngest cron, so a
// refresh behaves the same whether a person asked for it or the schedule did.

export const SCREENER_BATCH_LIMIT = 24;
const CONCURRENCY = 6;

export type RefreshProgress = { processed: number; next: number; total: number; priced: number };

async function fetchQuote(symbol: string): Promise<{ price: number; changePercent: number; currency: string } | null> {
    try {
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            next: { revalidate: 300 },
        });
        if (!res.ok) return null;
        const quote = dailyQuoteFromChart(await res.json());
        if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) return null;
        return { price: quote.price, changePercent: quote.changePercent, currency: quote.currency };
    } catch (error) {
        console.error('Screener quote error', symbol, error);
        return null;
    }
}

/**
 * Refreshes one slice of the universe: fetches a price for each symbol and upserts the row (metadata
 * stays, prices update). Returns the offset to continue from, so callers walk the universe in chunks.
 */
export async function refreshScreenerSlice(offset = 0, limit = SCREENER_BATCH_LIMIT): Promise<RefreshProgress> {
    const start = Math.max(0, Math.floor(offset));
    const size = Math.max(1, Math.min(SCREENER_BATCH_LIMIT, Math.floor(limit)));
    const slice = SCREENER_UNIVERSE.slice(start, start + size);
    const now = new Date();

    try {
        await connectToDatabase();
    } catch (error) {
        console.error('Screener refresh: no database', error);
        return { processed: 0, next: start, total: SCREENER_TOTAL, priced: 0 };
    }

    let priced = 0;
    for (let i = 0; i < slice.length; i += CONCURRENCY) {
        const group = slice.slice(i, i + CONCURRENCY);
        const quotes = await Promise.all(group.map((entry) => fetchQuote(entry.symbol)));
        const operations = group.map((entry, index) => {
            const quote = quotes[index];
            if (quote) priced += 1;
            return {
                updateOne: {
                    filter: { symbol: entry.symbol },
                    update: {
                        $set: {
                            name: entry.name,
                            nameAr: entry.nameAr,
                            market: entry.market,
                            sector: entry.sector,
                            exchange: entry.exchange,
                            indexes: entry.indexes,
                            ...(quote ? { price: quote.price, changePercent: quote.changePercent, currency: quote.currency } : {}),
                            updatedAt: now,
                        },
                    },
                    upsert: true,
                },
            };
        });
        await ScreenerRowModel.bulkWrite(operations, { ordered: false });
    }

    return { processed: slice.length, next: start + slice.length, total: SCREENER_TOTAL, priced };
}

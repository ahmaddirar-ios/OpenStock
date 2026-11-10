'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';
import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/lib/better-auth/auth';
import {
    countByGroup,
    normalizeGroup,
    normalizeNote,
    normalizeTags,
    parseWatchlistCsv,
    MAX_IMPORT_ROWS,
} from '@/lib/watchlist';

// Tickers as Finnhub writes them (AAPL, BRK.B, RELIANCE.NS, M&M.NS, 0700.HK, BINANCE:BTCUSDT). Server actions take
// untrusted input, and every symbol here becomes Finnhub calls on /watchlist and in the news digest.
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.&:-]{0,24}$/;
const MAX_WATCHLIST = 50;

// -- CRUD Operations --

export async function addToWatchlist(symbol: string, company: string) {
    const userId = await requireUserId();
    const ticker = String(symbol ?? '').trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(ticker)) throw new Error('Invalid symbol');
    const name = String(company ?? '').trim().slice(0, 120);
    try {
        await connectToDatabase();

        if (!(await Watchlist.exists({ userId, symbol: ticker })) && (await Watchlist.countDocuments({ userId })) >= MAX_WATCHLIST) {
            return { error: `Your watchlist is full (${MAX_WATCHLIST} stocks). Remove one to add another.` };
        }

        // Upsert to avoid duplicates/errors if it already exists
        const newItem = await Watchlist.findOneAndUpdate(
            { userId, symbol: ticker },
            {
                userId,
                symbol: ticker,
                company: name,
                addedAt: new Date()
            },
            { upsert: true, new: true }
        );

        revalidatePath('/', 'layout'); // sidebar lists the watchlist on every page
        return JSON.parse(JSON.stringify(newItem));
    } catch (error) {
        console.error('Error adding to watchlist:', error);
        throw new Error('Failed to add to watchlist');
    }
}

export async function removeFromWatchlist(symbol: string) {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        await Watchlist.findOneAndDelete({ userId, symbol: symbol.toUpperCase() });
        revalidatePath('/', 'layout'); // sidebar lists the watchlist on every page
        return { success: true };
    } catch (error) {
        console.error('Error removing from watchlist:', error);
        throw new Error('Failed to remove from watchlist');
    }
}

export async function getUserWatchlist() {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        const watchlist = await Watchlist.find({ userId }).sort({ addedAt: -1 });
        return JSON.parse(JSON.stringify(watchlist));
    } catch (error) {
        console.error('Error fetching watchlist:', error);
        return [];
    }
}

// Check if a symbol is in the user's watchlist
export async function isStockInWatchlist(symbol: string) {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        const item = await Watchlist.findOne({ userId, symbol: symbol.toUpperCase() });
        return !!item;
    } catch (error) {
        console.error('Error checking watchlist status:', error);
        return false;
    }
}

// -- Organisation ------------------------------------------------------------------------------
//
// A watchlist is a list of symbols; a *useful* watchlist is a few named lists with a reason written
// next to each name. These actions carry the group, the note and the tags, and the CSV that moves
// them between devices.

export type WatchlistItemRecord = {
    symbol: string;
    company: string;
    group: string;
    note: string;
    tags: string[];
    addedAt: string;
};

export type WatchlistPatch = {
    group?: string;
    note?: string;
    tags?: string[] | string;
};

/** Updates the organisation fields of one symbol. The symbol itself is never changed here. */
export async function updateWatchlistItem(symbol: string, patch: WatchlistPatch) {
    const userId = await requireUserId();
    const ticker = String(symbol ?? '').trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(ticker)) return { error: 'invalidSymbol' };

    const update: Record<string, unknown> = {};
    if (patch.group !== undefined) update.group = normalizeGroup(patch.group);
    if (patch.note !== undefined) update.note = normalizeNote(patch.note);
    if (patch.tags !== undefined) update.tags = normalizeTags(patch.tags);
    if (Object.keys(update).length === 0) return { error: 'empty' };

    try {
        await connectToDatabase();
        const saved = await Watchlist.findOneAndUpdate({ userId, symbol: ticker }, { $set: update }, { new: true });
        if (!saved) return { error: 'notFound' };
        revalidatePath('/', 'layout');
        return JSON.parse(JSON.stringify(saved)) as WatchlistItemRecord;
    } catch (error) {
        console.error('Error updating watchlist item:', error);
        return { error: 'failed' };
    }
}

/** Every group the user has, with how many symbols each holds. */
export async function getWatchlistGroups(): Promise<{ group: string; count: number }[]> {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        const items = await Watchlist.find({ userId }).select('group').lean();
        return countByGroup(items as { group?: string }[]);
    } catch (error) {
        console.error('Error fetching watchlist groups:', error);
        return [];
    }
}

export type WatchlistImportResult =
    | { ok: true; imported: number; updated: number; skipped: number; errors: { line: number; message: string }[] }
    | { ok: false; reason: 'empty' | 'tooMany' | 'failed' };

/**
 * Imports a watchlist CSV. A symbol already on the list is updated rather than duplicated, so
 * re-importing a file after editing it in a spreadsheet is safe.
 */
export async function importWatchlistCsv(text: string): Promise<WatchlistImportResult> {
    const userId = await requireUserId();
    const parsed = parseWatchlistCsv(String(text ?? ''));
    if (parsed.items.length === 0 && parsed.errors.length === 0) return { ok: false, reason: 'empty' };
    if (parsed.items.length > MAX_IMPORT_ROWS) return { ok: false, reason: 'tooMany' };
    if (parsed.items.length === 0) {
        return { ok: true, imported: 0, updated: 0, skipped: parsed.errors.length, errors: parsed.errors };
    }

    try {
        await connectToDatabase();
        const existing = await Watchlist.find({ userId }).select('symbol').lean();
        const known = new Set(existing.map((item) => item.symbol));
        const room = Math.max(0, MAX_WATCHLIST - known.size);
        const fresh = parsed.items.filter((item) => !known.has(item.symbol));
        const accepted = fresh.slice(0, room);
        const updates = parsed.items.filter((item) => known.has(item.symbol));

        if (accepted.length > 0) {
            await Watchlist.insertMany(
                accepted.map((item) => ({
                    userId,
                    symbol: item.symbol,
                    company: item.company || item.symbol,
                    group: item.group,
                    note: item.note,
                    tags: item.tags,
                    addedAt: new Date(),
                }))
            );
        }

        for (const item of updates) {
            await Watchlist.updateOne(
                { userId, symbol: item.symbol },
                { $set: { group: item.group, note: item.note, tags: item.tags } }
            );
        }

        revalidatePath('/', 'layout');
        return {
            ok: true,
            imported: accepted.length,
            updated: updates.length,
            skipped: parsed.errors.length + (fresh.length - accepted.length),
            errors: parsed.errors,
        };
    } catch (error) {
        console.error('Error importing watchlist:', error);
        return { ok: false, reason: 'failed' };
    }
}

'use server';

import { connectToDatabase } from '@/database/mongoose';
import { StrategyModel } from '@/database/models/strategy.model';
import { requireUserId } from '@/lib/better-auth/auth';
import { MAX_SAVED_STRATEGIES, normalizeSavedStrategies, type SavedStrategy } from '@/lib/strategy/library-custom';

/**
 * The account's half of the custom-strategy shelf. The browser's localStorage stays the fast copy;
 * these actions are how a saved strategy follows the trader to another device. Signed out, every
 * call answers `unauthorized` and the studio keeps working locally.
 *
 * Server actions are public endpoints, so the user always comes from the session and a payload is
 * held to the same gate the loader uses.
 */

export type LoadedStrategies =
    | { ok: true; items: SavedStrategy[]; updatedAt: number | null }
    | { ok: false; reason: 'unauthorized' | 'failed' };

export type SavedStrategies = { ok: true; updatedAt: number } | { ok: false; reason: 'unauthorized' | 'invalid' | 'failed' };

export async function loadStrategies(): Promise<LoadedStrategies> {
    let userId: string;
    try {
        userId = await requireUserId();
    } catch {
        return { ok: false, reason: 'unauthorized' };
    }

    try {
        await connectToDatabase();
        const doc = await StrategyModel.findOne({ userId }).lean();
        if (!doc) return { ok: true, items: [], updatedAt: null };
        return {
            ok: true,
            items: normalizeSavedStrategies(doc.items),
            updatedAt: doc.updatedAt ? new Date(doc.updatedAt).getTime() : null,
        };
    } catch {
        return { ok: false, reason: 'failed' };
    }
}

/** Replaces the account's shelf with the payload, after the same validation the browser applies. */
export async function saveStrategies(items: unknown): Promise<SavedStrategies> {
    const clean = normalizeSavedStrategies(items);
    // An empty array is a legitimate save ("I deleted them all"); a payload that is not an array at
    // all is a broken caller, not a shelf to empty.
    if (!Array.isArray(items)) return { ok: false, reason: 'invalid' };
    if (items.length > 0 && clean.length === 0) return { ok: false, reason: 'invalid' };
    if (items.length > MAX_SAVED_STRATEGIES) return { ok: false, reason: 'invalid' };

    let userId: string;
    try {
        userId = await requireUserId();
    } catch {
        return { ok: false, reason: 'unauthorized' };
    }

    try {
        await connectToDatabase();
        const doc = await StrategyModel.findOneAndUpdate(
            { userId },
            { $set: { items: clean } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean();
        return { ok: true, updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).getTime() : Date.now() };
    } catch {
        return { ok: false, reason: 'failed' };
    }
}

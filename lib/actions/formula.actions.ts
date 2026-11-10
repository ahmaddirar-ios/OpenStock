'use server';

import { connectToDatabase } from '@/database/mongoose';
import { FormulaModel } from '@/database/models/formula.model';
import { requireUserId } from '@/lib/better-auth/auth';
import { MAX_SAVED_FORMULAS, normalizeSavedFormulas, type SavedFormula } from '@/lib/formula/library';

/**
 * The account's half of the formula shelf: read the formulas a trader saved, and write them back.
 * The browser's localStorage stays the fast, always-available copy — these actions are how it follows
 * the trader to another device. Signed out, every call answers `unauthorized` and the studio simply
 * keeps working locally.
 *
 * Server actions are public endpoints, so the user is always taken from the session and never from
 * the arguments, and a payload is held to the same gate the loader uses.
 */

export type LoadedFormulas =
    | { ok: true; items: SavedFormula[]; updatedAt: number | null }
    | { ok: false; reason: 'unauthorized' | 'failed' };

export type SavedFormulas = { ok: true; updatedAt: number } | { ok: false; reason: 'unauthorized' | 'invalid' | 'failed' };

export async function loadFormulas(): Promise<LoadedFormulas> {
    let userId: string;
    try {
        userId = await requireUserId();
    } catch {
        return { ok: false, reason: 'unauthorized' };
    }

    try {
        await connectToDatabase();
        const doc = await FormulaModel.findOne({ userId }).lean();
        if (!doc) return { ok: true, items: [], updatedAt: null };
        return {
            ok: true,
            items: normalizeSavedFormulas(doc.items),
            updatedAt: doc.updatedAt ? new Date(doc.updatedAt).getTime() : null,
        };
    } catch {
        return { ok: false, reason: 'failed' };
    }
}

/** Replaces the account's shelf with the payload, after the same validation the browser applies. */
export async function saveFormulas(items: unknown): Promise<SavedFormulas> {
    const clean = normalizeSavedFormulas(items);
    // An empty array is a legitimate save ("I deleted them all"), but a payload that is not an array
    // at all is a broken caller, not a shelf to empty.
    if (!Array.isArray(items)) return { ok: false, reason: 'invalid' };
    if (items.length > 0 && clean.length === 0) return { ok: false, reason: 'invalid' };
    if (items.length > MAX_SAVED_FORMULAS) return { ok: false, reason: 'invalid' };

    let userId: string;
    try {
        userId = await requireUserId();
    } catch {
        return { ok: false, reason: 'unauthorized' };
    }

    try {
        await connectToDatabase();
        const doc = await FormulaModel.findOneAndUpdate(
            { userId },
            { $set: { items: clean } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean();
        return { ok: true, updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).getTime() : Date.now() };
    } catch {
        return { ok: false, reason: 'failed' };
    }
}

'use server';

import { connectToDatabase } from '@/database/mongoose';
import { ChartSetupModel } from '@/database/models/chart-setup.model';
import { requireUserId } from '@/lib/better-auth/auth';
import { SETUP_VERSION, parseChartSetup, type ChartSetup } from '@/lib/chart/setup';
import { accessFor, filterSetupByFeatures } from '@/lib/entitlements-server';

/**
 * The account's half of the chart setup: read the drawings and studies a trader has on a symbol, and
 * write them back. The browser's localStorage stays the fast, always-available copy — these actions are
 * how it follows the trader to another device. Signed out, every call answers `unauthorized` and the
 * chart simply keeps working locally.
 *
 * Server actions are public endpoints, so the user is always taken from the session and never from the
 * arguments, and a payload is held to the same parser the loader uses.
 */

const MAX_SYMBOL = 24;

const cleanSymbol = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const symbol = value.trim().toUpperCase();
    return symbol.length === 0 || symbol.length > MAX_SYMBOL ? null : symbol;
};

export type LoadedChartSetup =
    | { ok: true; setup: ChartSetup | null; updatedAt: number | null }
    | { ok: false; reason: 'unauthorized' | 'failed' };

export type SavedChartSetup = { ok: true; updatedAt: number } | { ok: false; reason: 'unauthorized' | 'invalid' | 'failed' };

/** The account's copy of a symbol's setup, or `setup: null` when nothing has been saved yet. */
export async function loadChartSetup(symbol: string): Promise<LoadedChartSetup> {
    const clean = cleanSymbol(symbol);
    if (!clean) return { ok: false, reason: 'failed' };

    let userId: string;
    try {
        userId = await requireUserId();
    } catch {
        return { ok: false, reason: 'unauthorized' };
    }

    try {
        await connectToDatabase();
        const doc = await ChartSetupModel.findOne({ userId, symbol: clean }).lean();
        if (!doc) return { ok: true, setup: null, updatedAt: null };
        // A row in a format this build does not know reads as nothing at all, and the next save replaces
        // it in the current format.
        const parsed = parseChartSetup({ v: doc.v, drawings: doc.drawings, studies: doc.studies });
        // A downgrade trims the stored setup: a locked tool must never render again, even from an old row.
        const access = await accessFor(userId);
        const setup = parsed ? filterSetupByFeatures(parsed, access.features) : null;
        return { ok: true, setup, updatedAt: doc.updatedAt ? new Date(doc.updatedAt).getTime() : null };
    } catch {
        return { ok: false, reason: 'failed' };
    }
}

/** Stores a symbol's setup as the account's copy. The payload is validated before it is written. */
export async function saveChartSetup(symbol: string, payload: unknown): Promise<SavedChartSetup> {
    const clean = cleanSymbol(symbol);
    if (!clean) return { ok: false, reason: 'invalid' };

    const setup = parseChartSetup(payload);
    if (!setup) return { ok: false, reason: 'invalid' };

    let userId: string;
    try {
        userId = await requireUserId();
    } catch {
        return { ok: false, reason: 'unauthorized' };
    }

    try {
        // Server actions are public endpoints: the plan is read here, never sent by the browser, and a
        // drawing or study outside it is dropped rather than written.
        const access = await accessFor(userId);
        const allowed = filterSetupByFeatures(setup, access.features);
        await connectToDatabase();
        const doc = await ChartSetupModel.findOneAndUpdate(
            { userId, symbol: clean },
            { $set: { v: SETUP_VERSION, drawings: allowed.drawings, studies: allowed.studies } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean();
        return { ok: true, updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).getTime() : Date.now() };
    } catch {
        return { ok: false, reason: 'failed' };
    }
}

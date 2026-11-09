// Feature flags, read where the product decides what to render.
//
// A flag is a row in `featureflags`; a missing row is the caller's fallback, so the code owns the
// default and the panel only overrides it. Reads are cached for the request, and a failed read
// falls back rather than taking a page down.

import { cache } from 'react';
import { connectToDatabase } from '@/database/mongoose';
import { FeatureFlag } from '@/database/models/feature-flag.model';

/** The flags the product actually reads. A key outside this list is a typo, not a feature. */
export const FLAG_KEYS = ['dashboard.board'] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

export const isFlagKey = (value: unknown): value is FlagKey =>
    typeof value === 'string' && (FLAG_KEYS as readonly string[]).includes(value);

/** Every flag row, keyed by name. Cached per request. */
export const loadFlags = cache(async (): Promise<Map<string, boolean>> => {
    try {
        await connectToDatabase();
        const rows = await FeatureFlag.find({}, { key: 1, enabled: 1 }).lean();
        return new Map(rows.map((row) => [row.key, Boolean(row.enabled)]));
    } catch {
        return new Map();
    }
});

/** Whether a flag is on. A missing row or a failed read answers `fallback`. */
export async function isFlagEnabled(key: FlagKey, fallback = true): Promise<boolean> {
    const flags = await loadFlags();
    return flags.get(key) ?? fallback;
}

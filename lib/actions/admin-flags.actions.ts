'use server';

// Feature flags: only `flag:manage` may read the management list or write a flag. The product reads
// them through `isFlagEnabled`, which falls back to the code's default when a row is missing.

import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/database/mongoose';
import { FeatureFlag } from '@/database/models/feature-flag.model';
import { requireCapability } from '@/lib/authz-server';
import { FLAG_DEFAULTS, FLAG_KEYS, isFlagKey, type FlagKey } from '@/lib/flags';

export type FlagRow = {
    key: FlagKey;
    enabled: boolean;
    description: string;
    updatedAt: string | null;
};

/** Every flag the product knows, with the stored value or the code's default. */
export async function listFlags(): Promise<FlagRow[]> {
    await requireCapability('flag:manage');
    await connectToDatabase();
    const rows = await FeatureFlag.find({ key: { $in: [...FLAG_KEYS] } }).lean();
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return FLAG_KEYS.map((key) => {
        const row = byKey.get(key);
        return {
            key,
            enabled: row ? Boolean(row.enabled) : FLAG_DEFAULTS[key],
            description: row?.description ?? '',
            updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
        };
    });
}

/** Flip one flag. The key must be one the product reads; the description is optional prose. */
export async function setFlag(key: unknown, enabled: unknown, description?: unknown): Promise<FlagRow> {
    await requireCapability('flag:manage');
    if (!isFlagKey(key)) throw new Error('Unknown flag');
    const on = enabled === true;
    const text = typeof description === 'string' ? description.trim().slice(0, 280) : undefined;

    await connectToDatabase();
    const update = text === undefined ? { $set: { enabled: on } } : { $set: { enabled: on, description: text } };
    const row = await FeatureFlag.findOneAndUpdate({ key }, update, { upsert: true, new: true }).lean();

    // The board lives on /dashboard; a flag change should be visible on the next visit.
    revalidatePath('/dashboard');
    return {
        key,
        enabled: Boolean(row?.enabled ?? on),
        description: row?.description ?? text ?? '',
        updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
}

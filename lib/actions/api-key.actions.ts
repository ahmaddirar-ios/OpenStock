'use server';

import { connectToDatabase } from '@/database/mongoose';
import { ApiKey } from '@/database/models/api-key.model';
import { requireUserId } from '@/lib/better-auth/auth';
import { requireFeature } from '@/lib/entitlements-server';
import { generateApiKey, type ApiKeyView } from '@/lib/api/keys';
import { MAX_ACTIVE_KEYS } from '@/lib/api/limits';

// A key belongs to one account and is managed by that account from the profile page. The secret is
// returned by `createApiKey` and by nothing else; every read here is secret-free.

const toView = (row: {
    _id: unknown;
    name?: string;
    prefix?: string;
    last4?: string;
    usageCount?: number;
    lastUsedAt?: Date | null;
    revokedAt?: Date | null;
    createdAt?: Date | null;
}): ApiKeyView => ({
    id: String(row._id),
    name: row.name ?? 'Untitled key',
    prefix: row.prefix ?? '',
    last4: row.last4 ?? '',
    usageCount: row.usageCount ?? 0,
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
    revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date(0).toISOString(),
});

/** The signed-in account's keys, newest first, including revoked ones (the list is the history). */
export async function listApiKeys(): Promise<ApiKeyView[]> {
    const userId = await requireUserId();
    await connectToDatabase();
    const rows = await ApiKey.find({ userId }).sort({ createdAt: -1 }).lean();
    return rows.map(toView);
}

/**
 * Mint a key. Returns the full secret once. The plan check is the feature gate, not the page: a
 * server action is a public endpoint and the profile UI is only a convenience.
 */
export async function createApiKey(name: string): Promise<{ key?: string; name?: string; error?: string }> {
    let userId: string;
    try {
        userId = (await requireFeature('api.rest')).userId;
    } catch {
        return { error: 'Your plan does not include API access.' };
    }

    const clean = String(name ?? '').trim().slice(0, 60) || 'Untitled key';
    try {
        await connectToDatabase();
        const active = await ApiKey.countDocuments({ userId, revokedAt: { $exists: false } });
        if (active >= MAX_ACTIVE_KEYS) {
            return { error: `You already have ${MAX_ACTIVE_KEYS} active keys. Revoke one first.` };
        }
        const generated = generateApiKey();
        await ApiKey.create({ userId, name: clean, ...generated });
        return { key: generated.key, name: clean };
    } catch (error) {
        console.error('Error creating API key:', error);
        return { error: 'Could not create the key. Try again.' };
    }
}

/** Revoke one of the caller's own keys. Revoking twice is not an error in spirit, but it is refused. */
export async function revokeApiKey(id: string): Promise<{ success?: true; error?: string }> {
    let userId: string;
    try {
        userId = (await requireFeature('api.rest')).userId;
    } catch {
        return { error: 'Your plan does not include API access.' };
    }
    if (!/^[a-fA-F0-9]{24}$/.test(String(id ?? ''))) return { error: 'Unknown key.' };
    try {
        await connectToDatabase();
        const result = await ApiKey.updateOne(
            { _id: id, userId, revokedAt: { $exists: false } },
            { $set: { revokedAt: new Date() } },
        );
        if (result.matchedCount === 0) return { error: 'Unknown key.' };
        return { success: true };
    } catch (error) {
        console.error('Error revoking API key:', error);
        return { error: 'Could not revoke the key. Try again.' };
    }
}

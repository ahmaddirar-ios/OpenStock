'use server';

import { connectToDatabase } from '@/database/mongoose';
import { PushSubscription } from '@/database/models/push-subscription.model';
import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/lib/better-auth/auth';
import { pushConfig, validateSubscription } from '@/lib/push';
import { sendToUser } from '@/lib/push-send';
import { tx, type Lang } from '@/lib/i18n';

// Server actions are public endpoints: every one of these is scoped by the session user, so a
// subscription id or endpoint from the client can never reach somebody else's device.

export type PushState = {
    /** Whether this deployment has VAPID keys at all. */
    configured: boolean;
    /** The public key the browser needs to subscribe; public by design. */
    publicKey: string | null;
    /** How many devices the signed-in user has. */
    devices: number;
};

export async function getPushState(): Promise<PushState> {
    const userId = await requireUserId();
    const config = pushConfig();
    try {
        await connectToDatabase();
        const devices = await PushSubscription.countDocuments({ userId });
        return { configured: config !== null, publicKey: config?.publicKey ?? null, devices };
    } catch (error) {
        console.error('Error reading push state:', error);
        return { configured: config !== null, publicKey: config?.publicKey ?? null, devices: 0 };
    }
}

/**
 * Stores what the browser handed over. The endpoint is unique, so the same device
 * re-subscribing updates its row (with the language it is reading in now) instead of piling up.
 */
export async function subscribeToPush(subscription: unknown, lang: string = 'en') {
    const userId = await requireUserId();
    const valid = validateSubscription(subscription);
    if (!valid) throw new Error('invalidSubscription');

    await connectToDatabase();
    await PushSubscription.findOneAndUpdate(
        { endpoint: valid.endpoint },
        { $set: { userId, keys: valid.keys, lang: lang === 'ar' ? 'ar' : 'en' } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    revalidatePath('/alerts');
    return { success: true };
}

/** Removes one device, and only one that belongs to the session user. */
export async function unsubscribeFromPush(endpoint: string) {
    const userId = await requireUserId();
    await connectToDatabase();
    await PushSubscription.deleteOne({ endpoint: String(endpoint ?? ''), userId });
    revalidatePath('/alerts');
    return { success: true };
}

/** Proves the channel end to end without waiting for a market move. */
export async function sendTestPush() {
    const userId = await requireUserId();
    const result = await sendToUser(userId, (lang) => {
        const reader = (lang === 'ar' ? 'ar' : 'en') as Lang;
        return {
            title: tx(reader, 'alerts.push.testTitle'),
            body: tx(reader, 'alerts.push.testBody'),
            url: '/alerts',
        };
    });
    return result;
}

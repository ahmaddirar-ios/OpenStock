import webpush from 'web-push';
import { connectToDatabase } from '@/database/mongoose';
import { PushSubscription } from '@/database/models/push-subscription.model';
import { pushConfig, type PushPayload } from '@/lib/push';

// The one place a push service is called. Everything here returns a result instead of throwing:
// a notification is a courtesy, and a dead push service must never fail a check, a cron run or a
// user's page.

export type PushResult = {
    sent: number;
    /** Endpoints the service said are gone (404/410), deleted here. */
    pruned: number;
    /** True when this deployment has no VAPID keys, so nothing was attempted. */
    unavailable: boolean;
};

/** Notifies every device the user has subscribed, each in the language it was subscribed in. */
export async function sendToUser(userId: string, build: (lang: string) => PushPayload): Promise<PushResult> {
    const config = pushConfig();
    if (!config) return { sent: 0, pruned: 0, unavailable: true };

    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

    await connectToDatabase();
    const rows = await PushSubscription.find({ userId }).lean();
    if (rows.length === 0) return { sent: 0, pruned: 0, unavailable: false };

    const gone: string[] = [];
    let sent = 0;

    await Promise.all(
        rows.map(async (row) => {
            try {
                await webpush.sendNotification(
                    { endpoint: row.endpoint, keys: row.keys },
                    JSON.stringify(build(row.lang || 'en')),
                    // A firing is news for an hour; after that the centre is the record.
                    { TTL: 3600 },
                );
                sent += 1;
            } catch (error) {
                const status = (error as { statusCode?: number }).statusCode;
                if (status === 404 || status === 410) {
                    gone.push(row.endpoint); // the device is gone for good
                    return;
                }
                console.error('Push failed', row.endpoint, status ?? error);
            }
        }),
    );

    if (gone.length > 0) await PushSubscription.deleteMany({ endpoint: { $in: gone } });
    return { sent, pruned: gone.length, unavailable: false };
}

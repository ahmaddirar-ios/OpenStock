import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Server actions are public endpoints: these tests pin that a device subscription is always
// tied to the signed-in user, that a malformed body never reaches the database, and that a
// deployment without VAPID keys says so instead of pretending to notify.

const requireUserId = vi.fn();
vi.mock('@/lib/better-auth/auth', () => ({ requireUserId: () => requireUserId() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/database/mongoose', () => ({ connectToDatabase: vi.fn().mockResolvedValue({}) }));

const findOneAndUpdate = vi.fn();
const deleteOne = vi.fn();
const countDocuments = vi.fn().mockResolvedValue(0);
vi.mock('@/database/models/push-subscription.model', () => ({
    PushSubscription: {
        findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
        deleteOne: (...args: unknown[]) => deleteOne(...args),
        countDocuments: (...args: unknown[]) => countDocuments(...args),
    },
}));

const sendToUser = vi.fn();
vi.mock('@/lib/push-send', () => ({ sendToUser: (...args: unknown[]) => sendToUser(...args) }));

import { getPushState, sendTestPush, subscribeToPush, unsubscribeFromPush } from '@/lib/actions/push.actions';

const KEYS = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'B'.repeat(87),
    VAPID_PRIVATE_KEY: 'p'.repeat(43),
    VAPID_SUBJECT: 'mailto:ahmad@example.com',
};

const device = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'B'.repeat(60), auth: 'a'.repeat(22) },
};

beforeEach(() => {
    vi.clearAllMocks();
    requireUserId.mockResolvedValue('user-123');
    findOneAndUpdate.mockResolvedValue({ _id: 'sub-1' });
    deleteOne.mockResolvedValue({ deletedCount: 1 });
    countDocuments.mockResolvedValue(0);
    sendToUser.mockResolvedValue({ sent: 1, pruned: 0, unavailable: false });
    for (const [key, value] of Object.entries(KEYS)) vi.stubEnv(key, value);
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('subscribeToPush', () => {
    it('stores the device for the session user, upserting by endpoint, with their language', async () => {
        await expect(subscribeToPush(device, 'ar')).resolves.toEqual({ success: true });
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { endpoint: device.endpoint },
            { $set: { userId: 'user-123', keys: device.keys, lang: 'ar' } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
    });

    it('refuses a malformed subscription so nothing unvalidated is stored', async () => {
        await expect(subscribeToPush({ endpoint: 'http://insecure.test/x', keys: { p256dh: 'x', auth: 'y' } })).rejects.toThrow('invalidSubscription');
        await expect(subscribeToPush(null)).rejects.toThrow('invalidSubscription');
        expect(findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects a signed-out call before touching the database', async () => {
        requireUserId.mockRejectedValue(new Error('Unauthorized'));
        await expect(subscribeToPush(device)).rejects.toThrow('Unauthorized');
        expect(findOneAndUpdate).not.toHaveBeenCalled();
    });
});

describe('unsubscribeFromPush', () => {
    it('deletes only a device that belongs to the session user', async () => {
        await expect(unsubscribeFromPush(device.endpoint)).resolves.toEqual({ success: true });
        expect(deleteOne).toHaveBeenCalledWith({ endpoint: device.endpoint, userId: 'user-123' });
    });

    it('cannot delete every device by sending an empty endpoint', async () => {
        await unsubscribeFromPush('');
        expect(deleteOne).toHaveBeenCalledWith({ endpoint: '', userId: 'user-123' });
    });
});

describe('getPushState', () => {
    it('reports the key the browser needs and how many devices the user has', async () => {
        countDocuments.mockResolvedValue(2);
        await expect(getPushState()).resolves.toEqual({
            configured: true,
            publicKey: KEYS.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
            devices: 2,
        });
        expect(countDocuments).toHaveBeenCalledWith({ userId: 'user-123' });
    });

    it('says it is unavailable, without throwing, when the deployment has no keys', async () => {
        vi.stubEnv('VAPID_PRIVATE_KEY', '');
        await expect(getPushState()).resolves.toEqual({ configured: false, publicKey: null, devices: 0 });
    });
});

describe('sendTestPush', () => {
    it('sends one payload to the session user only, written in each device’s language', async () => {
        const result = await sendTestPush();
        expect(sendToUser).toHaveBeenCalledTimes(1);
        const [userId, build] = sendToUser.mock.calls[0] as [string, (lang: string) => { title: string; url: string }];
        expect(userId).toBe('user-123');
        expect(build('en')).toMatchObject({ title: expect.stringContaining('test'), url: '/alerts' });
        expect(build('ar').title).toContain('تجربة');
        expect(result).toEqual({ sent: 1, pruned: 0, unavailable: false });
    });

    it('reports the unconfigured case instead of failing the page', async () => {
        sendToUser.mockResolvedValue({ sent: 0, pruned: 0, unavailable: true });
        await expect(sendTestPush()).resolves.toEqual({ sent: 0, pruned: 0, unavailable: true });
    });
});

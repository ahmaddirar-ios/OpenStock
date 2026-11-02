import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The sender is the only place a push service is called, and it must never throw: a
// notification is a courtesy, and a dead service cannot be allowed to fail a check.

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock('web-push', () => ({
    default: {
        sendNotification: (...args: unknown[]) => sendNotification(...args),
        setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
    },
}));

vi.mock('@/database/mongoose', () => ({ connectToDatabase: vi.fn().mockResolvedValue({}) }));

const find = vi.fn();
const deleteMany = vi.fn();
const lean = vi.fn();
vi.mock('@/database/models/push-subscription.model', () => ({
    PushSubscription: {
        find: (...args: unknown[]) => {
            find(...args);
            return { lean: (...rest: unknown[]) => lean(...rest) };
        },
        deleteMany: (...args: unknown[]) => deleteMany(...args),
    },
}));

import { sendToUser } from '@/lib/push-send';

const KEYS = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'B'.repeat(87),
    VAPID_PRIVATE_KEY: 'p'.repeat(43),
    VAPID_SUBJECT: 'mailto:ahmad@example.com',
};

const row = (endpoint: string, lang: string) => ({ userId: 'user-123', endpoint, keys: { p256dh: 'B'.repeat(60), auth: 'a'.repeat(22) }, lang });

const build = (lang: string) => ({ title: `title-${lang}`, body: `body-${lang}`, url: '/alerts' });

beforeEach(() => {
    vi.clearAllMocks();
    for (const [key, value] of Object.entries(KEYS)) vi.stubEnv(key, value);
    sendNotification.mockResolvedValue({ statusCode: 201 });
    deleteMany.mockResolvedValue({ deletedCount: 1 });
    lean.mockResolvedValue([]);
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('sendToUser', () => {
    it('does nothing, and says so, when the deployment has no keys', async () => {
        vi.stubEnv('VAPID_PRIVATE_KEY', '');
        await expect(sendToUser('user-123', build)).resolves.toEqual({ sent: 0, pruned: 0, unavailable: true });
        expect(sendNotification).not.toHaveBeenCalled();
        expect(find).not.toHaveBeenCalled();
    });

    it('does nothing when the user has no device', async () => {
        await expect(sendToUser('user-123', build)).resolves.toEqual({ sent: 0, pruned: 0, unavailable: false });
        expect(find).toHaveBeenCalledWith({ userId: 'user-123' });
        expect(sendNotification).not.toHaveBeenCalled();
    });

    it('notifies every device, each in the language it was subscribed in', async () => {
        lean.mockResolvedValue([row('https://push.test/laptop', 'en'), row('https://push.test/phone', 'ar')]);
        const result = await sendToUser('user-123', build);

        expect(result).toEqual({ sent: 2, pruned: 0, unavailable: false });
        const bodies = sendNotification.mock.calls.map((call) => JSON.parse(call[1] as string).body);
        expect(bodies.sort()).toEqual(['body-ar', 'body-en']);
        expect(setVapidDetails).toHaveBeenCalledWith(KEYS.VAPID_SUBJECT, KEYS.NEXT_PUBLIC_VAPID_PUBLIC_KEY, KEYS.VAPID_PRIVATE_KEY);
    });

    it('prunes the endpoints a service says are gone, and keeps the ones that answered', async () => {
        lean.mockResolvedValue([row('https://push.test/gone', 'en'), row('https://push.test/live', 'en')]);
        sendNotification.mockImplementation(async (subscription: { endpoint: string }) => {
            if (subscription.endpoint.endsWith('/gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
            return { statusCode: 201 };
        });

        const result = await sendToUser('user-123', build);
        expect(result).toEqual({ sent: 1, pruned: 1, unavailable: false });
        expect(deleteMany).toHaveBeenCalledWith({ endpoint: { $in: ['https://push.test/gone'] } });
    });

    it('swallows any other failure instead of breaking the caller', async () => {
        lean.mockResolvedValue([row('https://push.test/live', 'en')]);
        sendNotification.mockRejectedValue(new Error('network down'));

        await expect(sendToUser('user-123', build)).resolves.toEqual({ sent: 0, pruned: 0, unavailable: false });
        expect(deleteMany).not.toHaveBeenCalled();
    });
});

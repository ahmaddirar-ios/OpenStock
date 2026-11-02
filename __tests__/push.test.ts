import { describe, expect, it } from 'vitest';
import { alertPushPayload, pushConfig, pushConfigured, validateSubscription } from '@/lib/push';

// The pieces a push needs that are pure: is this deployment configured, is this what the
// browser sent, and what does the notification say. Sending lives in lib/push-send.ts.

const KEYS = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'B'.repeat(87),
    VAPID_PRIVATE_KEY: 'p'.repeat(43),
    VAPID_SUBJECT: 'mailto:ahmad@example.com',
};

const goodSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    expirationTime: null,
    keys: { p256dh: 'B'.repeat(60), auth: 'a'.repeat(22) },
};

describe('pushConfig', () => {
    it('is null when any part of the pair is missing', () => {
        expect(pushConfig({})).toBeNull();
        expect(pushConfigured({})).toBe(false);
        expect(pushConfig({ ...KEYS, VAPID_PRIVATE_KEY: '' })).toBeNull();
        expect(pushConfig({ ...KEYS, NEXT_PUBLIC_VAPID_PUBLIC_KEY: '' })).toBeNull();
        expect(pushConfig({ ...KEYS, VAPID_SUBJECT: '' })).toBeNull();
        expect(pushConfigured(KEYS)).toBe(true);
    });

    it('refuses a subject that a push service would reject', () => {
        expect(pushConfig({ ...KEYS, VAPID_SUBJECT: 'ahmad@example.com' })).toBeNull();
        expect(pushConfig({ ...KEYS, VAPID_SUBJECT: 'https://example.com' })).not.toBeNull();
    });

    it('refuses keys that are not base64url-shaped', () => {
        expect(pushConfig({ ...KEYS, NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'not a key!' })).toBeNull();
        expect(pushConfig({ ...KEYS, VAPID_PRIVATE_KEY: 'short' })).toBeNull();
    });
});

describe('validateSubscription', () => {
    it('keeps only the two keys and the endpoint it will store', () => {
        expect(validateSubscription(goodSubscription)).toEqual({
            endpoint: goodSubscription.endpoint,
            keys: { p256dh: goodSubscription.keys.p256dh, auth: goodSubscription.keys.auth },
        });
    });

    it('refuses anything a browser would not have sent', () => {
        expect(validateSubscription(null)).toBeNull();
        expect(validateSubscription('https://example.com')).toBeNull();
        expect(validateSubscription({})).toBeNull();
        expect(validateSubscription({ ...goodSubscription, endpoint: 'http://insecure.test/x' })).toBeNull();
        expect(validateSubscription({ ...goodSubscription, keys: undefined })).toBeNull();
        expect(validateSubscription({ ...goodSubscription, keys: { p256dh: 'B'.repeat(60) } })).toBeNull();
        expect(validateSubscription({ ...goodSubscription, keys: { p256dh: 'short', auth: 'a'.repeat(22) } })).toBeNull();
        expect(validateSubscription({ ...goodSubscription, keys: { p256dh: 'B'.repeat(60), auth: 'a' } })).toBeNull();
    });
});

describe('alertPushPayload', () => {
    it('names the symbol and carries the rule with the value that tripped it', () => {
        expect(alertPushPayload({ symbol: '2222.SR', label: 'RSI at or below 70', value: '57.5' })).toEqual({
            title: 'OpenStock · 2222.SR',
            body: 'RSI at or below 70: 57.5',
            url: '/alerts',
        });
    });

    it('says the same thing for a price rule and a volume rule: the caller writes the label', () => {
        // The centre and the cron both build `label`/`value` from lib/alert-labels.ts, so
        // the composer never has to know a language or a rule kind.
        expect(alertPushPayload({ symbol: 'AAPL', label: 'Price at or above', value: '$345.20' }).body)
            .toBe('Price at or above: $345.20');
        expect(alertPushPayload({ symbol: '1120.SR', label: 'الحجم ≥', value: '٢.٤×' }).body)
            .toBe('الحجم ≥: ٢.٤×');
    });
});

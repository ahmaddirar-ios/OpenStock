// What a push needs that can be decided without a browser, a database or a network: whether
// this deployment is configured at all, whether what the browser sent is worth storing, and
// what the notification says. `lib/push-send.ts` is the only thing that talks to a push
// service, and this file is the only thing that decides its inputs.

const BASE64URL = /^[A-Za-z0-9_-]+$/;
// A VAPID public key is an uncompressed P-256 point in base64url (87 chars, 65 bytes); the
// private key is a 32-byte scalar (43 chars). The lengths are exact, so a typo is caught here
// rather than by a push service answering 401.
const PUBLIC_KEY_LENGTH = 87;
const PRIVATE_KEY_LENGTH = 43;
const P256DH_LENGTH = 60;
const AUTH_LENGTH_RANGE: [number, number] = [20, 30];

export type PushConfig = {
    publicKey: string;
    privateKey: string;
    subject: string;
};

export type PushSubscriptionInput = {
    endpoint: string;
    keys: { p256dh: string; auth: string };
};

export type PushPayload = {
    /** The bold line the OS shows. */
    title: string;
    /** The rule and the value that tripped it. */
    body: string;
    /** Where a tap lands. */
    url: string;
};

const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * The keys a push service needs, or null when this deployment has none.
 *
 * Missing keys are not an error: the alert centre is complete without notifications, and the
 * toggle says so instead of the page failing.
 */
export function pushConfig(env: Record<string, string | undefined> = process.env): PushConfig | null {
    const publicKey = trimmed(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    const privateKey = trimmed(env.VAPID_PRIVATE_KEY);
    const subject = trimmed(env.VAPID_SUBJECT);

    if (!publicKey || !privateKey || !subject) return null;
    if (!BASE64URL.test(publicKey) || publicKey.length !== PUBLIC_KEY_LENGTH) return null;
    if (!BASE64URL.test(privateKey) || privateKey.length !== PRIVATE_KEY_LENGTH) return null;
    if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) return null;

    return { publicKey, privateKey, subject };
}

export const pushConfigured = (env: Record<string, string | undefined> = process.env): boolean =>
    pushConfig(env) !== null;

/**
 * The stored shape of what a browser hands over. Anything that is not a well-formed
 * subscription is refused, so a malformed body can never reach the database.
 */
export function validateSubscription(input: unknown): PushSubscriptionInput | null {
    if (typeof input !== 'object' || input === null) return null;
    const candidate = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    const endpoint = trimmed(candidate.endpoint);
    const p256dh = trimmed(candidate.keys?.p256dh);
    const auth = trimmed(candidate.keys?.auth);

    if (!endpoint.startsWith('https://')) return null;
    if (!BASE64URL.test(p256dh) || p256dh.length !== P256DH_LENGTH) return null;
    if (!BASE64URL.test(auth) || auth.length < AUTH_LENGTH_RANGE[0] || auth.length > AUTH_LENGTH_RANGE[1]) return null;

    return { endpoint, keys: { p256dh, auth } };
}

/**
 * What the notification says. `label` and `value` arrive already written in the reader's
 * language — the centre builds them from `lib/alert-labels.ts` and the cron from the
 * stored row — so this composer never needs to know a language or a rule kind.
 */
export function alertPushPayload({ symbol, label, value }: { symbol: string; label: string; value: string }): PushPayload {
    return {
        title: `OpenStock · ${symbol}`,
        body: `${label}: ${value}`,
        url: '/alerts',
    };
}

import { createHash, randomBytes } from 'node:crypto';

// The key format and its only cryptographic operation. Kept apart from the server actions so a
// test can mint and verify a key without touching Mongo or a request.

export const API_KEY_PREFIX = 'rvx_';
/** Shown in the profile list; long enough to tell two keys apart, short enough to be useless. */
export const API_KEY_DISPLAY_LENGTH = 12;

export type GeneratedApiKey = {
    /** The full secret. Returned to the customer once, never stored. */
    key: string;
    prefix: string;
    last4: string;
    hash: string;
};

/** What the profile list shows: no secret, just enough to recognise a row. */
export type ApiKeyView = {
    id: string;
    name: string;
    prefix: string;
    last4: string;
    usageCount: number;
    lastUsedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
};

export const hashApiKey = (key: string): string =>
    createHash('sha256').update(key, 'utf8').digest('hex');

export const isApiKeyShaped = (value: unknown): value is string =>
    typeof value === 'string' && value.startsWith(API_KEY_PREFIX) && value.length > API_KEY_DISPLAY_LENGTH + 4;

export function generateApiKey(): GeneratedApiKey {
    const secret = randomBytes(32).toString('base64url');
    const key = `${API_KEY_PREFIX}${secret}`;
    return {
        key,
        prefix: key.slice(0, API_KEY_DISPLAY_LENGTH),
        last4: key.slice(-4),
        hash: hashApiKey(key),
    };
}

/**
 * Pull a key out of the two headers customers actually send. `x-api-key` wins when both are present,
 * because a proxy that adds an Authorization header should not shadow the explicit one.
 */
export function apiKeyFromHeaders(headers: Headers): string | null {
    const direct = headers.get('x-api-key')?.trim();
    if (direct) return direct;
    const authorization = headers.get('authorization')?.trim();
    if (!authorization) return null;
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    return match ? match[1].trim() : null;
}

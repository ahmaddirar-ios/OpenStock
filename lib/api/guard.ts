import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/database/mongoose';
import { ApiKey } from '@/database/models/api-key.model';
import { accessFor } from '@/lib/entitlements-server';
import { apiKeyFromHeaders, hashApiKey, isApiKeyShaped } from '@/lib/api/keys';
import { apiQuotaForPlan, API_WINDOW_SECONDS } from '@/lib/api/limits';
import { apiError, rateLimitHeaders } from '@/lib/api/request';
import { consumeRateLimit, peekRateLimit, type RateLimitState } from '@/lib/rate-limit';
import type { Plan } from '@/lib/plans';

// The whole authentication story for /api/v1 in one function: find the key, prove it, prove the
// account may use the API, then spend one unit of its hourly window. A route either gets a context
// (and the headers to echo) or a ready-to-return refusal — never both.

export type ApiContext = {
    userId: string;
    keyId: string;
    keyName: string;
    plan: Plan;
    quota: RateLimitState;
    headers: Record<string, string>;
};

export type ApiAuthResult =
    | { context: ApiContext; response?: never }
    | { context?: never; response: NextResponse };

const THROTTLE_LAST_USED_MS = 60_000;

export async function authenticate(
    request: Request,
    options: { charge?: boolean; cost?: number } = {},
): Promise<ApiAuthResult> {
    const raw = apiKeyFromHeaders(request.headers);
    if (!raw || !isApiKeyShaped(raw)) {
        return { response: apiError(401, 'invalid_key', 'Send a key in x-api-key or Authorization: Bearer.') };
    }

    try {
        await connectToDatabase();
        const row = await ApiKey.findOne({ hash: hashApiKey(raw) }).lean();
        if (!row) {
            return { response: apiError(401, 'invalid_key', 'That key is not recognised.') };
        }
        if (row.revokedAt) {
            return { response: apiError(401, 'revoked_key', 'That key has been revoked.') };
        }
        if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) {
            return { response: apiError(401, 'expired_key', 'That key has expired.') };
        }

        const access = await accessFor(row.userId);
        if (!access.features.includes('api.rest')) {
            return { response: apiError(403, 'plan_required', 'This account’s plan does not include API access.') };
        }

        const quotaLimit = apiQuotaForPlan(access.plan);
        const keyId = String(row._id);
        const counterKey = `api:${keyId}`;
        const cost = Math.max(1, Math.floor(options.cost ?? 1));
        const state = options.charge === false
            ? await peekRateLimit(counterKey, quotaLimit, API_WINDOW_SECONDS)
            : await consumeRateLimit(counterKey, quotaLimit, API_WINDOW_SECONDS, cost);
        const headers = rateLimitHeaders(state);

        if (state.limited) {
            return {
                response: apiError(429, 'rate_limited', `Hourly quota of ${quotaLimit} requests reached.`, {
                    ...headers,
                    'Retry-After': headers['RateLimit-Reset'],
                }),
            };
        }

        // Usage accounting should never fail a request: a read that already answered is worth more
        // than a perfect counter. `lastUsedAt` is throttled so a hot script writes once a minute.
        const stale = !row.lastUsedAt || Date.now() - new Date(row.lastUsedAt).getTime() > THROTTLE_LAST_USED_MS;
        await ApiKey.updateOne(
            { _id: row._id },
            { $inc: { usageCount: 1 }, ...(stale ? { $set: { lastUsedAt: new Date() } } : {}) },
        ).catch(() => null);

        return {
            context: {
                userId: row.userId,
                keyId,
                keyName: row.name,
                plan: access.plan,
                quota: state,
                headers,
            },
        };
    } catch (error) {
        console.error('API key authentication failed:', error);
        return { response: apiError(500, 'upstream_error', 'Could not verify the key right now.') };
    }
}

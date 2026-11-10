import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/guard';
import { API_WINDOW_SECONDS } from '@/lib/api/limits';

// GET /api/v1/me
// Who the key belongs to and how much of the hour is left. Free: it never spends quota, because
// asking how much you have should not cost any.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = await authenticate(request, { charge: false });
    if (auth.response) return auth.response;

    const { context } = auth;
    return NextResponse.json(
        {
            account: { id: context.userId, plan: context.plan },
            key: { id: context.keyId, name: context.keyName },
            quota: {
                limit: context.quota.limit,
                used: context.quota.used,
                remaining: context.quota.remaining,
                resetAt: context.quota.resetAt.toISOString(),
                windowSeconds: API_WINDOW_SECONDS,
            },
        },
        { headers: { ...context.headers, 'Cache-Control': 'no-store' } },
    );
}

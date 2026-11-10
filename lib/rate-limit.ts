import { headers } from "next/headers";
import { connectToDatabase } from "@/database/mongoose";

type Counter = { _id: string; count: number; expiresAt: Date };
let ttlIndex: Promise<unknown> | null = null;

export const TOO_MANY_ATTEMPTS = 'Too many attempts. Please wait a few minutes and try again.';

export type RateLimitState = {
    limited: boolean;
    limit: number;
    used: number;
    remaining: number;
    resetAt: Date;
};

// Fixed-window counters in MongoDB, shared by every server instance (an in-memory limit resets per serverless
// instance). better-auth's own limiter only runs on its /api/auth routes, not on auth.api calls from server actions.
// ponytail: two first hits in the same instant can both start at 1; fine for abuse limits.
//
// `consumeRateLimit` returns the whole window, not just a boolean, because the customer API advertises its
// remaining quota in headers. `isRateLimited` stays as the one-bit answer the rest of the app already uses.
export async function consumeRateLimit(key: string, max: number, windowSeconds: number, cost = 1): Promise<RateLimitState> {
    const now = new Date();
    const freshWindow = new Date(now.getTime() + windowSeconds * 1000);
    const db = (await connectToDatabase()).connection.db;
    if (!db) {
        return { limited: false, limit: max, used: cost, remaining: Math.max(0, max - cost), resetAt: freshWindow };
    }
    const counters = db.collection<Counter>('rate_limits');
    ttlIndex ??= counters.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => null);

    const counter = await counters.findOneAndUpdate(
        { _id: key, expiresAt: { $gt: now } },
        { $inc: { count: cost } },
        { returnDocument: 'after' },
    );
    if (counter) {
        const resetAt = counter.expiresAt instanceof Date ? counter.expiresAt : new Date(counter.expiresAt);
        return {
            limited: counter.count > max,
            limit: max,
            used: counter.count,
            remaining: Math.max(0, max - counter.count),
            resetAt,
        };
    }

    await counters.updateOne(
        { _id: key },
        { $set: { count: cost, expiresAt: freshWindow } },
        { upsert: true },
    );
    return {
        limited: cost > max,
        limit: max,
        used: cost,
        remaining: Math.max(0, max - cost),
        resetAt: freshWindow,
    };
}

export async function isRateLimited(key: string, max: number, windowSeconds: number, cost = 1): Promise<boolean> {
    return (await consumeRateLimit(key, max, windowSeconds, cost)).limited;
}

/** Read a window without spending from it. `/api/v1/me` uses this so checking usage is free. */
export async function peekRateLimit(key: string, max: number, windowSeconds: number): Promise<RateLimitState> {
    const now = new Date();
    const freshWindow = new Date(now.getTime() + windowSeconds * 1000);
    const db = (await connectToDatabase()).connection.db;
    if (!db) {
        return { limited: false, limit: max, used: 0, remaining: max, resetAt: freshWindow };
    }
    const counter = await db.collection<Counter>('rate_limits').findOne({ _id: key, expiresAt: { $gt: now } });
    if (!counter) {
        return { limited: false, limit: max, used: 0, remaining: max, resetAt: freshWindow };
    }
    const resetAt = counter.expiresAt instanceof Date ? counter.expiresAt : new Date(counter.expiresAt);
    return {
        limited: counter.count >= max,
        limit: max,
        used: counter.count,
        remaining: Math.max(0, max - counter.count),
        resetAt,
    };
}

// Vercel and most proxies put the client first in x-forwarded-for. Self-hosted without a proxy the header can be
// forged, which is why every IP limit is paired with a per-account one.
export async function clientIp(): Promise<string> {
    const h = await headers();
    return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

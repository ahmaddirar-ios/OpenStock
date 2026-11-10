// The operations panel's readings: are the upstreams answering, how much is in the database, and
// what is scheduled. Everything here is a bounded read — a provider that hangs is reported as down
// after the timeout, never allowed to hold the page.

import { connectToDatabase } from '@/database/mongoose';

export type ProbeStatus = 'ok' | 'slow' | 'down' | 'skipped';

export type ProbeResult = {
    id: ProviderId;
    status: ProbeStatus;
    /** Round-trip time in milliseconds, when the provider answered. */
    latencyMs: number | null;
    /** A short, human-readable fact: the HTTP status, the missing key, the error. */
    detail: string;
};

export type ProviderId = 'yahoo' | 'finnhub' | 'news';

export const SLOW_MS = 1500;
export const PROBE_TIMEOUT_MS = 5000;

/** One bounded GET, timed. A non-2xx answer is `down`; a slow but working one is `slow`. */
export async function probe(
    id: ProviderId,
    url: string,
    options: { timeoutMs?: number; slowMs?: number; fetcher?: typeof fetch } = {},
): Promise<ProbeResult> {
    const { timeoutMs = PROBE_TIMEOUT_MS, slowMs = SLOW_MS, fetcher = fetch } = options;
    const started = Date.now();
    try {
        const response = await fetcher(url, {
            cache: 'no-store',
            signal: AbortSignal.timeout(timeoutMs),
            headers: { 'User-Agent': 'Mozilla/5.0 (Rovex ops probe)' },
        });
        const latencyMs = Date.now() - started;
        if (!response.ok) return { id, status: 'down', latencyMs, detail: `HTTP ${response.status}` };
        return { id, status: latencyMs > slowMs ? 'slow' : 'ok', latencyMs, detail: `HTTP ${response.status}` };
    } catch (error) {
        return {
            id,
            status: 'down',
            latencyMs: Date.now() - started,
            detail: error instanceof Error ? error.name === 'TimeoutError' ? 'timed out' : error.message : 'failed',
        };
    }
}

const skipped = (id: ProviderId, detail: string): ProbeResult => ({ id, status: 'skipped', latencyMs: null, detail });

/** The three upstreams the product depends on, each probed once. */
export async function providerProbes(): Promise<ProbeResult[]> {
    const finnhubKey = process.env.FINNHUB_API_KEY;
    return Promise.all([
        probe('yahoo', 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d'),
        finnhubKey
            ? probe('finnhub', `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(finnhubKey)}`)
            : Promise.resolve(skipped('finnhub', 'FINNHUB_API_KEY is not set')),
        probe('news', 'https://news.google.com/rss/search?q=TASI&hl=en-US&gl=US&ceid=US:en'),
    ]);
}

/** The collections this app owns, in the order the panel lists them. */
export const OWNED_COLLECTIONS = [
    'user',
    'session',
    'watchlists',
    'watchlistlists',
    'positions',
    'transactions',
    'alerts',
    'alertevents',
    'strategies',
    'formulas',
    'screenerrows',
    'chartsetups',
    'waitlists',
    'featureflags',
    'dashboardlayouts',
] as const;

export type CollectionCount = { name: string; count: number };

/** Document counts for the app's own collections. A missing collection reads as zero. */
export async function collectionCounts(): Promise<CollectionCount[]> {
    await connectToDatabase();
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error('No DB connection');
    const existing = new Set((await db.listCollections().toArray()).map((row) => row.name));
    return Promise.all(
        OWNED_COLLECTIONS.map(async (name) => ({
            name,
            count: existing.has(name) ? await db.collection(name).estimatedDocumentCount() : 0,
        })),
    );
}

export type CronEntry = { id: string; cron: string; descriptionKey: string };

/**
 * The scheduled functions. A static mirror of `lib/inngest/functions.ts`, kept beside the probe so
 * the panel does not import Inngest (and its runtime) just to list four rows. A changed trigger is
 * a one-line edit here; the test below pins the pair.
 */
export const CRONS: readonly CronEntry[] = [
    { id: 'check-stock-alerts', cron: '*/5 * * * *', descriptionKey: 'ops.cron.alerts' },
    { id: 'refresh-screener', cron: '0 6 * * *', descriptionKey: 'ops.cron.screener' },
    { id: 'weekly-news-summary', cron: '0 9 * * 1', descriptionKey: 'ops.cron.news' },
    { id: 'check-inactive-users', cron: '0 10 * * *', descriptionKey: 'ops.cron.inactive' },
];

export type RecentAlertEvent = {
    symbol: string;
    condition: string;
    value: number;
    at: string;
};

/** The last few fired alerts, newest first. A failed read is an empty list, not a broken page. */
export async function recentAlertEvents(limit = 8): Promise<RecentAlertEvent[]> {
    try {
        const { AlertEvent } = await import('@/database/models/alert-event.model');
        await connectToDatabase();
        const rows = await AlertEvent.find({}, { symbol: 1, condition: 1, value: 1, at: 1 })
            .sort({ at: -1 })
            .limit(limit)
            .lean();
        return rows.map((row) => ({
            symbol: row.symbol,
            condition: row.condition,
            value: row.value,
            at: new Date(row.at).toISOString(),
        }));
    } catch {
        return [];
    }
}

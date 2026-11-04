import { afterEach, describe, expect, it, vi } from 'vitest';

// Wednesday 2026-11-04 15:00 UTC is 10:00 in New York: the tape is moving.
const OPEN = new Date('2026-11-04T15:00:00Z');
// Wednesday 2026-11-04 03:00 UTC is 22:00 the night before: the market is shut.
const CLOSED = new Date('2026-11-04T03:00:00Z');
// Saturday, whatever the hour.
const WEEKEND = new Date('2026-11-07T15:00:00Z');

const load = async (mode?: 'cached' | 'realtime') => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_ROVEX_DATA_MODE', mode ?? '');
    vi.stubEnv('NEXT_PUBLIC_OPENSTOCK_DATA_MODE', '');
    return import('@/lib/market-data');
};

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe('quote freshness', () => {
    it('holds a quote for an hour once the market is shut', async () => {
        const { isQuoteLive, quoteTtlSeconds } = await load();
        expect(isQuoteLive([], CLOSED)).toBe(false);
        expect(quoteTtlSeconds([], CLOSED)).toBe(3600);
        expect(quoteTtlSeconds(['AAPL'], WEEKEND)).toBe(3600);
    });

    it('refreshes every minute while the tape moves', async () => {
        const { isQuoteLive, quoteTtlSeconds } = await load();
        expect(isQuoteLive([], OPEN)).toBe(true);
        expect(quoteTtlSeconds([], OPEN)).toBe(60);
        expect(quoteTtlSeconds(['AAPL'], OPEN)).toBe(60);
    });

    it('counts pre-market and after-hours as live', async () => {
        const { quoteTtlSeconds } = await load();
        // 09:00 ET pre-market, 17:00 ET after hours
        expect(quoteTtlSeconds([], new Date('2026-11-04T14:00:00Z'))).toBe(60);
        expect(quoteTtlSeconds([], new Date('2026-11-04T22:00:00Z'))).toBe(60);
    });

    it('keeps crypto live around the clock', async () => {
        const { isQuoteLive, quoteTtlSeconds } = await load();
        expect(isQuoteLive(['BINANCE:BTCUSDT'], WEEKEND)).toBe(true);
        expect(quoteTtlSeconds(['BINANCE:BTCUSDT'], CLOSED)).toBe(60);
    });

    it('drops to 15 seconds in realtime mode', async () => {
        const { quoteTtlSeconds } = await load('realtime');
        expect(quoteTtlSeconds(['AAPL'], OPEN)).toBe(15);
        expect(quoteTtlSeconds([], CLOSED)).toBe(300);
    });

    it('spends the free Finnhub quota slowly when a whole watchlist polls', async () => {
        const { quoteTtlSeconds } = await load('realtime');
        const watchlist = Array.from({ length: 25 }, (_, i) => `SYM${i}`);
        // 25 symbols at 15s would be 100 calls a minute; the free plan allows 60.
        expect(quoteTtlSeconds(watchlist, OPEN)).toBeGreaterThanOrEqual(30);
    });
});

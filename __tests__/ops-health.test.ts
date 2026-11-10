import { describe, expect, it, vi } from 'vitest';
import { CRONS, probe, SLOW_MS } from '@/lib/ops/health';

const response = (ok: boolean, status = ok ? 200 : 503) => ({ ok, status }) as Response;

describe('the provider probe', () => {
    it('reports a fast, healthy answer as ok', async () => {
        const fetcher = vi.fn(async () => response(true));
        const result = await probe('yahoo', 'https://example.test', { fetcher: fetcher as unknown as typeof fetch });
        expect(result).toMatchObject({ id: 'yahoo', status: 'ok', detail: 'HTTP 200' });
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('calls a working but slow answer slow', async () => {
        const fetcher = vi.fn(async () => response(true));
        const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_000 + SLOW_MS + 50);
        const result = await probe('news', 'https://example.test', { fetcher: fetcher as unknown as typeof fetch });
        now.mockRestore();
        expect(result).toMatchObject({ status: 'slow', latencyMs: SLOW_MS + 50 });
    });

    it('treats a non-2xx answer as down, with the status', async () => {
        const fetcher = vi.fn(async () => response(false, 503));
        const result = await probe('finnhub', 'https://example.test', { fetcher: fetcher as unknown as typeof fetch });
        expect(result).toMatchObject({ status: 'down', detail: 'HTTP 503' });
    });

    it('never throws: a rejected fetch is a reported state', async () => {
        const fetcher = vi.fn(async () => {
            throw new Error('getaddrinfo ENOTFOUND');
        });
        const result = await probe('yahoo', 'https://example.test', { fetcher: fetcher as unknown as typeof fetch });
        expect(result.status).toBe('down');
        expect(result.detail).toContain('ENOTFOUND');
    });

    it('names a timeout as one', async () => {
        const fetcher = vi.fn(async () => {
            const error = new Error('The operation timed out');
            error.name = 'TimeoutError';
            throw error;
        });
        const result = await probe('yahoo', 'https://example.test', { fetcher: fetcher as unknown as typeof fetch });
        expect(result).toMatchObject({ status: 'down', detail: 'timed out' });
    });
});

describe('the cron table', () => {
    it('lists each schedule once, with a five-field expression', () => {
        const ids = CRONS.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const entry of CRONS) expect(entry.cron.trim().split(/\s+/)).toHaveLength(5);
    });

    it('names every schedule in both languages', async () => {
        const { tx } = await import('@/lib/i18n');
        for (const entry of CRONS) {
            expect(tx('en', entry.descriptionKey as never)).not.toBe(entry.descriptionKey);
            expect(tx('ar', entry.descriptionKey as never)).not.toBe(entry.descriptionKey);
        }
    });
});

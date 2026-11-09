import { describe, expect, it } from 'vitest';
import { daysUntil, fundamentalsFromRow } from '@/lib/market/saudi-fundamentals';

const row = (values: (number | string | null)[]) => ({ s: 'TADAWUL:2222', d: values });

describe('Saudi fundamentals', () => {
    it('reads the dividend and results fields a page shows', () => {
        const f = fundamentalsFromRow(row([
            5.1880733944954125, 1787227140, 1787831940, 68.877, 1785704400, null, 13.3966,
        ]));
        expect(f).toMatchObject({ symbol: '2222.SR', dividendYield: 5.1880733944954125, payoutRatio: 68.877, peRatio: 13.3966 });
        // Epoch seconds in, milliseconds out.
        expect(f?.exDividendDate).toBe(1787227140000);
        expect(f?.dividendPayDate).toBe(1787831940000);
        expect(f?.lastEarningsDate).toBe(1785704400000);
    });

    it('keeps a company that pays nothing as null rather than zero-filled', () => {
        const f = fundamentalsFromRow(row([0, null, null, 0, 1785704400, 1792558860, null]));
        expect(f?.dividendYield).toBe(0);
        expect(f?.exDividendDate).toBeNull();
        expect(f?.peRatio).toBeNull();
        expect(f?.nextEarningsDate).toBe(1792558860000);
    });

    it('ignores a row that is not a Tadawul ticker', () => {
        expect(fundamentalsFromRow({ s: 'NASDAQ:AAPL', d: [1] })).toBeNull();
    });

    it('counts whole days to the next results, and past dates as negative', () => {
        const now = Date.UTC(2026, 10, 4, 6, 0, 0);            // 2026-11-04 06:00Z
        const inFiveDays = Date.UTC(2026, 10, 9, 1, 0, 0);
        const yesterday = Date.UTC(2026, 10, 3, 23, 0, 0);
        expect(daysUntil(inFiveDays, now)).toBe(5);
        expect(daysUntil(yesterday, now)).toBe(-1);
        expect(daysUntil(null, now)).toBeNull();
    });
});

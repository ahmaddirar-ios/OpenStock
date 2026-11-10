import { describe, expect, it } from 'vitest';
import { previousSessionClose, sessionChange, sessionDay, tadawulPhase } from '@/lib/chart/quote';
import type { Candle } from '@/lib/market/yahoo-candles';

const bar = (time: number, close: number): Candle => ({
    time,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
});

// 2026-11-02 10:00 Riyadh = 07:00 UTC.
const MONDAY_OPEN = Date.UTC(2026, 10, 2, 7, 0) / 1000;

describe('the quote header', () => {
    it('measures today against the last close of an earlier session', () => {
        // Sunday 15:00 Riyadh, Monday 10:00 and 11:00 Riyadh.
        const candles = [
            bar(MONDAY_OPEN - 20 * 3600, 100),
            bar(MONDAY_OPEN, 102),
            bar(MONDAY_OPEN + 3600, 103),
        ];
        expect(previousSessionClose(candles, 'riyadh')).toBe(100);
        expect(sessionChange(candles, 'riyadh')).toBeCloseTo(3, 5);
    });

    it('reads a daily set as yesterday then today', () => {
        const candles = [bar(MONDAY_OPEN - 86_400, 50), bar(MONDAY_OPEN, 55)];
        expect(sessionChange(candles, 'riyadh')).toBeCloseTo(10, 5);
    });

    it('refuses to invent a change when the set holds one session', () => {
        const candles = [bar(MONDAY_OPEN, 100), bar(MONDAY_OPEN + 3600, 101)];
        expect(previousSessionClose(candles, 'riyadh')).toBeNull();
        expect(sessionChange(candles, 'riyadh')).toBeNull();
    });

    it('treats 23:00 UTC as the next Riyadh day, not the same one', () => {
        const lateSunday = Date.UTC(2026, 10, 1, 23, 0) / 1000;
        expect(sessionDay(lateSunday, 'utc')).toBe(sessionDay(lateSunday - 86400, 'utc') + 1);
        expect(sessionDay(lateSunday, 'riyadh')).toBe(sessionDay(lateSunday, 'utc') + 1);
    });

    it('measures against the exchange’s stated close, not a session the feed cut short', () => {
        // Yesterday arrived truncated at 11:00 Riyadh (its last print was 100); the exchange says
        // the session closed at 120. Today prints 126, so the day is up 5, not up 26.
        const candles = [
            bar(MONDAY_OPEN - 20 * 3600, 100),
            bar(MONDAY_OPEN, 120),
            bar(MONDAY_OPEN + 3600, 126),
        ];
        expect(sessionChange(candles, 'riyadh')).toBeCloseTo(26, 5);
        expect(sessionChange(candles, 'riyadh', 120)).toBeCloseTo(5, 5);
    });

    it('ignores a stated close that cannot be a price', () => {
        const candles = [bar(MONDAY_OPEN - 86_400, 50), bar(MONDAY_OPEN, 55)];
        expect(sessionChange(candles, 'riyadh', 0)).toBeCloseTo(10, 5);
        expect(sessionChange(candles, 'riyadh', Number.NaN)).toBeCloseTo(10, 5);
    });
});

describe("Tadawul's clock", () => {
    it('opens at ten and closes at three, Riyadh time', () => {
        expect(tadawulPhase(0, 9 * 60 + 29)).toBe('closed');
        expect(tadawulPhase(0, 9 * 60 + 30)).toBe('pre');
        expect(tadawulPhase(0, 10 * 60)).toBe('open');
        expect(tadawulPhase(2, 14 * 60 + 59)).toBe('open');
        expect(tadawulPhase(2, 15 * 60)).toBe('after');
        expect(tadawulPhase(2, 15 * 60 + 20)).toBe('closed');
    });

    it('is shut on Friday and Saturday', () => {
        expect(tadawulPhase(5, 11 * 60)).toBe('closed');
        expect(tadawulPhase(6, 11 * 60)).toBe('closed');
    });
});

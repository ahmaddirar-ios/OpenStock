import { describe, expect, it } from 'vitest';
import { BAR_SECONDS, formatCountdown, secondsToBarClose } from '@/lib/chart-countdown';

describe('secondsToBarClose', () => {
    it('counts down inside an open intraday bar', () => {
        // The 1m bar that opened at t=1000 closes at 1060; 30 seconds in, 30 are left.
        expect(secondsToBarClose(1000, '1m', 1030)).toBe(30);
        expect(secondsToBarClose(1000, '5m', 1000)).toBe(300);
        expect(secondsToBarClose(0, '4h', 0)).toBe(14400);
    });

    it('shows nothing on a daily or weekly interval, which has no clock', () => {
        expect(secondsToBarClose(1000, '1d', 1030)).toBeNull();
        expect(secondsToBarClose(1000, '1wk', 1030)).toBeNull();
        expect(secondsToBarClose(1000, '1mo', 1030)).toBeNull();
    });

    it('shows nothing when the market is shut and the bar already closed', () => {
        expect(secondsToBarClose(1000, '1m', 1061)).toBeNull();
        expect(secondsToBarClose(1000, '1m', 99_999)).toBeNull();
    });

    it('shows nothing for a stale series whose clock is more than a bar behind', () => {
        expect(secondsToBarClose(2000, '1m', 1000)).toBeNull();
    });

    it('keeps the last second visible instead of blinking out early', () => {
        expect(secondsToBarClose(1000, '1m', 1059.5)).toBe(0.5);
    });
});

describe('formatCountdown', () => {
    it('writes mm:ss, rounding up so the last second is not shown as zero', () => {
        expect(formatCountdown(0)).toBe('00:00');
        expect(formatCountdown(0.4)).toBe('00:01');
        expect(formatCountdown(65)).toBe('01:05');
    });

    it('lets the minutes run past 59 for the multi-hour intervals', () => {
        expect(formatCountdown(3661)).toBe('61:01');
        expect(BAR_SECONDS['2h']).toBe(7200);
    });
});

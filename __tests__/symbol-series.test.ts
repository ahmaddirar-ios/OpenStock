import { describe, expect, it } from 'vitest';
import { alignCloses, carryCloses, medianSpacing } from '@/lib/symbol-series';
import type { Candle } from '@/lib/yahoo-candles';

const DAY = 86_400;
const HOUR = 3_600;
const JAN_1_2026 = 1_767_225_600;

const bar = (time: number, close: number): Candle => ({
    time,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
});

const series = (times: readonly number[], close: (index: number) => number) =>
    times.map((time, index) => bar(time, close(index)));

describe('medianSpacing', () => {
    it('reads the typical gap, not the first one', () => {
        const times = [0, DAY, 2 * DAY, 9 * DAY];
        expect(medianSpacing(series(times, () => 10))).toBe(DAY);
    });

    it('has nothing to say about a single bar', () => {
        expect(medianSpacing([bar(0, 10)])).toBe(0);
        expect(medianSpacing([])).toBe(0);
    });
});

describe('alignCloses', () => {
    it('pairs daily bars from two markets that open hours apart', () => {
        // Riyadh opens at 07:00 UTC, New York at 14:30 UTC: seven and a half hours apart, one session.
        const base = series([0, 1, 2, 3].map((day) => JAN_1_2026 + day * DAY + 7 * HOUR), (index) => 10 + index);
        const other = series([0, 1, 2, 3].map((day) => JAN_1_2026 + day * DAY + 14.5 * HOUR), (index) => 20 + index);
        expect(alignCloses(base, other)).toEqual([20, 21, 22, 23]);
    });

    it('refuses to invent a pair for sessions that never overlap', () => {
        // A Riyadh morning and a New York afternoon, an hour at a time. Counting bars instead would
        // drift: the same month holds 116 Riyadh hours and 161 New York ones.
        const base = series([0, 1, 2, 3].map((step) => JAN_1_2026 + step * HOUR), () => 10);
        const other = series([0, 1, 2, 3].map((step) => JAN_1_2026 + 6 * HOUR + step * HOUR), (index) => 20 + index);
        expect(alignCloses(base, other)).toEqual([null, null, null, null]);
    });

    it('refuses bars of a different timeframe, so a stale fetch paints nothing', () => {
        const base = series([0, 1, 2].map((day) => JAN_1_2026 + day * DAY), () => 10);
        const hourly = series([0, 1, 2, 3, 4, 5].map((step) => JAN_1_2026 + step * HOUR), () => 20);
        expect(alignCloses(base, hourly)).toEqual([null, null, null]);
    });

    it('leaves a gap where the other symbol had no bar', () => {
        const base = series([0, 1, 2, 3].map((day) => JAN_1_2026 + day * DAY), (index) => 10 + index);
        const other = series([0, 2, 3].map((day) => JAN_1_2026 + day * DAY), (index) => 20 + index);
        expect(alignCloses(base, other)).toEqual([20, null, 21, 22]);
    });

    it('pairs monthly bars by calendar month, however the exchange stamps them', () => {
        const months = [0, 1, 2].map((month) => Date.UTC(2026, month, 1) / 1000);
        const later = [0, 1, 2].map((month) => Date.UTC(2026, month, 28) / 1000);
        const base = series(months, (index) => 10 + index);
        const other = series(later, (index) => 40 + index);
        expect(alignCloses(base, other)).toEqual([40, 41, 42]);
    });

    it('ignores bars the other symbol has and this one does not', () => {
        const base = series([2, 3, 4].map((day) => JAN_1_2026 + day * DAY), () => 10);
        const other = series([0, 1, 2, 3, 4].map((day) => JAN_1_2026 + day * DAY), (index) => 20 + index);
        expect(alignCloses(base, other)).toEqual([22, 23, 24]);
    });

    it('answers nulls when either side is empty', () => {
        expect(alignCloses([], [bar(0, 10)])).toEqual([]);
        expect(alignCloses([bar(0, 10)], [])).toEqual([null]);
    });
});

describe('carryCloses', () => {
    it('carries the last close across a closed market, so a spread survives', () => {
        // Riyadh trades at 08:00 while New York's last bar was 07:00: the level is still known, and
        // the bar before the partner's first close has nothing to compare to.
        const base = series([5, 8, 9, 10].map((hour) => JAN_1_2026 + hour * HOUR), () => 10);
        const other = series([6, 7].map((hour) => JAN_1_2026 + hour * HOUR), (index) => 20 + index);
        expect(carryCloses(base, other)).toEqual([null, 21, 21, 21]);
    });

    it('holds the previous close until the next bar arrives', () => {
        const base = series([0, 1, 2, 3, 4].map((day) => JAN_1_2026 + day * DAY), () => 10);
        const other = series([0, 2].map((day) => JAN_1_2026 + day * DAY), (index) => 20 + index);
        expect(carryCloses(base, other)).toEqual([20, 20, 21, 21, 21]);
    });

    it('treats a week-old quote as absent rather than carried', () => {
        const base = series([0, 1, 2].map((day) => JAN_1_2026 + 30 * DAY + day * DAY), () => 10);
        const other = series([0].map((day) => JAN_1_2026 + day * DAY), () => 20);
        expect(carryCloses(base, other)).toEqual([null, null, null]);
    });

    it('refuses a different timeframe, like the same-time pairing does', () => {
        const base = series([0, 1, 2].map((day) => JAN_1_2026 + day * DAY), () => 10);
        const hourly = series([0, 1, 2, 3, 4, 5].map((step) => JAN_1_2026 + step * HOUR), () => 20);
        expect(carryCloses(base, hourly)).toEqual([null, null, null]);
    });

    it('answers nulls when either side is empty', () => {
        expect(carryCloses([], [bar(0, 10)])).toEqual([]);
        expect(carryCloses([bar(0, 10)], [])).toEqual([null]);
    });
});

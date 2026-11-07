// Pairing two symbols' bars. A study that compares instruments has to answer one question before
// any arithmetic: which bar of the other symbol belongs to this bar? Two markets keep different
// hours and different holidays, so the answer cannot be "the bar at index i".
//
// Two answers, for the two questions the chart actually asks:
//
//   alignCloses  — same-time pairing, for a correlation. A bar pairs with the other symbol's
//                  nearest bar when that bar is within half the spacing of this series. That is
//                  exact for daily bars across time zones (Riyadh 07:00 UTC and New York 14:30 UTC
//                  are seven and a half hours apart, still one day) and for exchanges whose
//                  sessions overlap. When the sessions never meet — a Riyadh morning against a New
//                  York afternoon, an hour at a time — there is no contemporaneous bar, and the
//                  honest answer is a gap rather than a pairing invented from bar counts. Counting
//                  bars would drift by a week: the same month holds 116 Riyadh hours and 161 New
//                  York ones.
//
//   carryCloses  — last known close, for a spread. A level needs no contemporaneous bar: the price
//                  of the other symbol at 10:00 Riyadh is whatever it last closed at. This is what
//                  the chart's own `request.security`-style comparison does, and it keeps a spread
//                  readable on every interval.

import type { Candle } from '@/lib/yahoo-candles';

/** The typical gap between bars, in seconds; zero when there are fewer than two. */
export function medianSpacing(candles: readonly Candle[]): number {
    if (candles.length < 2) return 0;
    const gaps: number[] = [];
    for (let i = 1; i < candles.length; i += 1) {
        const gap = candles[i].time - candles[i - 1].time;
        if (gap > 0) gaps.push(gap);
    }
    if (gaps.length === 0) return 0;
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)];
}

const monthKey = (time: number): number => {
    const date = new Date(time * 1000);
    return date.getUTCFullYear() * 12 + date.getUTCMonth();
};

/** The index of `time` in the sorted `times`, or the nearest neighbour when it is absent. */
const nearest = (times: readonly number[], time: number): number => {
    let low = 0;
    let high = times.length - 1;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (times[mid] < time) low = mid + 1;
        else high = mid;
    }
    if (low > 0 && Math.abs(times[low - 1] - time) <= Math.abs(times[low] - time)) return low - 1;
    return low;
};

/** The index of the last `times` entry at or before `time`, or -1. */
const latestAtOrBefore = (times: readonly number[], time: number): number => {
    let low = 0;
    let high = times.length - 1;
    let found = -1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (times[mid] <= time) {
            found = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return found;
};

/**
 * For each bar of `base`, the contemporaneous close of `other`, or null where the two calendars do
 * not meet. The inputs are not required to share a range: extra bars on either side are ignored.
 *
 * The spacing guard is deliberate. A series stored for another interval (a daily one under a
 * 60-minute chart) is not paired at all rather than paired badly, which is what keeps a stale
 * fetch from painting a plausible but wrong line.
 */
export function alignCloses(base: readonly Candle[], other: readonly Candle[]): (number | null)[] {
    const out: (number | null)[] = base.map(() => null);
    if (base.length === 0 || other.length === 0) return out;
    const spacing = medianSpacing(base);
    const partnerSpacing = medianSpacing(other);
    if (spacing <= 0 || partnerSpacing <= 0) return out;
    // Bars of a different timeframe, not merely a different time zone.
    if (partnerSpacing < spacing / 2 || partnerSpacing > spacing * 2) return out;

    const sorted = [...other].sort((a, b) => a.time - b.time);

    // Monthly bars from two exchanges are stamped weeks apart inside the same month, which the
    // half-spacing rule would reject. At that density the period itself is the answer: one bar a
    // month, paired by calendar month.
    if (spacing >= 25 * 86400) {
        const byMonth = new Map<number, number>();
        for (const candle of sorted) byMonth.set(monthKey(candle.time), candle.close);
        for (let i = 0; i < base.length; i += 1) out[i] = byMonth.get(monthKey(base[i].time)) ?? null;
        return out;
    }

    const times = sorted.map((candle) => candle.time);
    const tolerance = spacing / 2;
    for (let i = 0; i < base.length; i += 1) {
        const time = base[i].time;
        const at = nearest(times, time);
        if (Math.abs(times[at] - time) <= tolerance) out[i] = sorted[at].close;
    }
    return out;
}

/**
 * For each bar of `base`, the other symbol's most recent close at that moment — forward filled, so
 * a level comparison works while one market is closed. A close older than a week is treated as
 * absent rather than carried: a suspended listing is not a price.
 */
export function carryCloses(base: readonly Candle[], other: readonly Candle[], maxAge = 7 * 86400): (number | null)[] {
    const out: (number | null)[] = base.map(() => null);
    if (base.length === 0 || other.length === 0) return out;
    const spacing = medianSpacing(base);
    const partnerSpacing = medianSpacing(other);
    if (spacing <= 0 || partnerSpacing <= 0) return out;
    if (partnerSpacing < spacing / 2 || partnerSpacing > spacing * 2) return out;

    const sorted = [...other].sort((a, b) => a.time - b.time);
    const times = sorted.map((candle) => candle.time);
    for (let i = 0; i < base.length; i += 1) {
        const time = base[i].time;
        const at = latestAtOrBefore(times, time);
        if (at < 0) continue;
        if (time - times[at] > maxAge) continue;
        out[i] = sorted[at].close;
    }
    return out;
}

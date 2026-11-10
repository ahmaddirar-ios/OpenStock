import { describe, expect, it } from 'vitest';
import {
    DEFAULT_TIME_ZONE,
    TIME_ZONES,
    TIME_ZONE_KEY,
    parseTimeZone,
    readTimeZone,
    tickLabel,
    timeLabel,
    writeTimeZone,
} from '@/lib/chart/time';
import { intervalStep, withSessionBreaks } from '@/lib/chart/sessions';

describe('time zones', () => {
    it('accepts the listed zones and defaults to local', () => {
        for (const zone of TIME_ZONES) expect(parseTimeZone(zone.id)).toBe(zone.id);
        expect(parseTimeZone('Mars/Olympus')).toBe(DEFAULT_TIME_ZONE);
        expect(parseTimeZone(null)).toBe(DEFAULT_TIME_ZONE);
    });

    it('round-trips and repairs its storage', () => {
        const store = new Map<string, string>();
        const storage = {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
        };
        writeTimeZone(storage, 'Asia/Riyadh');
        expect(store.get(TIME_ZONE_KEY)).toBe('Asia/Riyadh');
        expect(readTimeZone(storage)).toBe('Asia/Riyadh');
        store.set(TIME_ZONE_KEY, 'nowhere');
        expect(readTimeZone(storage)).toBe('local');
        expect(readTimeZone({ getItem: () => { throw new Error('no'); } })).toBe('local');
    });

    it('labels a tick in the requested zone, not the browser one', () => {
        // 2026-11-12T00:30:00Z is 03:30 in Riyadh and 19:30 the previous day in New York.
        const seconds = Date.UTC(2026, 10, 12, 0, 30) / 1000;
        expect(tickLabel('time', seconds, 'UTC')).toBe('00:30');
        expect(tickLabel('time', seconds, 'Asia/Riyadh')).toBe('03:30');
        expect(tickLabel('day', seconds, 'America/New_York')).toBe('11 Nov');
        expect(tickLabel('month', seconds, 'UTC')).toBe('Nov');
        expect(tickLabel('year', seconds, 'UTC')).toBe('2026');
    });

    it('builds a full stamp for the readout', () => {
        const seconds = Date.UTC(2026, 10, 12, 14, 30) / 1000;
        expect(timeLabel(seconds, 'UTC')).toBe('12 Nov 2026, 14:30');
    });
});

describe('session breaks', () => {
    it('reads the interval as the smallest gap', () => {
        expect(intervalStep([0, 300, 600, 900])).toBe(300);
        // A missing bar and a weekend only ever make gaps bigger, so the smallest one is the interval.
        expect(intervalStep([0, 300, 900, 1200])).toBe(300);
        expect(intervalStep([])).toBe(0);
        expect(intervalStep([5])).toBe(0);
    });

    it('fills a long gap with empty slots, one per interval', () => {
        const candles = [
            { time: 0, close: 1 },
            { time: 300, close: 2 },
            { time: 600, close: 3 },
            { time: 1500, close: 4 },
        ];
        const filled = withSessionBreaks(candles);
        expect(filled.map((bar) => bar.time)).toEqual([0, 300, 600, 900, 1200, 1500]);
        expect('close' in filled[3]).toBe(false);
        // The real bars are untouched and in order.
        expect(filled.filter((bar) => 'close' in bar)).toHaveLength(4);
    });

    it('fills one missing interval, and nothing when bars are contiguous', () => {
        const missing = [{ time: 0, close: 1 }, { time: 300, close: 2 }, { time: 900, close: 3 }];
        expect(withSessionBreaks(missing).map((bar) => bar.time)).toEqual([0, 300, 600, 900]);
        const tight = [{ time: 0, close: 1 }, { time: 300, close: 2 }, { time: 600, close: 3 }];
        expect(withSessionBreaks(tight)).toEqual(tight);
    });

    it('answers the same bars when there is nothing to fill', () => {
        const candles = [{ time: 0, close: 1 }, { time: 300, close: 2 }];
        expect(withSessionBreaks(candles)).toEqual(candles);
        expect(withSessionBreaks([])).toEqual([]);
    });
});

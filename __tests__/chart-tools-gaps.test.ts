import { describe, expect, it } from 'vitest';
import {
    anchoredVwapBands,
    hitTest,
    pointsNeeded,
    valueArea,
    volumeProfile,
    type DrawCandle,
    type Drawing,
} from '@/lib/chart/drawings';

const candles: DrawCandle[] = [
    { time: 1000, open: 100, high: 102, low: 99, close: 101, volume: 10 },
    { time: 2000, open: 101, high: 104, low: 100, close: 103, volume: 20 },
    { time: 3000, open: 103, high: 106, low: 102, close: 105, volume: 30 },
    { time: 4000, open: 105, high: 108, low: 104, close: 107, volume: 40 },
    { time: 5000, open: 107, high: 109, low: 106, close: 108, volume: 50 },
];

describe('cross is a one-click tool', () => {
    it('needs one point, like the horizontal ray and the vertical line', () => {
        expect(pointsNeeded('cross')).toBe(1);
        expect(pointsNeeded('hray')).toBe(1);
        expect(pointsNeeded('vline')).toBe(1);
    });
});

describe('hitTest geometry', () => {
    it('grabs a horizontal ray by its anchor', () => {
        const ray: Drawing = { id: 'h', tool: 'hray', points: [{ time: 0, price: 1 }] };
        expect(hitTest([ray], [[{ x: 40, y: 40 }]], { x: 42, y: 41 }, 6)?.id).toBe('h');
        expect(hitTest([ray], [[{ x: 40, y: 40 }]], { x: 80, y: 40 }, 6)).toBeNull();
    });

    it('grabs a vertical line by its anchor', () => {
        const line: Drawing = { id: 'v', tool: 'vline', points: [{ time: 0, price: 1 }] };
        expect(hitTest([line], [[{ x: 40, y: 40 }]], { x: 41, y: 90 }, 6)?.id).toBe('v');
    });

    it('grabs a cross by its anchor', () => {
        const cross: Drawing = { id: 'c', tool: 'cross', points: [{ time: 0, price: 1 }] };
        expect(hitTest([cross], [[{ x: 40, y: 40 }]], { x: 43, y: 38 }, 6)?.id).toBe('c');
    });

    it('grabs a channel along its rails, not anywhere in its box', () => {
        const channel: Drawing = {
            id: 'ch',
            tool: 'channel',
            points: [
                { time: 0, price: 1 },
                { time: 10, price: 1 },
                { time: 0, price: 2 },
            ],
        };
        const screen = [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 0, y: 50 },
        ];
        // On the base rail.
        expect(hitTest([channel], [screen], { x: 50, y: 2 }, 6)?.id).toBe('ch');
        // On the parallel rail (the base carried by the third point's offset).
        expect(hitTest([channel], [screen], { x: 0, y: 50 }, 6)?.id).toBe('ch');
        // In the middle of the box, away from both rails.
        expect(hitTest([channel], [screen], { x: 50, y: 25 }, 6)).toBeNull();
    });

    it('grabs a pitchfork along one of its three lines', () => {
        const fork: Drawing = {
            id: 'pf',
            tool: 'pitchfork',
            points: [
                { time: 0, price: 1 },
                { time: 10, price: 1 },
                { time: 5, price: 2 },
            ],
        };
        const screen = [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 50, y: 50 },
        ];
        // The Andrews median runs from the first point to the midpoint of the other two.
        expect(hitTest([fork], [screen], { x: 75, y: 25 }, 6)?.id).toBe('pf');
        // The lower parallel runs through the third point.
        expect(hitTest([fork], [screen], { x: 60, y: 55 }, 6)?.id).toBe('pf');
    });

    it('still grabs a rectangle by its edge only', () => {
        const rect: Drawing = { id: 'r', tool: 'rectangle', points: [{ time: 0, price: 1 }, { time: 10, price: 2 }] };
        const corners = [{ x: 0, y: 0 }, { x: 100, y: 50 }];
        expect(hitTest([rect], [corners], { x: 100, y: 25 }, 6)?.id).toBe('r');
        expect(hitTest([rect], [corners], { x: 50, y: 25 }, 6)).toBeNull();
    });
});

describe('valueArea', () => {
    it('returns the band around the point of control', () => {
        const rows = [
            { price: 105, volume: 1 },
            { price: 104, volume: 2 },
            { price: 103, volume: 10 },
            { price: 102, volume: 2 },
            { price: 101, volume: 1 },
        ];
        const area = valueArea(rows, 1, 0.7);
        expect(area).not.toBeNull();
        // The POC row alone is 10/16 = 62.5%; one neighbour takes it over 70%.
        expect(area!.percent).toBeGreaterThanOrEqual(70);
        expect(area!.high).toBeGreaterThan(area!.low);
    });

    it('returns null for an empty profile', () => {
        expect(valueArea([], 1)).toBeNull();
        expect(valueArea([{ price: 1, volume: 0 }], 1)).toBeNull();
    });
});

describe('volumeProfile value area', () => {
    it('reports the point of control and the value area', () => {
        const profile = volumeProfile(candles, 1000, 5000, 5);
        expect(profile.poc).not.toBeNull();
        expect(profile.valueArea).not.toBeNull();
        expect(profile.valueArea!.high).toBeGreaterThanOrEqual(profile.poc!);
        expect(profile.valueArea!.low).toBeLessThanOrEqual(profile.poc!);
    });

    it('reports nulls for an empty range', () => {
        const profile = volumeProfile(candles, 9000, 9500);
        expect(profile.poc).toBeNull();
        expect(profile.valueArea).toBeNull();
    });
});

describe('anchoredVwapBands', () => {
    it('wraps the VWAP in two symmetric bands', () => {
        const bands = anchoredVwapBands(candles, 1000);
        expect(bands).toHaveLength(5);
        for (const point of bands) {
            expect(point.upper1).toBeGreaterThanOrEqual(point.value);
            expect(point.lower1).toBeLessThanOrEqual(point.value);
            expect(point.upper2 - point.value).toBeCloseTo(point.value - point.lower2, 6);
            expect(point.upper2).toBeGreaterThanOrEqual(point.upper1);
        }
        // From the second bar on, the deviation is real and the outer band sits outside the inner.
        expect(bands[4].upper2).toBeGreaterThan(bands[4].upper1);
    });

    it('starts at the first bar at or after the anchor', () => {
        expect(anchoredVwapBands(candles, 2500).map((p) => p.time)).toEqual([3000, 4000, 5000]);
        expect(anchoredVwapBands(candles, 6000)).toEqual([]);
    });

    it('keeps the bands finite when every bar has the same price', () => {
        const flat = candles.map((candle) => ({ ...candle, open: 100, high: 100, low: 100, close: 100 }));
        const bands = anchoredVwapBands(flat, 1000);
        expect(bands[4].value).toBeCloseTo(100);
        expect(bands[4].upper2).toBeCloseTo(100);
        expect(bands[4].lower2).toBeCloseTo(100);
    });
});

import { describe, expect, it } from 'vitest';
import {
    distanceToSegment,
    fibPrices,
    handleIndex,
    hitTest,
    nearestTime,
    newDrawingId,
    parseDrawings,
    pointsNeeded,
    serializeDrawings,
    type Drawing,
} from '@/lib/chart-drawings';

const trend = (id: string, points: { time: number; price: number }[]): Drawing => ({ id, tool: 'trend', points });

describe('pointsNeeded', () => {
    it('asks for one click for a level or a label, two for anything drawn between points', () => {
        expect(pointsNeeded('horizontal')).toBe(1);
        expect(pointsNeeded('text')).toBe(1);
        expect(pointsNeeded('trend')).toBe(2);
        expect(pointsNeeded('rectangle')).toBe(2);
        expect(pointsNeeded('fib')).toBe(2);
    });
});

describe('fibPrices', () => {
    it('walks the levels from the anchor down to the far point', () => {
        const levels = fibPrices({ time: 0, price: 100 }, { time: 10, price: 200 });
        expect(levels.map((l) => l.level)).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
        expect(levels[0].price).toBe(100);
        expect(levels[3].price).toBe(150);
        expect(levels[6].price).toBe(200);
    });

    it('works downward too, which is how a retracement of a fall is drawn', () => {
        const levels = fibPrices({ time: 0, price: 200 }, { time: 10, price: 100 });
        expect(levels[6].price).toBe(100);
        expect(levels[3].price).toBe(150);
    });
});

describe('distanceToSegment', () => {
    it('measures the perpendicular distance, and the end distance beyond an end', () => {
        expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3);
        expect(distanceToSegment({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5);
    });

    it('handles a zero-length segment instead of dividing by zero', () => {
        expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5);
    });
});

describe('hitTest', () => {
    const near = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

    it('grabs a line the pointer is on and ignores one it is not', () => {
        const drawings = [trend('a', [{ time: 0, price: 1 }, { time: 10, price: 1 }])];
        expect(hitTest(drawings, [near], { x: 50, y: 4 }, 6)?.id).toBe('a');
        expect(hitTest(drawings, [near], { x: 50, y: 40 }, 6)).toBeNull();
    });

    it('picks the newest drawing when two overlap, because that is the one drawn on top', () => {
        const drawings = [trend('old', []), trend('new', [])];
        expect(hitTest(drawings, [near, near], { x: 50, y: 0 }, 6)?.id).toBe('new');
    });

    it('finds a rectangle by its edge, so its inside stays free for panning', () => {
        const rect: Drawing = { id: 'r', tool: 'rectangle', points: [{ time: 0, price: 1 }, { time: 10, price: 2 }] };
        const corners = [{ x: 0, y: 0 }, { x: 100, y: 50 }];
        expect(hitTest([rect], [corners], { x: 100, y: 25 }, 6)?.id).toBe('r');
        expect(hitTest([rect], [corners], { x: 50, y: 25 }, 6)).toBeNull();
    });

    it('ignores a drawing whose points could not be converted to pixels', () => {
        const drawings = [trend('a', [])];
        expect(hitTest(drawings, [[]], { x: 0, y: 0 }, 6)).toBeNull();
    });
});

describe('handleIndex', () => {
    it('reports which handle is being grabbed', () => {
        const points = [{ x: 0, y: 0 }, { x: 50, y: 50 }];
        expect(handleIndex(points, { x: 51, y: 52 }, 6)).toBe(1);
        expect(handleIndex(points, { x: 25, y: 25 }, 6)).toBeNull();
    });
});

describe('parseDrawings', () => {
    const good = trend('a', [{ time: 1, price: 2 }, { time: 3, price: 4 }]);

    it('round-trips what it stores', () => {
        expect(parseDrawings(serializeDrawings([good]))).toEqual([good]);
    });

    it('drops anything malformed instead of throwing, including bad JSON', () => {
        expect(parseDrawings(null)).toEqual([]);
        expect(parseDrawings('{not json')).toEqual([]);
        expect(parseDrawings('{"a":1}')).toEqual([]);
        expect(parseDrawings(JSON.stringify([good, { id: 'b', tool: 'blob', points: [] }]))).toEqual([good]);
        expect(parseDrawings(JSON.stringify([{ id: 'c', tool: 'trend', points: [{ time: 'no' }] }]))).toEqual([]);
        expect(parseDrawings(JSON.stringify([{ id: 'd', tool: 'trend', points: [{ time: 0, price: 1 }] }]))).toEqual([]);
    });

    it('keeps a label with its text', () => {
        const label: Drawing = { id: 'e', tool: 'text', points: [{ time: 1, price: 2 }], text: 'strike' };
        expect(parseDrawings(serializeDrawings([label]))[0].text).toBe('strike');
    });
});

describe('newDrawingId', () => {
    it('is different every time', () => {
        expect(newDrawingId()).not.toBe(newDrawingId());
    });
});

describe('nearestTime', () => {
    const bars = [100, 200, 300, 400, 500];

    it('has nothing to snap to without bars', () => {
        expect(nearestTime([], 300)).toBeNull();
    });

    it('keeps a time that is already a bar', () => {
        expect(nearestTime(bars, 300)).toBe(300);
    });

    it('snaps to the closer neighbour when the time falls between bars', () => {
        expect(nearestTime(bars, 260)).toBe(300);
        expect(nearestTime(bars, 240)).toBe(200);
    });

    it('clamps to the ends for a time outside the series', () => {
        expect(nearestTime(bars, 10)).toBe(100);
        expect(nearestTime(bars, 9999)).toBe(500);
    });

    it('handles a single bar', () => {
        expect(nearestTime([42], 999)).toBe(42);
    });
});

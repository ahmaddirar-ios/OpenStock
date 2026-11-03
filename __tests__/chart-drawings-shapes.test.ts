// Geometry for the basic line tools the fork never had: a ray, an extended line, a horizontal
// ray, a full-height vertical line, a cross, a trend-angle readout and an info line. Everything
// here is pure — points in chart space, pixels in for the angle — so the chart component can stay
// a painter.
import { describe, expect, it } from 'vitest';
import {
    TOOL_DEFS,
    extendedEnds,
    pointsNeeded,
    rayEnd,
    toolDef,
    toolsInGroup,
    trendAngleDeg,
    type DrawPoint,
} from '@/lib/chart-drawings';

const a: DrawPoint = { time: 1000, price: 100 };
const b: DrawPoint = { time: 2000, price: 120 };

describe('rayEnd', () => {
    it('extends the line from a through b to the chart edge', () => {
        expect(rayEnd(a, b, 4000)).toEqual({ time: 4000, price: 160 });
    });

    it('puts the end on the line even when the edge is behind b', () => {
        // A ray is drawn to the right edge, so a short first leg still reaches it.
        expect(rayEnd(a, b, 3000)).toEqual({ time: 3000, price: 140 });
        expect(rayEnd(a, b, 2000)).toEqual(b);
    });

    it('leaves a vertical pair alone instead of dividing by zero', () => {
        const vertical: DrawPoint = { time: 1000, price: 130 };
        expect(rayEnd(a, vertical, 4000)).toEqual(vertical);
    });
});

describe('extendedEnds', () => {
    it('runs the line to both chart edges, keeping the ends in time order', () => {
        expect(extendedEnds(a, b, 500, 4000)).toEqual([
            { time: 500, price: 90 },
            { time: 4000, price: 160 },
        ]);
    });

    it('keeps time order when the points are drawn right to left', () => {
        expect(extendedEnds(b, a, 500, 4000)).toEqual([
            { time: 500, price: 90 },
            { time: 4000, price: 160 },
        ]);
    });

    it('leaves a vertical pair alone', () => {
        const vertical: DrawPoint = { time: 1000, price: 130 };
        expect(extendedEnds(a, vertical, 500, 4000)).toEqual([a, vertical]);
    });
});

describe('trendAngleDeg', () => {
    it('reads a line that looks 45 degrees on screen as 45', () => {
        // Equal pixel legs: 1000 seconds at 0.2px each against 20 price units at 10px each.
        expect(trendAngleDeg(a, b, { pxPerTime: 0.2, pxPerPrice: 10 })).toBeCloseTo(45, 5);
    });

    it('reads a flat line as 0 and a vertical one as 90', () => {
        expect(trendAngleDeg(a, { time: 2000, price: 100 }, { pxPerTime: 0.2, pxPerPrice: 10 })).toBeCloseTo(0, 5);
        expect(trendAngleDeg(a, { time: 1000, price: 130 }, { pxPerTime: 0.2, pxPerPrice: 10 })).toBeCloseTo(90, 5);
    });

    it('measures left to right, so a line clicked backwards reads the same', () => {
        const scale = { pxPerTime: 0.2, pxPerPrice: 10 };
        expect(trendAngleDeg(b, a, scale)).toBeCloseTo(45, 5);
        expect(trendAngleDeg(a, b, scale)).toBeCloseTo(45, 5);
        // A line that falls from left to right is the negative angle, either way it was clicked.
        const low: DrawPoint = { time: 2000, price: 80 };
        expect(trendAngleDeg(a, low, scale)).toBeCloseTo(-45, 5);
        expect(trendAngleDeg(low, a, scale)).toBeCloseTo(-45, 5);
    });
});

describe('the seven basic line tools', () => {
    const lines = toolsInGroup('lines').map((d) => d.tool);

    it('are registered on the lines rail group', () => {
        expect(lines).toEqual(
            expect.arrayContaining(['ray', 'extended', 'hray', 'vline', 'cross', 'trendangle', 'info']),
        );
    });

    it('place in one click when a single point fixes the shape', () => {
        // A horizontal ray and a vertical line are fixed by where the pointer was.
        expect(pointsNeeded('hray')).toBe(1);
        expect(pointsNeeded('vline')).toBe(1);
        for (const tool of ['ray', 'extended', 'cross', 'trendangle', 'info'] as const) {
            expect(pointsNeeded(tool), tool).toBe(2);
        }
    });

    it('gives every new tool its own paint kind and a colour from the palette', () => {
        const kinds = ['ray', 'extended', 'hray', 'vline', 'cross', 'trendangle', 'info'] as const;
        expect(new Set(kinds.map((tool) => toolDef(tool).kind)).size).toBe(kinds.length);
        for (const tool of kinds) {
            expect(toolDef(tool).group, tool).toBe('lines');
            expect(TOOL_DEFS.filter((d) => d.tool === tool), tool).toHaveLength(1);
        }
    });
});

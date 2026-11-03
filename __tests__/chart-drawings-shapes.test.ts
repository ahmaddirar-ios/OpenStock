// Geometry for the basic line tools the fork never had: a ray, an extended line, a horizontal
// ray, a full-height vertical line, a cross, a trend-angle readout and an info line. Everything
// here is pure — points in chart space, pixels in for the angle — so the chart component can stay
// a painter.
import { describe, expect, it } from 'vitest';
import {
    TOOL_DEFS,
    extendedEnds,
    measureSpan,
    pointsNeeded,
    positionZones,
    projectionEnds,
    rangeReadout,
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

    it('follows the ray leftwards when the second point is to the left', () => {
        // A ray always runs away from its first point, so a leftward one reaches the left edge.
        expect(rayEnd({ time: 2000, price: 120 }, { time: 1000, price: 100 }, 500)).toEqual({ time: 500, price: 90 });
        // An edge behind that second point leaves the segment as it was clicked.
        expect(rayEnd({ time: 2000, price: 120 }, { time: 1000, price: 100 }, 1500)).toEqual({ time: 1000, price: 100 });
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

describe('positionZones', () => {
    const entry: DrawPoint = { time: 1000, price: 100 };

    it('sizes a long by its target and its stop', () => {
        const zones = positionZones(entry, { time: 2000, price: 110 }, { time: 1500, price: 96 });
        expect(zones.reward).toBeCloseTo(10, 6);
        expect(zones.risk).toBeCloseTo(4, 6);
        expect(zones.ratio).toBeCloseTo(2.5, 6);
        expect(zones.riskPercent).toBeCloseTo(4, 6);
    });

    it('reads a short the same way round, so the mirror position has the same ratio', () => {
        expect(positionZones(entry, { time: 2000, price: 90 }, { time: 1500, price: 104 }).ratio).toBeCloseTo(2.5, 6);
    });

    it('gives both zones the same time width, taken from the target', () => {
        // TradingView's position box is one box: dragging the stop sideways must not skew it.
        const zones = positionZones(entry, { time: 2000, price: 110 }, { time: 1400, price: 96 });
        expect(zones.profit).toEqual([entry, { time: 2000, price: 110 }]);
        expect(zones.loss).toEqual([entry, { time: 2000, price: 96 }]);
    });

    it('reports an un-bounded ratio when the stop sits on the entry', () => {
        expect(positionZones(entry, { time: 2000, price: 110 }, { time: 2000, price: 100 }).ratio).toBe(Infinity);
    });
});

describe('rangeReadout', () => {
    it('agrees with the price/time box about the move it measures', () => {
        const span = measureSpan(a, b);
        const readout = rangeReadout(a, b, 60);
        expect(readout.price).toBe(span.price);
        expect(readout.seconds).toBe(span.seconds);
        expect(readout.percent).toBeCloseTo(20, 6);
    });

    it('counts the bars the range covers for the interval on screen', () => {
        // 1000 seconds at one bar a minute is 17 bars.
        expect(rangeReadout(a, b, 60).bars).toBe(17);
        // An unknown interval length cannot count bars, and says so rather than guessing.
        expect(rangeReadout(a, b, 0).bars).toBe(0);
    });
});

describe('projectionEnds', () => {
    it('repeats the a→b move forward from b', () => {
        expect(projectionEnds(a, b, 1)).toEqual([b, { time: 3000, price: 140 }]);
        expect(projectionEnds(a, b, 2)).toEqual([b, { time: 4000, price: 160 }]);
    });

    it('falls back to the drawn move when asked for no projection', () => {
        expect(projectionEnds(a, b, 0)).toEqual([a, b]);
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

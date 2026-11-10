// Geometry for the basic line tools the fork never had: a ray, an extended line, a horizontal
// ray, a full-height vertical line, a cross, a trend-angle readout and an info line. Everything
// here is pure — points in chart space, pixels in for the angle — so the chart component can stay
// a painter.
import { describe, expect, it } from 'vitest';
import {
    anchoredVwap,
    annotationText,
    arcThrough,
    candlesBetween,
    carriesText,
    circleFrom,
    disjointChannel,
    doubleCurvePath,
    ellipseFrom,
    extendedEnds,
    FIB_SPIRAL_TURNS,
    fibArcRadii,
    fibChannelLevels,
    fibExtension,
    fibFanEnds,
    fibSpiralPoints,
    fibTimeMultiples,
    flattenLines,
    gannBoxGuides,
    gannFanEnds,
    ICON_GLYPHS,
    IMAGE_DATA_MAX,
    IMAGE_URL_MAX,
    isImageUrl,
    measureSpan,
    parseDrawings,
    pitchforkLines,
    pointsNeeded,
    polygonPoints,
    polylinePath,
    positionZones,
    priceLabel,
    projectionEnds,
    quadraticPath,
    rangeReadout,
    rayEnd,
    regressionChannel,
    rotatedRectCorners,
    serializeDrawings,
    speedFanEnds,
    TEXT_MAX,
    textLimit,
    TOOL_DEFS,
    toolDef,
    toolsInGroup,
    trendAngleDeg,
    volumeProfile,
    withText,
    type DrawCandle,
    type DrawPoint,
} from '@/lib/chart/drawings';

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

describe('the Fibonacci family', () => {
    // A 100 → 120 move, then a retracement to 110: the third point of an extension.
    const base: DrawPoint = { time: 1000, price: 100 };
    const top: DrawPoint = { time: 2000, price: 120 };
    const third: DrawPoint = { time: 1200, price: 110 };

    it('extends the base move beyond the retracement', () => {
        const levels = fibExtension(base, top, third, [1, 1.618, 2]);
        // 110 + 20 × ratio: the level sits above the third point by the base move's multiple.
        expect(levels.map((l) => l.price)).toEqual([130, 142.36, 150]);
        expect(levels.map((l) => l.ratio)).toEqual([1, 1.618, 2]);
    });

    it('fans the retracement ratios onto the vertical through the second point', () => {
        const ends = fibFanEnds(base, top, [0, 0.5, 1]);
        expect(ends.map((e) => e.end)).toEqual([
            { time: 2000, price: 100 },
            { time: 2000, price: 110 },
            { time: 2000, price: 120 },
        ]);
    });

    it('channels the base through the third point, one line per ratio', () => {
        const levels = fibChannelLevels(base, top, third, [0, 0.5, 1]);
        // Ratio 0 is the base itself; ratio 1 collapses onto the third point.
        expect(levels[0]).toEqual([
            { time: 1000, price: 100 },
            { time: 2000, price: 120 },
        ]);
        expect(levels[1]).toEqual([
            { time: 1100, price: 105 },
            { time: 1600, price: 115 },
        ]);
        expect(levels[2]).toEqual([
            { time: 1200, price: 110 },
            { time: 1200, price: 110 },
        ]);
    });

    it('walks the Fibonacci sequence forward for a time zone', () => {
        expect(fibTimeMultiples(6)).toEqual([1, 2, 3, 5, 8, 13]);
        expect(fibTimeMultiples(0)).toEqual([]);
    });

    it('sizes arcs from the two ends of the base move', () => {
        const radii = fibArcRadii({ x: 0, y: 0 }, { x: 100, y: -50 }, [0.5, 1]);
        expect(radii).toEqual([
            { ratio: 0.5, rx: 50, ry: 25 },
            { ratio: 1, rx: 100, ry: 50 },
        ]);
    });

    it('draws the speed fan at thirds of the move, out to the edge time', () => {
        const ends = speedFanEnds(base, top, 5000);
        // The base move is 20 over 1000 seconds; each ratio keeps that slope to the edge time.
        expect(ends.map((e) => e.ratio)).toEqual([1 / 3, 2 / 3, 1]);
        expect(ends.map((e) => Math.round(e.end.price))).toEqual([127, 153, 180]);
        // A vertical pair has no slope to fan.
        expect(speedFanEnds(base, { time: 1000, price: 130 }, 5000)).toEqual([]);
    });
});

describe('the geometric shapes', () => {
    it('builds an ellipse from the box its two corners make', () => {
        expect(ellipseFrom({ x: 100, y: 100 }, { x: 200, y: 160 })).toEqual({ cx: 150, cy: 130, rx: 50, ry: 30 });
    });

    it('builds a circle from its centre and one point on it', () => {
        // A 30/40/50 triangle: the radius is the distance between the two points.
        expect(circleFrom({ x: 100, y: 100 }, { x: 130, y: 140 })).toEqual({ cx: 100, cy: 100, r: 50 });
    });

    it('prints the point lists the SVG wants', () => {
        expect(polygonPoints([{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 150, y: 50 }])).toBe('100,100 200,100 150,50');
        expect(polylinePath([{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }])).toBe('M100,100 L200,100 L200,200');
    });

    it('curves through its middle point', () => {
        expect(quadraticPath({ x: 100, y: 100 }, { x: 200, y: 50 }, { x: 300, y: 100 })).toBe('M100,100 Q200,50 300,100');
        // A double curve is two of those, joined at the middle of the two handles.
        expect(
            doubleCurvePath({ x: 100, y: 100 }, { x: 150, y: 0 }, { x: 250, y: 200 }, { x: 300, y: 100 }),
        ).toBe('M100,100 Q150,0 200,100 Q250,200 300,100');
    });

    it('finds the circle three points sit on and draws the arc through them', () => {
        // Three points on the circle of radius 50 around the origin.
        expect(arcThrough({ x: 50, y: 0 }, { x: 0, y: -50 }, { x: -50, y: 0 })).toEqual({
            cx: 0,
            cy: 0,
            r: 50,
            path: 'M50,0 A 50 50 0 0 0 -50,0',
        });
        // Three points on one line have no circle to sit on.
        expect(arcThrough({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 })).toBeNull();
    });

    it('picks the arc that reaches the middle point, and the long way when it has to', () => {
        // a and c are ends of a diameter here, so the arc is exactly half the circle: it turns the
        // way b lies (sweep 1) and is not a large arc.
        const half = arcThrough({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 });
        expect(half?.r).toBeCloseTo(Math.hypot(50, 50), 6);
        expect(half?.path).toMatch(/^M0,0 A 70\.7106\d* 70\.7106\d* 0 0 1 100,100$/);

        // A tall b pushes the circle up, and the arc that reaches it goes the long way round:
        // centre (50, 200/3), radius 250/3, sweep 0 and large-arc 1.
        const long = arcThrough({ x: 0, y: 0 }, { x: 50, y: 150 }, { x: 100, y: 0 });
        expect(long?.cy).toBeCloseTo(200 / 3, 6);
        expect(long?.r).toBeCloseTo(250 / 3, 6);
        expect(long?.path).toMatch(/^M0,0 A 83\.33\d* 83\.33\d* 0 1 0 100,0$/);
    });
});

describe('the rotated rectangle and the Fibonacci spiral', () => {
    it('lifts the height off the base edge, squarely', () => {
        // A level base: the third point's height is straight up, so the corners form an upright box.
        const level = rotatedRectCorners({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: -40 });
        expect(level).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -40 }, { x: 0, y: -40 }]);
    });

    it('turns the box with its base, keeping the corners square', () => {
        // A base along the diagonal (0,0)->(100,100); the normal points up-right, height 50*sqrt2.
        const corners = rotatedRectCorners({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: -Math.SQRT2 * 50 });
        // First two corners are the base, unchanged.
        expect(corners[0]).toEqual({ x: 0, y: 0 });
        expect(corners[1]).toEqual({ x: 100, y: 100 });
        // Every corner is at right angles: the side vectors dot to zero.
        const side = { x: corners[1].x - corners[0].x, y: corners[1].y - corners[0].y };
        const rise = { x: corners[3].x - corners[0].x, y: corners[3].y - corners[0].y };
        expect(side.x * rise.x + side.y * rise.y).toBeCloseTo(0, 6);
        // Opposite sides are equal length.
        expect(Math.hypot(rise.x, rise.y)).toBeCloseTo(Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y), 6);
    });

    it('degrades safely when the two base points are the same', () => {
        const point = { x: 10, y: 10 };
        expect(rotatedRectCorners(point, { ...point }, { x: 20, y: 20 })).toEqual([point, { ...point }, { x: 20, y: 20 }]);
    });

    it('grows by the golden ratio every quarter turn', () => {
        const centre = { x: 0, y: 0 };
        const points = fibSpiralPoints(centre, { x: 10, y: 0 });
        // twelve steps to the turn, so one quarter-turn is twelve points along.
        const quarter = 12;
        const r = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);
        const phi = (1 + Math.sqrt(5)) / 2;
        expect(r(points[quarter]) / r(points[0])).toBeCloseTo(phi, 6);
        expect(r(points[quarter * 2]) / r(points[quarter])).toBeCloseTo(phi, 6);
        // First point sits on the edge, at angle 0.
        expect(points[0].x).toBeCloseTo(10, 6);
        expect(points[0].y).toBeCloseTo(0, 6);
        // The default run is eight turns of twelve steps, plus the closing point.
        expect(points).toHaveLength(FIB_SPIRAL_TURNS * 12 + 1);
    });

    it('has nothing to draw from a point centre or no turns', () => {
        expect(fibSpiralPoints({ x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([]);
        expect(fibSpiralPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toEqual([]);
    });
});

describe('an open-ended tool', () => {
    it('takes as many points as the trader clicks', () => {
        expect(pointsNeeded('polyline')).toBe(0);
    });

    it('keeps a stored stroke of any length, but not one too short to draw', () => {
        const stroke = (count: number) => [
            {
                id: 'p1',
                tool: 'polyline' as const,
                points: Array.from({ length: count }, (_, i) => ({ time: 1000 + i * 60, price: 100 + i })),
            },
        ];
        expect(parseDrawings(serializeDrawings(stroke(5)))).toHaveLength(1);
        expect(parseDrawings(serializeDrawings(stroke(2)))).toHaveLength(1);
        expect(parseDrawings(serializeDrawings(stroke(1)))).toHaveLength(0);
        // A fixed-count tool still has to match its own count exactly.
        expect(parseDrawings(JSON.stringify([{ id: 't1', tool: 'trend', points: [{ time: 1, price: 1 }] }]))).toHaveLength(0);
    });
});

describe('the cursors', () => {
    // Regression: arming the measure tool after an undo/redo re-rendered the rail hint, which asked
    // pointsNeeded('measure') and dereferenced an undefined tool definition — the pane crashed.
    it('report zero points instead of throwing when the chart asks how many clicks they need', () => {
        expect(() => pointsNeeded('measure')).not.toThrow();
        expect(() => pointsNeeded('select')).not.toThrow();
        expect(pointsNeeded('measure')).toBe(0);
        expect(pointsNeeded('select')).toBe(0);
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
        // A cross is complete at one point: the renderer draws both arms from it.
        expect(pointsNeeded('cross')).toBe(1);
        for (const tool of ['ray', 'extended', 'trendangle', 'info'] as const) {
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

describe('the annotation family', () => {
    it('knows which tools carry the trader’s own words', () => {
        // A note, a callout and a balloon are written by the trader; the price markers are not.
        for (const tool of ['text', 'callout', 'balloon', 'signpost', 'flag'] as const) {
            expect(carriesText(tool), tool).toBe(true);
        }
        for (const tool of ['trend', 'rectangle', 'pricenote', 'ellipse'] as const) {
            expect(carriesText(tool), tool).toBe(false);
        }
    });

    it('keeps the words of a callout through a save and a reload', () => {
        const stored = [
            { id: 'c1', tool: 'callout' as const, points: [{ time: 1000, price: 100 }, { time: 1600, price: 110 }], text: 'Breakout' },
            { id: 'f1', tool: 'flag' as const, points: [{ time: 1000, price: 100 }], text: 'Short here' },
        ];
        const back = parseDrawings(serializeDrawings(stored));
        expect(back.map((d) => d.text)).toEqual(['Breakout', 'Short here']);
    });

    it('drops the words a tool that has none would carry', () => {
        const back = parseDrawings(JSON.stringify([{ id: 't1', tool: 'trend', points: [{ time: 1, price: 1 }, { time: 2, price: 2 }], text: 'ignore me' }]));
        expect(back[0].text).toBeUndefined();
    });

    it('labels a price the way the chart prints it', () => {
        expect(priceLabel(9876.13)).toBe('9,876.13');
        expect(priceLabel(26.1)).toBe('26.10');
        expect(priceLabel(0)).toBe('0.00');
    });
});

describe('the words a new annotation carries', () => {
    it('takes what the trader typed for a note, a callout and a balloon', () => {
        expect(annotationText('callout', 100, 'Breakout')).toBe('Breakout');
        expect(annotationText('text', 100, 'watch the volume')).toBe('watch the volume');
        // An empty label is a blank box on the chart: the price stands in until it is edited.
        expect(annotationText('callout', 100, '   ')).toBe('100.00');
    });

    it('gives a price marker its own price, whatever the note field still held', () => {
        expect(annotationText('signpost', 100, 'Breakout above 26.30')).toBe('100.00');
        expect(annotationText('flag', 9876.13)).toBe('9,876.13');
    });

    it('carries nothing for a tool without words', () => {
        expect(annotationText('trend', 100, 'x')).toBeUndefined();
        expect(annotationText('pricenote', 100, 'x')).toBeUndefined();
    });

    it('keeps an uploaded picture as a data payload', () => {
        const data = 'data:image/png;base64,iVBORw0KGgo=';
        expect(annotationText('image', 100, data)).toBe(data);
        expect(annotationText('image', 100, 'https://example.com/a.png')).toBe('https://example.com/a.png');
    });
});

describe('the Gann and pitchfork family', () => {
    const a: DrawPoint = { time: 1000, price: 100 };
    const b: DrawPoint = { time: 2000, price: 120 };
    const c: DrawPoint = { time: 1600, price: 90 };

    it('fans the Gann angles out of the first point to the edge', () => {
        const ends = gannFanEnds(a, b, 4000);
        // The 1x1 is the clicked trend itself: 20 over 1000 seconds reaches 160 at 4000.
        expect(ends.find((e) => e.ratio === 1)?.end).toEqual({ time: 4000, price: 160 });
        // Half the slope reaches half as far above the pivot.
        expect(ends.find((e) => e.ratio === 0.5)?.end).toEqual({ time: 4000, price: 130 });
        expect(ends.map((e) => e.ratio)).toEqual([0.125, 0.25, 0.3333, 0.5, 1, 2, 3, 4, 8]);
    });

    it('boxes the Gann grid between two points', () => {
        const guides = gannBoxGuides(a, b);
        // The box is the two clicks; the diagonals run corner to corner; the 1x1 is one of the fan lines.
        expect(guides.corners).toEqual([{ time: 1000, price: 120 }, { time: 2000, price: 100 }]);
        expect(guides.diagonals).toEqual([
            [{ time: 1000, price: 100 }, { time: 2000, price: 120 }],
            [{ time: 1000, price: 120 }, { time: 2000, price: 100 }],
        ]);
        expect(guides.fan.find((line) => line.ratio === 1)).toBeTruthy();
    });

    it('draws Andrews pitchfork as a median through the middle of the last two points', () => {
        const lines = pitchforkLines(a, b, c, 'andrews');
        // The median starts at a and passes through the midpoint of b and c.
        expect(lines.median[0]).toEqual(a);
        expect(lines.median[1].time).toBeCloseTo(1800, 6);
        expect(lines.median[1].price).toBeCloseTo(105, 6);
        // The parallels run through b and through c, with the median's slope.
        expect(lines.upper[0]).toEqual(b);
        expect(lines.lower[0]).toEqual(c);
        expect(lines.upper[1].price - b.price).toBeCloseTo(lines.median[1].price - a.price, 6);
    });

    it('moves the pivot for the Schiff variants, as the names promise', () => {
        const schiff = pitchforkLines(a, b, c, 'schiff');
        expect(schiff.median[0]).toEqual({ time: 1000, price: 110 });
        const modified = pitchforkLines(a, b, c, 'modified');
        expect(modified.median[0]).toEqual({ time: 1500, price: 110 });
        // Inside takes the midpoint of the first two points as its pivot.
        const inside = pitchforkLines(a, b, c, 'inside');
        expect(inside.median[0]).toEqual({ time: 1500, price: 110 });
        expect(inside.median[1].time).toBeGreaterThan(inside.median[0].time);
    });

    it('fits a regression channel through the candles it is given', () => {
        // A perfect line: every close sits on price = 100 + 0.01 × (time - 1000).
        const candles = Array.from({ length: 11 }, (_, i) => ({ time: 1000 + i * 100, close: 100 + i }));
        const channel = regressionChannel(a, { time: 2000, price: 110 }, candles);
        expect(channel.slope).toBeCloseTo(0.01, 6);
        expect(channel.line[0].price).toBeCloseTo(100, 6);
        expect(channel.line[1].price).toBeCloseTo(110, 6);
        // A perfect fit has no spread, so the bands collapse onto the line.
        expect(channel.sigma).toBeCloseTo(0, 6);
        expect(channel.upper[1].price).toBeCloseTo(110, 6);
    });

    it('flattens the two prices across the panel width', () => {
        const lines = flattenLines(a, b);
        expect(lines.top).toEqual([{ time: 1000, price: 120 }, { time: 2000, price: 120 }]);
        expect(lines.bottom).toEqual([{ time: 1000, price: 100 }, { time: 2000, price: 100 }]);
    });

    it('offsets a disjoint channel by the third point', () => {
        const lines = disjointChannel(a, b, c);
        // The base is the first two points; the parallel is the same move, shifted so it passes through c.
        expect(lines.base).toEqual([a, b]);
        expect(lines.parallel).toEqual([
            { time: 1600, price: 90 },
            { time: 2600, price: 110 },
        ]);
    });
});

describe('the volume-based tools', () => {
    // Five hourly bars: rising prices, so a VWAP from the first bar sits under the last close.
    const candles: DrawCandle[] = [
        { time: 1000, open: 100, high: 102, low: 99, close: 101, volume: 10 },
        { time: 2000, open: 101, high: 104, low: 100, close: 103, volume: 20 },
        { time: 3000, open: 103, high: 106, low: 102, close: 105, volume: 30 },
        { time: 4000, open: 105, high: 108, low: 104, close: 107, volume: 40 },
        { time: 5000, open: 107, high: 109, low: 106, close: 108, volume: 50 },
    ];

    it('takes the candles inside a range', () => {
        expect(candlesBetween(candles, 2000, 4000).map((c) => c.time)).toEqual([2000, 3000, 4000]);
        expect(candlesBetween(candles, 4000, 2000).map((c) => c.time)).toEqual([2000, 3000, 4000]);
        expect(candlesBetween(candles, 9000, 9500)).toEqual([]);
    });

    it('averages the typical price by volume from its anchor forward', () => {
        const line = anchoredVwap(candles, 1000);
        expect(line).toHaveLength(5);
        expect(line.map((p) => p.time)).toEqual([1000, 2000, 3000, 4000, 5000]);
        // The first bar is its own VWAP: (102 + 99 + 101) / 3.
        expect(line[0].value).toBeCloseTo(100.6667, 3);
        // Later bars are pulled up by the rising prices, and stay under each close.
        expect(line[4].value).toBeGreaterThan(line[0].value);
        expect(line[4].value).toBeLessThan(108);
    });

    it('counts a bar with no volume, so the line keeps moving', () => {
        // A feed that reports no volume at all: the line becomes the average of the typical prices.
        const quiet = candles.map((candle) => ({ ...candle, volume: 0 }));
        const line = anchoredVwap(quiet, 1000);
        expect(line).toHaveLength(5);
        expect(line[4].value).toBeGreaterThan(line[3].value);
    });

    it('starts at the first bar at or after the anchor', () => {
        expect(anchoredVwap(candles, 2500).map((p) => p.time)).toEqual([3000, 4000, 5000]);
        expect(anchoredVwap(candles, 6000)).toEqual([]);
    });

    it('counts a range into price rows, highest first', () => {
        const profile = volumeProfile(candles, 1000, 5000, 5);
        expect(profile.rows).toHaveLength(5);
        expect(profile.max).toBeGreaterThan(0);
        // Rows run high → low, and the top row is the band around the highest prices touched.
        const prices = profile.rows.map((row) => row.price);
        expect([...prices].sort((a, b) => b - a)).toEqual(prices);
        // The top row is the band around the highest price touched (109), so its midpoint is 108.
        expect(prices[0]).toBeCloseTo(108, 6);
        // Every candle's volume is in the profile, spread over the rows it spans.
        const total = profile.rows.reduce((sum, row) => sum + row.volume, 0);
        expect(total).toBeCloseTo(150, 6);
    });

    it('returns an empty profile rather than dividing by nothing', () => {
        expect(volumeProfile(candles, 9000, 9500).rows).toEqual([]);
        expect(volumeProfile([], 0, 1).max).toBe(0);
    });

    it('sizes the value area by the percentage a study asks for', () => {
        const wide = volumeProfile(candles, 1000, 5000, 24, 0.95);
        const narrow = volumeProfile(candles, 1000, 5000, 24, 0.5);
        expect(wide.valueArea!.percent).toBeGreaterThan(narrow.valueArea!.percent);
        // Nothing can hold more than all of it.
        expect(volumeProfile(candles, 1000, 5000, 24, 1).valueArea!.percent).toBeLessThanOrEqual(100);
    });
});

describe('the sticker and the pasted image', () => {
    it('seeds a sticker with the first glyph', () => {
        expect(annotationText('icon', 100)).toBe(ICON_GLYPHS[0]);
        expect(annotationText('icon', 100, '⚑')).toBe('⚑');
    });

    it('leaves an image blank until an address is pasted, and never seeds it with a price', () => {
        expect(annotationText('image', 100)).toBeUndefined();
        expect(annotationText('image', 100, 'https://example.com/a.png')).toBe('https://example.com/a.png');
    });

    it('only accepts a plain web address for an image', () => {
        expect(isImageUrl('https://example.com/a.png')).toBe(true);
        expect(isImageUrl('http://example.com/a.png')).toBe(true);
        // An uploaded picture is a data payload, and it is allowed; a local path is not.
        expect(isImageUrl('data:image/png;base64,AAAA')).toBe(true);
        expect(isImageUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
        expect(isImageUrl('data:text/html;base64,AAAA')).toBe(false);
        expect(isImageUrl('/tmp/a.png')).toBe(false);
        expect(isImageUrl('javascript:alert(1)')).toBe(false);
        expect(isImageUrl('https://example.com/a b.png')).toBe(false);
    });
});

describe('how much wording a tool may keep', () => {
    it('lets an image keep a real URL, which is longer than a note', () => {
        const url = `https://example.com/${'x'.repeat(120)}.png`;
        expect(url.length).toBeGreaterThan(TEXT_MAX);
        expect(annotationText('image', 100, url)).toBe(url);
        // The same wording on a note is refused, so the note falls back to its price.
        expect(annotationText('text', 100, url)).toBe('100.00');
    });

    it('keeps an address when it is edited, and still refuses a wording that is too long', () => {
        const url = `https://example.com/${'y'.repeat(120)}.png`;
        const image = { id: 'i1', tool: 'image' as const, points: [{ time: 1, price: 1 }] };
        expect(withText(image, url).text).toBe(url);
        expect(withText({ ...image, tool: 'text' as const }, `too long ${'z'.repeat(200)}`).text).toBeUndefined();
    });

    it('bounds the limit by the tool', () => {
        expect(textLimit('image')).toBe(IMAGE_DATA_MAX);
        expect(textLimit('text')).toBe(TEXT_MAX);
        // A typed address is still short; the data payload is the reason the image cap is large.
        expect(IMAGE_URL_MAX).toBeLessThan(IMAGE_DATA_MAX);
    });
});

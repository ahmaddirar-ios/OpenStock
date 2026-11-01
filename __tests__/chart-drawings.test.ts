import { describe, expect, it } from 'vitest';
import {
    COLOR_KEYS,
    COUNT_GLYPHS,
    COUNT_OPTIONS,
    COUNT_TOOL,
    DRAWING_COLORS,
    FIB_RATIOS,
    MAX_DRAWINGS,
    TEXT_MAX,
    TOOL_DEFS,
    TRANSFER_VERSION,
    buildTransferPayload,
    cleanText,
    cycleIndices,
    distanceToSegment,
    drawingColor,
    fibLevels,
    gannGuides,
    handleIndex,
    hitTest,
    isColorKey,
    labelsFor,
    mergeDrawings,
    nearestTime,
    newDrawingId,
    nextColor,
    parseDrawings,
    parseTransferPayload,
    pointsNeeded,
    serializeDrawings,
    sinePoints,
    toolDef,
    toolsInGroup,
    withPoint,
    withText,
    type Drawing,
} from '@/lib/chart-drawings';

const trend = (id: string, points: { time: number; price: number }[]): Drawing => ({ id, tool: 'trend', points });

describe('the tool registry', () => {
    it('asks for one click for a level or a label, two for a line, and the declared count for a pattern', () => {
        expect(pointsNeeded('horizontal')).toBe(1);
        expect(pointsNeeded('text')).toBe(1);
        expect(pointsNeeded('trend')).toBe(2);
        expect(pointsNeeded('rectangle')).toBe(2);
        expect(pointsNeeded('fib')).toBe(2);
        expect(pointsNeeded('gann')).toBe(2);
        expect(pointsNeeded('abcd')).toBe(4);
        expect(pointsNeeded('xabcd')).toBe(5);
        expect(pointsNeeded('hs')).toBe(5);
        expect(pointsNeeded('triangle')).toBe(4);
        expect(pointsNeeded('ew-impulse')).toBe(6);
        expect(pointsNeeded('ew-abc')).toBe(4);
        expect(pointsNeeded('ew-triangle')).toBe(6);
        expect(pointsNeeded('ew-double')).toBe(4);
        expect(pointsNeeded('ew-triple')).toBe(6);
        expect(pointsNeeded('ew-count')).toBe(5);
        expect(pointsNeeded('ew-count-abc')).toBe(3);
        expect(pointsNeeded('cycles')).toBe(2);
        expect(pointsNeeded('sine')).toBe(2);
    });

    it('every tool belongs to a group that is offered in the interface', () => {
        for (const group of ['lines', 'patterns', 'elliott', 'counts', 'cycles'] as const) {
            expect(toolsInGroup(group).length).toBeGreaterThan(0);
        }
        expect(toolsInGroup('lines').map((d) => d.tool)).toEqual(['trend', 'horizontal', 'rectangle', 'fib', 'gann', 'text']);
        expect(toolsInGroup('patterns').map((d) => d.tool)).toEqual(['xabcd', 'cypher', 'hs', 'abcd', 'triangle', 'drives3']);
        expect(toolsInGroup('cycles').map((d) => d.tool)).toEqual(['cycles', 'sine']);
    });

    it('pattern glyph labels line up with the number of points the tool places', () => {
        for (const def of TOOL_DEFS) {
            if (!def.pointLabels) continue;
            expect(def.pointLabels).toHaveLength(def.clicks);
        }
    });
});

describe('colours', () => {
    it('starts at the first palette colour and wraps round', () => {
        expect(nextColor()).toBe(COLOR_KEYS[0]);
        expect(nextColor(COLOR_KEYS[0])).toBe(COLOR_KEYS[1]);
        expect(nextColor(COLOR_KEYS[COLOR_KEYS.length - 1])).toBe(COLOR_KEYS[0]);
    });

    it('recognises only palette keys', () => {
        expect(isColorKey('teal')).toBe(true);
        expect(isColorKey('#26A69A')).toBe(false);
        expect(isColorKey('chartreuse')).toBe(false);
    });

    it('paints a drawing with its own colour, or its tool default when it has none', () => {
        expect(drawingColor({ tool: 'fib' })).toBe(DRAWING_COLORS.gold);
        expect(drawingColor({ tool: 'fib', color: 'red' })).toBe(DRAWING_COLORS.red);
        expect(drawingColor({ tool: 'gann' })).toBe(DRAWING_COLORS.violet);
    });
});

describe('fibLevels', () => {
    it('walks the full retracement and extension set', () => {
        const levels = fibLevels({ time: 0, price: 100 }, { time: 10, price: 200 });
        expect(levels.map((l) => l.ratio)).toEqual([...FIB_RATIOS]);
        expect(levels[0].price).toBe(200);
        expect(levels.find((l) => l.ratio === 0.5)?.price).toBe(150);
        expect(levels.find((l) => l.ratio === 1)?.price).toBe(100);
    });

    it('projects extensions past the far point in the direction of the move', () => {
        const up = fibLevels({ time: 0, price: 100 }, { time: 10, price: 200 });
        expect(up.find((l) => l.ratio === 1.618)?.price).toBeCloseTo(200 + 100 * 0.618);
        const down = fibLevels({ time: 0, price: 200 }, { time: 10, price: 100 });
        expect(down.find((l) => l.ratio === 1.618)?.price).toBeCloseTo(100 - 100 * 0.618);
    });

    it('works for a flat range without dividing by zero', () => {
        const levels = fibLevels({ time: 0, price: 50 }, { time: 5, price: 50 });
        expect(levels.every((l) => l.price === 50)).toBe(true);
    });
});

describe('gannGuides', () => {
    it('describes the box through the two anchors and its mid price', () => {
        const { corners, midPrice } = gannGuides({ time: 1, price: 100 }, { time: 5, price: 200 });
        expect(corners).toEqual([
            { time: 1, price: 100 },
            { time: 5, price: 100 },
            { time: 5, price: 200 },
            { time: 1, price: 200 },
        ]);
        expect(midPrice).toBe(150);
    });
});

describe('cycleIndices', () => {
    it('repeats the anchor distance forwards and backwards', () => {
        expect(cycleIndices(100, 10, 15)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
    });

    it('drops indices outside the series and refuses a backwards or empty span', () => {
        expect(cycleIndices(12, 10, 15)).toEqual([0, 5, 10]);
        expect(cycleIndices(100, 20, 10)).toEqual([]);
        expect(cycleIndices(100, 20, 20)).toEqual([]);
        expect(cycleIndices(0, 1, 2)).toEqual([]);
    });
});

describe('sinePoints', () => {
    it('runs a wave from the first anchor through the second and on to the right edge', () => {
        const points = sinePoints({ x: 0, y: 100 }, { x: 40, y: 80 }, 200);
        expect(points.length).toBeGreaterThan(2);
        expect(points[0]).toEqual({ x: 0, y: 100 });
        expect(points[points.length - 1].x).toBeLessThanOrEqual(200);
        // The wave swings above and below the middle of the two anchors.
        expect(Math.min(...points.map((p) => p.y))).toBeLessThan(90);
        expect(Math.max(...points.map((p) => p.y))).toBeGreaterThan(90);
    });

    it('gives nothing for a zero-width span instead of dividing by zero', () => {
        expect(sinePoints({ x: 10, y: 0 }, { x: 12, y: 0 }, 200)).toEqual([]);
    });
});

describe('counts', () => {
    it('has a glyph set per degree and kind, matching the clicks the tool needs', () => {
        expect(COUNT_GLYPHS.major.impulse).toEqual(['I', 'II', 'III', 'IV', 'V']);
        expect(COUNT_GLYPHS.minor.correction).toEqual(['A', 'B', 'C']);
        expect(COUNT_GLYPHS.minute.impulse).toEqual(['i', 'ii', 'iii', 'iv', 'v']);
        for (const { degree, kind } of COUNT_OPTIONS) {
            expect(COUNT_GLYPHS[degree][kind]).toHaveLength(pointsNeeded(COUNT_TOOL[kind]));
        }
        expect(COUNT_OPTIONS).toHaveLength(6);
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

    it('finds a polyline pattern along any of its legs', () => {
        const wave: Drawing = {
            id: 'w',
            tool: 'ew-impulse',
            points: [0, 1, 2, 3, 4, 5].map((i) => ({ time: i, price: i })),
        };
        const screen = [0, 1, 2, 3, 4, 5].map((i) => ({ x: i * 20, y: 0 }));
        expect(hitTest([wave], [screen], { x: 45, y: 3 }, 6)?.id).toBe('w');
        expect(hitTest([wave], [screen], { x: 45, y: 30 }, 6)).toBeNull();
    });

    it('finds a vertical cycle by its column anywhere down the chart', () => {
        const cycles: Drawing = { id: 'c', tool: 'cycles', points: [{ time: 0, price: 0 }, { time: 1, price: 0 }] };
        const screen = [{ x: 40, y: 10 }, { x: 90, y: 20 }];
        expect(hitTest([cycles], [screen], { x: 92, y: 400 }, 6)?.id).toBe('c');
        expect(hitTest([cycles], [screen], { x: 300, y: 400 }, 6)).toBeNull();
    });

    it('finds a sine wave by its anchors', () => {
        const sine: Drawing = { id: 's', tool: 'sine', points: [{ time: 0, price: 0 }, { time: 1, price: 1 }] };
        const screen = [{ x: 10, y: 10 }, { x: 60, y: 4 }];
        expect(hitTest([sine], [screen], { x: 12, y: 12 }, 6)?.id).toBe('s');
        expect(hitTest([sine], [screen], { x: 35, y: 40 }, 6)).toBeNull();
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

describe('notes', () => {
    it('collapses whitespace, and refuses empty or runaway text', () => {
        expect(cleanText('  buy   the   dip ')).toBe('buy the dip');
        expect(cleanText('   ')).toBeNull();
        expect(cleanText(7)).toBeNull();
        expect(cleanText('x'.repeat(TEXT_MAX + 1))).toBeNull();
        expect(cleanText('x'.repeat(TEXT_MAX))).toHaveLength(TEXT_MAX);
    });

    it('rewrites a note, and leaves it alone when the new text is unusable', () => {
        const note: Drawing = { id: 'n', tool: 'text', points: [{ time: 1, price: 2 }], text: 'old' };
        expect(withText(note, ' new  text ').text).toBe('new text');
        expect(withText(note, '')).toEqual(note);
        expect(withText(note, null)).toEqual(note);
    });

    it('moves one point and leaves the others where they were', () => {
        const line: Drawing = { id: 'l', tool: 'trend', points: [{ time: 1, price: 1 }, { time: 2, price: 2 }] };
        expect(withPoint(line, 1, { time: 9, price: 9 }).points).toEqual([{ time: 1, price: 1 }, { time: 9, price: 9 }]);
    });

    it('prints a shape\u2019s own glyphs when it has them, else the tool\u2019s', () => {
        expect(labelsFor({ id: 'a', tool: 'abcd', points: [] })).toEqual(['A', 'B', 'C', 'D']);
        expect(labelsFor({ id: 'b', tool: 'ew-count', points: [], labels: ['I', 'II'] })).toEqual(['I', 'II']);
        expect(labelsFor({ id: 'c', tool: 'trend', points: [] })).toEqual([]);
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

    it('keeps new tools, their glyphs and their colour', () => {
        const count: Drawing = { id: 'f', tool: 'ew-count', points: [1, 2, 3, 4, 5].map((i) => ({ time: i, price: i })), labels: ['I', 'II', 'III', 'IV', 'V'], color: 'gold' };
        const [stored] = parseDrawings(serializeDrawings([count]));
        expect(stored.labels).toEqual(['I', 'II', 'III', 'IV', 'V']);
        expect(stored.color).toBe('gold');
        expect(drawingColor(stored)).toBe(DRAWING_COLORS.gold);
    });

    it('drops a colour that is not a palette key but keeps the drawing', () => {
        const odd = { ...trend('g', [{ time: 1, price: 2 }, { time: 3, price: 4 }]), color: '#123456' };
        const [stored] = parseDrawings(JSON.stringify([odd]));
        expect(stored.color).toBeUndefined();
        expect(drawingColor(stored)).toBe(DRAWING_COLORS.blue);
    });

    it('drops a drawing whose point count no longer matches its tool', () => {
        expect(parseDrawings(JSON.stringify([{ id: 'h', tool: 'abcd', points: [{ time: 1, price: 2 }] }]))).toEqual([]);
    });

    it('caps how many drawings are kept', () => {
        const many = Array.from({ length: MAX_DRAWINGS + 25 }, (_, i) => trend(`t${i}`, [{ time: i, price: 1 }, { time: i + 1, price: 2 }]));
        expect(parseDrawings(serializeDrawings(many))).toHaveLength(MAX_DRAWINGS);
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

describe('transfer', () => {
    const shapes = [
        trend('a', [{ time: 1, price: 2 }, { time: 3, price: 4 }]),
        { id: 'p', tool: 'abcd', points: [1, 2, 3, 4].map((i) => ({ time: i, price: i })), color: 'teal' } as Drawing,
    ];

    it('round-trips a chart\u2019s shapes', () => {
        const payload = buildTransferPayload('2222.SR', shapes);
        expect(payload.v).toBe(TRANSFER_VERSION);
        const parsed = parseTransferPayload(JSON.stringify(payload));
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
            expect(parsed.symbol).toBe('2222.SR');
            expect(parsed.drawings).toEqual(shapes);
        }
    });

    it('rejects a payload that is not ours, or nothing at all', () => {
        expect(parseTransferPayload('not json')).toEqual({ ok: false, error: 'not-json' });
        expect(parseTransferPayload(JSON.stringify({ hello: 'world' }))).toEqual({ ok: false, error: 'not-transfer' });
        expect(parseTransferPayload(JSON.stringify({ app: 'openstock', kind: 'chart-transfer', v: 99, symbol: 'X' }))).toEqual({
            ok: false,
            error: 'version',
        });
        expect(parseTransferPayload(JSON.stringify({ app: 'openstock', kind: 'chart-transfer', v: TRANSFER_VERSION, symbol: '' }))).toEqual({
            ok: false,
            error: 'no-source',
        });
    });

    it('drops malformed entries inside an otherwise valid payload', () => {
        const payload = { ...buildTransferPayload('X', shapes), drawings: [...shapes, { id: 'bad', tool: 'nope', points: [] }] };
        const parsed = parseTransferPayload(JSON.stringify(payload));
        expect(parsed.ok).toBe(true);
        if (parsed.ok) expect(parsed.drawings).toEqual(shapes);
    });

    it('merges an imported set over the current one, replacing the same ids', () => {
        const current = [trend('a', [{ time: 1, price: 1 }, { time: 2, price: 2 }]), trend('keep', [{ time: 1, price: 1 }, { time: 2, price: 2 }])];
        const incoming = [trend('a', [{ time: 5, price: 5 }, { time: 6, price: 6 }])];
        const merged = mergeDrawings(current, incoming);
        expect(merged.map((d) => d.id).sort()).toEqual(['a', 'keep']);
        expect(merged.find((d) => d.id === 'a')?.points[0]).toEqual({ time: 5, price: 5 });
    });
});

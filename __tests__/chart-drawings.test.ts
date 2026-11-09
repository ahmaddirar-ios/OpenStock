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
    arrowHeadPoints,
    buildTransferPayload,
    channelRails,
    cleanText,
    cloneDrawing,
    cycleIndices,
    dashOf,
    distanceToSegment,
    drawingColor,
    fibLevels,
    fibWedgeLines,
    gannGuides,
    gannSquareFixedCorner,
    GANN_SQUARE_FIXED_SIDE,
    handleIndex,
    hitTest,
    isColorKey,
    labelsFor,
    measureSpan,
    mergeDrawings,
    nearestTime,
    newDrawingId,
    nextColor,
    parseDrawings,
    parseTransferPayload,
    pointsNeeded,
    readStayDrawing,
    serializeDrawings,
    sinePoints,
    strokeWidthOf,
    TABLE_MAX,
    tableGrid,
    tableGridText,
    textLimit,
    toolDef,
    toolsInGroup,
    type Drawing,
    withPoint,
    withText,
    writeStayDrawing,
} from '@/lib/chart/drawings';

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
        for (const group of ['lines', 'fib', 'gann', 'patterns', 'elliott', 'shapes', 'annotation', 'brush'] as const) {
            expect(toolsInGroup(group).length).toBeGreaterThan(0);
        }
        expect(toolsInGroup('lines').map((d) => d.tool)).toEqual([
            'trend',
            'horizontal',
            'rectangle',
            'xrect',
            'channel',
            'arrow',
            'pricetime',
            'ray',
            'extended',
            'hray',
            'vline',
            'cross',
            'trendangle',
            'info',
        ]);
        expect(toolsInGroup('fib').map((d) => d.tool)).toContain('fib');
        expect(toolsInGroup('fib').map((d) => d.tool)).toContain('fibwedge');
        // The note, the annotation family, and the sticker and image that behave like them.
        expect(toolsInGroup('annotation').map((d) => d.tool)).toEqual([
            'text',
            'callout',
            'balloon',
            'signpost',
            'flag',
            'pricenote',
            'table',
            'icon',
            'image',
        ]);
        expect(toolsInGroup('patterns').map((d) => d.tool)).toEqual(['xabcd', 'cypher', 'hs', 'abcd', 'triangle', 'drives3', 'wolfe']);
        // The Gann flyout holds the angles, the pitchforks, the measured channels and the cycles,
        // in the order they sit in the registry (and so in the flyout). The original `gann` tool is
        // retired (hidden) now that the richer gannbox replaced it.
        expect(toolsInGroup('gann').map((d) => d.tool)).toEqual([
            'gannfan',
            'gannbox',
            'gannsquare',
            'gannsquarefixed',
            'pitchfork',
            'schiffpitchfork',
            'modpitchfork',
            'insidepitchfork',
            'regression',
            'flattop',
            'disjoint',
            'cycles',
            'sine',
        ]);
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

describe('fibWedgeLines', () => {
    it('runs every ratio from the apex to its point on the base line', () => {
        const lines = fibWedgeLines({ time: 0, price: 100 }, { time: 10, price: 200 }, { time: 20, price: 0 });
        expect(lines).toHaveLength(FIB_RATIOS.length);
        // The first line ends at the near end of the base; the ratio-1 line lands on the far end.
        expect(lines[0][0]).toEqual({ time: 20, price: 0 });
        expect(lines[0][1]).toEqual({ time: 0, price: 100 });
        const atOne = lines[FIB_RATIOS.indexOf(1)][1];
        expect(atOne).toEqual({ time: 10, price: 200 });
        // Ratios past 1 reach beyond the far end of the base.
        expect(lines[lines.length - 1][1].time).toBeGreaterThan(10);
        // Every line starts at the same apex, which is what makes it converge.
        for (const [from] of lines) expect(from).toEqual({ time: 20, price: 0 });
    });
});

describe('gannSquareFixedCorner', () => {
    it('keeps one side whatever the drag, and only follows the quadrant', () => {
        const a = { x: 100, y: 100 };
        const near = gannSquareFixedCorner(a, { x: 110, y: 110 });
        const far = gannSquareFixedCorner(a, { x: 500, y: 500 });
        expect(near).toEqual(far);
        expect(far).toEqual({ x: 100 + GANN_SQUARE_FIXED_SIDE, y: 100 + GANN_SQUARE_FIXED_SIDE });
        // A drag up and to the left grows the square that way instead.
        const back = gannSquareFixedCorner(a, { x: 20, y: 20 });
        expect(back).toEqual({ x: 100 - GANN_SQUARE_FIXED_SIDE, y: 100 - GANN_SQUARE_FIXED_SIDE });
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

    it('also finds a box anywhere on its surface when the caller asks for it', () => {
        // A right-click cannot pan, so the box as a whole is the target there.
        const rect: Drawing = { id: 'r', tool: 'rectangle', points: [{ time: 0, price: 1 }, { time: 10, price: 2 }] };
        const corners = [{ x: 0, y: 0 }, { x: 100, y: 50 }];
        expect(hitTest([rect], [corners], { x: 50, y: 25 }, 6, undefined, true)?.id).toBe('r');
        expect(hitTest([rect], [corners], { x: 160, y: 25 }, 6, undefined, true)).toBeNull();
        // A line is still a line: the surface flag only opens up the boxes.
        const line: Drawing = { id: 'l', tool: 'trend', points: [{ time: 0, price: 1 }, { time: 10, price: 2 }] };
        expect(hitTest([line], [[{ x: 0, y: 0 }, { x: 100, y: 100 }]], { x: 50, y: 10 }, 6, undefined, true)).toBeNull();
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

    it('clones with a new id, an offset and no lock', () => {
        const source: Drawing = {
            id: 'a',
            tool: 'trend',
            points: [{ time: 1, price: 2 }, { time: 3, price: 4 }],
            labels: ['A', 'B'],
            color: 'gold',
            width: 3,
            dash: 'dashed',
            locked: true,
        };
        const copy = cloneDrawing(source, 'b', { time: 5, price: 1 });
        expect(copy.id).toBe('b');
        expect(copy.points).toEqual([{ time: 6, price: 3 }, { time: 8, price: 5 }]);
        expect(copy.labels).toEqual(['A', 'B']);
        expect(copy.labels).not.toBe(source.labels);
        expect(copy.locked).toBeUndefined();
        expect(copy.color).toBe('gold');
        expect(copy.width).toBe(3);
        expect(copy.dash).toBe('dashed');
        expect(source.points[0]).toEqual({ time: 1, price: 2 });
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

    it('keeps a stroke width and dash, and refuses values it cannot draw', () => {
        const styled: Drawing = { id: 's', tool: 'trend', points: [{ time: 1, price: 2 }, { time: 3, price: 4 }], width: 3, dash: 'dotted' };
        const [kept] = parseDrawings(serializeDrawings([styled]));
        expect(kept.width).toBe(3);
        expect(kept.dash).toBe('dotted');
        const [bad] = parseDrawings(JSON.stringify([{ ...styled, width: 9, dash: 'wavy' }]));
        expect(bad.width).toBeUndefined();
        expect(bad.dash).toBeUndefined();
    });

    it('keeps a lock, and treats anything but true as unlocked', () => {
        const locked: Drawing = { id: 'g', tool: 'trend', points: [{ time: 1, price: 2 }, { time: 3, price: 4 }], locked: true };
        expect(parseDrawings(serializeDrawings([locked]))[0].locked).toBe(true);
        const loose = { ...locked, locked: 'yes' };
        expect(parseDrawings(JSON.stringify([loose]))[0].locked).toBeUndefined();
        const plain: Drawing = { ...locked };
        delete plain.locked;
        expect(parseDrawings(serializeDrawings([plain]))[0].locked).toBeUndefined();
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

describe('stroke', () => {
    const base: Drawing = { id: 'w', tool: 'trend', points: [{ time: 1, price: 2 }, { time: 3, price: 4 }] };

    it('uses the drawing width when it has one, else a hairline', () => {
        expect(strokeWidthOf(base)).toBe(1.6);
        expect(strokeWidthOf({ ...base, width: 4 })).toBe(4);
    });

    it('maps the two dashed patterns and leaves solid undefined', () => {
        expect(dashOf(base)).toBeUndefined();
        expect(dashOf({ ...base, dash: 'solid' })).toBeUndefined();
        expect(dashOf({ ...base, dash: 'dashed' })).toBe('7 4');
        expect(dashOf({ ...base, dash: 'dotted' })).toBe('2 3');
    });
});

describe('the four newer tools', () => {
    it('needs the clicks their definitions promise', () => {
        expect(pointsNeeded('xrect')).toBe(2);
        expect(pointsNeeded('arrow')).toBe(2);
        expect(pointsNeeded('pricetime')).toBe(2);
        expect(pointsNeeded('channel')).toBe(3);
    });

    it('round-trips each of them through storage', () => {
        for (const tool of ['xrect', 'arrow', 'pricetime'] as const) {
            const drawing: Drawing = { id: tool, tool, points: [{ time: 1, price: 2 }, { time: 3, price: 4 }] };
            expect(parseDrawings(serializeDrawings([drawing]))).toEqual([drawing]);
        }
        const channel: Drawing = {
            id: 'c',
            tool: 'channel',
            points: [{ time: 1, price: 2 }, { time: 3, price: 2 }, { time: 3, price: 5 }],
        };
        expect(parseDrawings(serializeDrawings([channel]))).toEqual([channel]);
    });

    it('offsets the channel rail by the third point, keeping the base', () => {
        const rails = channelRails({ time: 0, price: 10 }, { time: 10, price: 10 }, { time: 10, price: 14 });
        expect(rails.base).toEqual([{ time: 0, price: 10 }, { time: 10, price: 10 }]);
        expect(rails.parallel).toEqual([{ time: 0, price: 14 }, { time: 10, price: 14 }]);
    });

    it('measures a price/time box, with a sign', () => {
        expect(measureSpan({ time: 0, price: 10 }, { time: 3600, price: 12.5 })).toEqual({ price: 2.5, seconds: 3600 });
        expect(measureSpan({ time: 0, price: 10 }, { time: 7200, price: 9 })).toEqual({ price: -1, seconds: 7200 });
    });

    it('builds an arrow head that points at the tip', () => {
        const points = arrowHeadPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10).split(' ');
        expect(points).toHaveLength(3);
        expect(points[0]).toBe('100,0');
        // The barbs sit behind the tip and on either side of the shaft.
        for (const barb of points.slice(1)) {
            const [x, y] = barb.split(',').map(Number);
            expect(x).toBeLessThan(100);
            expect(Math.abs(y)).toBeGreaterThan(0);
        }
        expect(arrowHeadPoints({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe('');
    });
});

describe('hiding a drawing, and the switch that keeps a tool armed', () => {
    it('keeps a hidden drawing, so it survives a reload and still lists', () => {
        const stored = JSON.stringify([{ id: 'h1', tool: 'trend', points: [{ time: 1, price: 1 }, { time: 2, price: 2 }], hidden: true }]);
        const back = parseDrawings(stored);
        expect(back).toHaveLength(1);
        expect(back[0].hidden).toBe(true);
        // Anything that is not a real true is not hidden: a hand-edited string cannot hide a chart.
        expect(parseDrawings(JSON.stringify([{ id: 'h2', tool: 'trend', points: [{ time: 1, price: 1 }, { time: 2, price: 2 }], hidden: 'yes' }]))[0].hidden).toBeUndefined();
    });

    it('remembers the stay-in-drawing-mode switch', () => {
        const store = new Map<string, string>();
        const storage = {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
        };
        expect(readStayDrawing(storage)).toBe(false);
        writeStayDrawing(storage, true);
        expect(readStayDrawing(storage)).toBe(true);
        writeStayDrawing(storage, false);
        expect(readStayDrawing(storage)).toBe(false);
        // A storage that refuses to answer never breaks the chart.
        expect(readStayDrawing({ getItem: () => { throw new Error('private mode'); } })).toBe(false);
    });
});

describe('the table object', () => {
    it('is a two-click annotation that carries its own text', () => {
        expect(pointsNeeded('table')).toBe(2);
        expect(toolDef('table').kind).toBe('table');
        expect(textLimit('table')).toBe(TABLE_MAX);
        expect(textLimit('text')).toBe(TEXT_MAX);
    });

    it('reads rows on lines and cells on bars, padding short rows', () => {
        expect(tableGrid('A|B\nC|D')).toEqual([
            ['A', 'B'],
            ['C', 'D'],
        ]);
        // A short row is padded to the widest one, so the grid is always rectangular.
        expect(tableGrid('A|B|C\nD')).toEqual([
            ['A', 'B', 'C'],
            ['D', '', ''],
        ]);
        // No text is still a one-cell grid, never a crash.
        expect(tableGrid(undefined)).toEqual([['']]);
    });

    it('round-trips a grid through its stored text', () => {
        const rows = [
            ['Entry', '1.20'],
            ['Stop', '1.10'],
        ];
        expect(tableGrid(tableGridText(rows))).toEqual(rows);
    });

    it('keeps line breaks when the text is cleaned, unlike a one-line note', () => {
        expect(cleanText('A|B\nC|D', TABLE_MAX)).toBe('A|B\nC|D');
        expect(cleanText('  A  |  B  \n  C  |  D  ', TABLE_MAX)).toBe('A|B\nC|D');
        // A note still collapses to one line.
        expect(cleanText('hello\nworld')).toBe('hello world');
        // A table of nothing is not worth storing.
        expect(cleanText('   \n  ', TABLE_MAX)).toBeNull();
    });

    it('caps rows and columns so a pasted block cannot grow without bound', () => {
        const wide = Array.from({ length: 20 }, () => Array.from({ length: 10 }, () => 'x').join('|')).join('\n');
        const grid = tableGrid(wide);
        expect(grid.length).toBeLessThanOrEqual(12);
        expect(grid[0].length).toBeLessThanOrEqual(6);
    });

    it('is grabbed by its sides like any other box', () => {
        const table: Drawing = { id: 't1', tool: 'table', points: [{ time: 1, price: 10 }, { time: 2, price: 8 }], text: 'A|B' };
        const screen = [[{ x: 10, y: 10 }, { x: 110, y: 60 }]];
        expect(hitTest([table], screen, { x: 10, y: 35 }, 6)?.id).toBe('t1');
        expect(hitTest([table], screen, { x: 60, y: 35 }, 6)).toBeNull();
    });
});

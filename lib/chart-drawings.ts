// Drawing geometry for the chart, kept apart from the canvas so it can be tested without a browser.
// Everything here works in screen pixels: the component converts a drawing's { time, price } points
// to pixels with the chart's own scales, then asks these helpers what the pointer is touching.
//
// The tool set follows the one the fork already shipped (trend / Fibonacci / Gann / patterns /
// Elliott counts / cycles / notes), reshaped onto this chart's single shape model: one tool
// registry drives how many clicks a shape needs, how it is drawn and what its points are called.

export type DrawPoint = { time: number; price: number };

/** How a shape is painted. Two tools can share a kind and differ only in their point count. */
export type ShapeKind =
    | 'trend'
    | 'horizontal'
    | 'rectangle'
    | 'xrect'
    | 'channel'
    | 'arrow'
    | 'pricetime'
    | 'fib'
    | 'gann'
    | 'text'
    | 'poly'
    | 'hs'
    | 'triangle'
    | 'vlines'
    | 'sine';

export type ShapeTool =
    // lines and boxes
    | 'trend' | 'horizontal' | 'rectangle' | 'xrect' | 'channel' | 'arrow' | 'pricetime' | 'fib' | 'gann' | 'text'
    // classical patterns
    | 'xabcd' | 'cypher' | 'hs' | 'abcd' | 'triangle' | 'drives3'
    // Elliott wave shapes
    | 'ew-impulse' | 'ew-abc' | 'ew-triangle' | 'ew-double' | 'ew-triple'
    // manual counts (labels come from the chosen degree)
    | 'ew-count' | 'ew-count-abc'
    // time cycles
    | 'cycles' | 'sine';

export type Drawing = {
    id: string;
    tool: ShapeTool;
    /** One point for a level or a label, two for a line or a box, more for a pattern. */
    points: DrawPoint[];
    /** Glyphs beside the points; patterns have defaults, counts supply their degree's set. */
    labels?: string[];
    /** Only for the label tool. */
    text?: string;
    /** Palette key, not a raw colour, so the stored value cannot drift from the theme. */
    color?: ColorKey;
    /** Locked drawings still render and still select, but their points cannot be dragged. */
    locked?: boolean;
    /** Stroke weight, 1–4; unset means the tool's own default. */
    width?: DrawingWidth;
    /** Stroke pattern, independent of the tool; unset keeps the tool's own (a level is dashed). */
    dash?: DrawingDash;
};

export const DRAWING_WIDTHS = [1, 2, 3, 4] as const;
export type DrawingWidth = (typeof DRAWING_WIDTHS)[number];

export type DrawingDash = 'solid' | 'dashed' | 'dotted';
export const DRAWING_DASHES: readonly DrawingDash[] = ['solid', 'dashed', 'dotted'];

const isWidth = (value: unknown): value is DrawingWidth =>
    typeof value === 'number' && (DRAWING_WIDTHS as readonly number[]).includes(value);
const isDash = (value: unknown): value is DrawingDash =>
    typeof value === 'string' && (DRAWING_DASHES as string[]).includes(value);

// --- colours ---------------------------------------------------------------

// A fixed palette, in hex: the same values lightweight-charts and the SVG agree on, and the same
// idea the fork used (cycle the colour of one drawing with a click).
export const DRAWING_COLORS = {
    blue: '#2962FF',
    orange: '#FF6D00',
    teal: '#26A69A',
    red: '#EF5350',
    violet: '#7E57C2',
    cyan: '#00BCD4',
    gold: '#EAB308',
    white: '#F0F3FA',
} as const;

export type ColorKey = keyof typeof DRAWING_COLORS;

export const COLOR_KEYS = Object.keys(DRAWING_COLORS) as ColorKey[];

export const isColorKey = (value: unknown): value is ColorKey =>
    typeof value === 'string' && (COLOR_KEYS as string[]).includes(value);

/** The next palette colour, wrapping round; without a current colour it starts at the first. */
export const nextColor = (current?: ColorKey): ColorKey => COLOR_KEYS[(COLOR_KEYS.indexOf(current as ColorKey) + 1) % COLOR_KEYS.length];

// --- the tool registry -----------------------------------------------------

export type ToolGroup = 'lines' | 'patterns' | 'elliott' | 'counts' | 'cycles';

export type ToolDef = {
    tool: ShapeTool;
    group: ToolGroup;
    kind: ShapeKind;
    /** How many chart clicks place the shape. */
    clicks: number;
    /** Glyphs printed beside the points, when the tool has them. */
    pointLabels?: string[];
    defaultColor: ColorKey;
};

export const TOOL_DEFS: ToolDef[] = [
    { tool: 'trend', group: 'lines', kind: 'trend', clicks: 2, defaultColor: 'blue' },
    { tool: 'horizontal', group: 'lines', kind: 'horizontal', clicks: 1, defaultColor: 'blue' },
    { tool: 'rectangle', group: 'lines', kind: 'rectangle', clicks: 2, defaultColor: 'blue' },
    { tool: 'xrect', group: 'lines', kind: 'xrect', clicks: 2, defaultColor: 'blue' },
    { tool: 'channel', group: 'lines', kind: 'channel', clicks: 3, defaultColor: 'violet' },
    { tool: 'arrow', group: 'lines', kind: 'arrow', clicks: 2, defaultColor: 'orange' },
    { tool: 'pricetime', group: 'lines', kind: 'pricetime', clicks: 2, defaultColor: 'white' },
    { tool: 'fib', group: 'lines', kind: 'fib', clicks: 2, defaultColor: 'gold' },
    { tool: 'gann', group: 'lines', kind: 'gann', clicks: 2, defaultColor: 'violet' },
    { tool: 'text', group: 'lines', kind: 'text', clicks: 1, defaultColor: 'white' },

    { tool: 'xabcd', group: 'patterns', kind: 'poly', clicks: 5, pointLabels: ['X', 'A', 'B', 'C', 'D'], defaultColor: 'teal' },
    { tool: 'cypher', group: 'patterns', kind: 'poly', clicks: 5, pointLabels: ['X', 'A', 'B', 'C', 'D'], defaultColor: 'teal' },
    { tool: 'hs', group: 'patterns', kind: 'hs', clicks: 5, pointLabels: ['LS', 'N1', 'H', 'N2', 'RS'], defaultColor: 'teal' },
    { tool: 'abcd', group: 'patterns', kind: 'poly', clicks: 4, pointLabels: ['A', 'B', 'C', 'D'], defaultColor: 'teal' },
    { tool: 'triangle', group: 'patterns', kind: 'triangle', clicks: 4, pointLabels: ['1', '2', '3', '4'], defaultColor: 'teal' },
    { tool: 'drives3', group: 'patterns', kind: 'poly', clicks: 3, pointLabels: ['1', '2', '3'], defaultColor: 'teal' },

    { tool: 'ew-impulse', group: 'elliott', kind: 'poly', clicks: 6, pointLabels: ['0', '1', '2', '3', '4', '5'], defaultColor: 'cyan' },
    { tool: 'ew-abc', group: 'elliott', kind: 'poly', clicks: 4, pointLabels: ['0', 'A', 'B', 'C'], defaultColor: 'cyan' },
    { tool: 'ew-triangle', group: 'elliott', kind: 'poly', clicks: 6, pointLabels: ['0', 'A', 'B', 'C', 'D', 'E'], defaultColor: 'cyan' },
    { tool: 'ew-double', group: 'elliott', kind: 'poly', clicks: 4, pointLabels: ['0', 'W', 'X', 'Y'], defaultColor: 'cyan' },
    { tool: 'ew-triple', group: 'elliott', kind: 'poly', clicks: 6, pointLabels: ['0', 'W', 'X', 'Y', 'X', 'Z'], defaultColor: 'cyan' },

    { tool: 'ew-count', group: 'counts', kind: 'poly', clicks: 5, defaultColor: 'teal' },
    { tool: 'ew-count-abc', group: 'counts', kind: 'poly', clicks: 3, defaultColor: 'orange' },

    { tool: 'cycles', group: 'cycles', kind: 'vlines', clicks: 2, defaultColor: 'white' },
    { tool: 'sine', group: 'cycles', kind: 'sine', clicks: 2, defaultColor: 'violet' },
];

export const TOOL_BY_ID: Record<ShapeTool, ToolDef> = Object.fromEntries(TOOL_DEFS.map((d) => [d.tool, d])) as Record<
    ShapeTool,
    ToolDef
>;

export const TOOL_IDS = TOOL_DEFS.map((d) => d.tool);

export const isShapeTool = (value: unknown): value is ShapeTool => typeof value === 'string' && value in TOOL_BY_ID;

export const toolDef = (tool: ShapeTool): ToolDef => TOOL_BY_ID[tool];

/** How many chart clicks the tool needs; shapes with one point are placed in a single click. */
export const pointsNeeded = (tool: ShapeTool): number => toolDef(tool).clicks;

export const toolsInGroup = (group: ToolGroup): ToolDef[] => TOOL_DEFS.filter((d) => d.group === group);

export const newDrawingId = (): string => Math.random().toString(36).slice(2, 10);

/** The two rails of a parallel channel: the base through the first two points, and the copy of it
 *  that passes through the third point (the one that sets the width). */
export function channelRails(a: DrawPoint, b: DrawPoint, c: DrawPoint): { base: [DrawPoint, DrawPoint]; parallel: [DrawPoint, DrawPoint] } {
    const offset = { time: c.time - b.time, price: c.price - b.price };
    return {
        base: [a, b],
        parallel: [
            { time: a.time + offset.time, price: a.price + offset.price },
            { time: b.time + offset.time, price: b.price + offset.price },
        ],
    };
}

/** What a price/time box measures: the move in price and the span in seconds, signed. */
export function measureSpan(a: DrawPoint, b: DrawPoint): { price: number; seconds: number } {
    return { price: b.price - a.price, seconds: b.time - a.time };
}

/** A pointer for an arrow tip, in SVG coordinates: the two barbs of a head that points at `to`. */
export function arrowHeadPoints(from: { x: number; y: number }, to: { x: number; y: number }, size = 10): string {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return '';
    const ux = dx / length;
    const uy = dy / length;
    // Two barbs, rotated off the shaft by 28 degrees and pulled back along it.
    const angle = (28 * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const back = size;
    const b1 = { x: to.x - back * (ux * cos - uy * sin), y: to.y - back * (uy * cos + ux * sin) };
    const b2 = { x: to.x - back * (ux * cos + uy * sin), y: to.y - back * (uy * cos - ux * sin) };
    return `${to.x},${to.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`;
}

/** The colour a shape is painted with: its own, or its tool's default. */
export const drawingColor = (drawing: Pick<Drawing, 'tool' | 'color'>): string =>
    DRAWING_COLORS[isColorKey(drawing.color) ? drawing.color : toolDef(drawing.tool).defaultColor];

// --- Fibonacci -------------------------------------------------------------

/**
 * The full retracement and extension set. Ratios up to 1 sit between the anchors; ratios above 1
 * project past the far point in the direction the shape was drawn, which is how a trader reads an
 * extension target.
 */
export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 0.886, 1, 1.13, 1.272, 1.414, 1.618, 2, 2.618, 3] as const;

export type FibLevel = { ratio: number; price: number };

export function fibLevels(a: DrawPoint, b: DrawPoint): FibLevel[] {
    const top = Math.max(a.price, b.price);
    const bottom = Math.min(a.price, b.price);
    const span = top - bottom;
    const rising = b.price >= a.price;
    return FIB_RATIOS.map((ratio) => ({
        ratio,
        price:
            ratio <= 1
                ? top - span * ratio
                : rising
                  ? b.price + span * (ratio - 1)
                  : b.price - span * (ratio - 1),
    }));
}

// --- Gann -----------------------------------------------------------------

export type GannGuides = { corners: DrawPoint[]; midPrice: number };

/** The box two opposite corners describe, plus the mid price the horizontal guide sits on. */
export function gannGuides(a: DrawPoint, b: DrawPoint): GannGuides {
    return {
        corners: [
            { time: a.time, price: a.price },
            { time: b.time, price: a.price },
            { time: b.time, price: b.price },
            { time: a.time, price: b.price },
        ],
        midPrice: (a.price + b.price) / 2,
    };
}

// --- cycles ---------------------------------------------------------------

/**
 * Indices a cycle lands on: the bar distance between the two anchors is repeated before and after
 * them, which is what a time-cycle tool is for. Out-of-range indices are dropped.
 */
export function cycleIndices(length: number, a: number, b: number, back = 2, forward = 10): number[] {
    const step = b - a;
    if (!Number.isInteger(a) || !Number.isInteger(b) || step <= 0 || length <= 0) return [];
    const out: number[] = [];
    for (let k = -back; k <= forward; k += 1) {
        const index = a + k * step;
        if (index >= 0 && index < length) out.push(index);
    }
    return out;
}

/** The polyline of a sine wave that starts at `p0` and completes half a period at `p1`. */
export function sinePoints(p0: { x: number; y: number }, p1: { x: number; y: number }, rightEdge: number): { x: number; y: number }[] {
    const span = p1.x - p0.x;
    if (Math.abs(span) < 4) return [];
    const amplitude = Math.abs(p1.y - p0.y) / 2 || 8;
    const middle = (p0.y + p1.y) / 2;
    const phase = p0.y >= middle ? Math.PI / 2 : -Math.PI / 2;
    const end = Math.min(p0.x + span * 3, rightEdge);
    const points: { x: number; y: number }[] = [];
    for (let x = p0.x; x <= end; x += 4) {
        points.push({ x, y: middle + amplitude * Math.sin((Math.PI * (x - p0.x)) / span + phase) });
    }
    return points;
}

// --- manual Elliott counts -------------------------------------------------

export type CountDegree = 'major' | 'minor' | 'minute';
export type CountKind = 'impulse' | 'correction';

/** The glyph set each degree/kind pair prints, mirroring how a count is written by hand. */
export const COUNT_GLYPHS: Record<CountDegree, Record<CountKind, string[]>> = {
    major: { impulse: ['I', 'II', 'III', 'IV', 'V'], correction: ['(A)', '(B)', '(C)'] },
    minor: { impulse: ['1', '2', '3', '4', '5'], correction: ['A', 'B', 'C'] },
    minute: { impulse: ['i', 'ii', 'iii', 'iv', 'v'], correction: ['a', 'b', 'c'] },
};

export const COUNT_TOOL: Record<CountKind, ShapeTool> = { impulse: 'ew-count', correction: 'ew-count-abc' };

export type CountOptions = { degree: CountDegree; kind: CountKind };

/** Every degree/kind pair a manual count offers, ready to render as menu entries. */
export const COUNT_OPTIONS: CountOptions[] = (['major', 'minor', 'minute'] as CountDegree[]).flatMap((degree) =>
    (['impulse', 'correction'] as CountKind[]).map((kind) => ({ degree, kind })),
);

// --- screen-space geometry -------------------------------------------------

export type ScreenPoint = { x: number; y: number };

const distance = (p: ScreenPoint, q: ScreenPoint) => Math.hypot(p.x - q.x, p.y - q.y);

/** Perpendicular distance from `p` to the segment `a`–`b`, clamped to the segment's ends. */
export function distanceToSegment(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return distance(p, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
    return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Whether the pointer is close enough to `p` to count as grabbing it. */
export const isNearPoint = (cursor: ScreenPoint, p: ScreenPoint, tolerance: number): boolean =>
    distance(cursor, p) <= tolerance;

/**
 * The drawing the pointer is over, newest first so a line drawn on top of another wins.
 * A box or a retracement is grabbed by any of its edges, not by its whole surface, so the
 * pointer stays free for panning inside it.
 */
export function hitTest(
    drawings: Drawing[],
    screenPoints: ScreenPoint[][],
    cursor: ScreenPoint,
    tolerance: number,
    kindOf: (drawing: Drawing) => ShapeKind = (drawing) => toolDef(drawing.tool).kind,
): Drawing | null {
    for (let i = drawings.length - 1; i >= 0; i -= 1) {
        const points = screenPoints[i];
        if (!points || points.length === 0) continue;
        const drawing = drawings[i];
        const kind = kindOf(drawing);

        if (kind === 'text' || kind === 'horizontal') {
            if (isNearPoint(cursor, points[0], tolerance)) return drawing;
            continue;
        }
        if (kind === 'vlines') {
            // A vertical line belongs to a whole column, so only the x matters.
            if (points.some((p) => Math.abs(p.x - cursor.x) <= tolerance)) return drawing;
            continue;
        }
        if (kind === 'sine') {
            // The curve is an approximation on screen; its two anchors are what you grab.
            if (points.some((p) => isNearPoint(cursor, p, tolerance))) return drawing;
            continue;
        }
        if (kind === 'poly' || kind === 'hs' || kind === 'triangle') {
            for (let s = 0; s + 1 < points.length; s += 1) {
                if (distanceToSegment(cursor, points[s], points[s + 1]) <= tolerance) return drawing;
            }
            continue;
        }
        if (kind === 'trend') {
            if (points.length >= 2 && distanceToSegment(cursor, points[0], points[1]) <= tolerance) return drawing;
            continue;
        }
        // rectangle and fib: the four sides, drawn as segments between opposite corners
        if (points.length < 2) continue;
        const [a, b] = points;
        const corners: ScreenPoint[] = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
        for (let c = 0; c < corners.length; c += 1) {
            if (distanceToSegment(cursor, corners[c], corners[(c + 1) % corners.length]) <= tolerance) return drawing;
        }
    }
    return null;
}

/** Which of a drawing's handles the pointer grabbed, or null when it grabbed none. */
export function handleIndex(screenPoints: ScreenPoint[], cursor: ScreenPoint, tolerance: number): number | null {
    for (let i = 0; i < screenPoints.length; i += 1) {
        if (isNearPoint(cursor, screenPoints[i], tolerance)) return i;
    }
    return null;
}

// --- notes -----------------------------------------------------------------

export const TEXT_MAX = 80;

/** Trimmed and collapsed, or null when there is nothing worth printing. */
export function cleanText(text: unknown): string | null {
    if (typeof text !== 'string') return null;
    const clean = text.trim().replace(/\s+/g, ' ');
    return clean.length === 0 || clean.length > TEXT_MAX ? null : clean;
}

/** The same text on a new anchor: the note is dragged, so its point moves, not its wording. */
export const withPoint = (drawing: Drawing, index: number, point: DrawPoint): Drawing => ({
    ...drawing,
    points: drawing.points.map((p, i) => (i === index ? point : p)),
});

/** A note's new wording. Bad text leaves the drawing untouched, so a stray save cannot blank it. */
export function withText(drawing: Drawing, text: unknown): Drawing {
    const clean = cleanText(text);
    return clean == null ? drawing : { ...drawing, text: clean };
}

/** The stroke weight a drawing is painted with; the tools' own default is a hairline. */
export const strokeWidthOf = (drawing: Drawing): number => drawing.width ?? 1.6;

/** The dash pattern, or undefined for the tool's own (solid, except a level's dashed guide). */
export const dashOf = (drawing: Drawing): string | undefined => {
    if (!drawing.dash || drawing.dash === 'solid') return undefined;
    return drawing.dash === 'dotted' ? '2 3' : '7 4';
};

/**
 * A copy that can be pasted or duplicated: a fresh id, no lock (a pasted object should be usable),
 * and an optional offset so it does not hide exactly under the original.
 */
export function cloneDrawing(drawing: Drawing, id: string, offset: { time?: number; price?: number } = {}): Drawing {
    const { time = 0, price = 0 } = offset;
    // `locked` is deliberately dropped: a pasted object should be usable straight away.
    const { locked, labels, ...rest } = drawing;
    void locked;
    return {
        ...rest,
        id,
        points: drawing.points.map((point) => ({ time: point.time + time, price: point.price + price })),
        ...(labels ? { labels: [...labels] } : {}),
    };
}

/** The labels a shape prints: its own when it has them, otherwise the tool's. */
export const labelsFor = (drawing: Drawing): string[] => drawing.labels ?? toolDef(drawing.tool).pointLabels ?? [];

// --- snapping --------------------------------------------------------------

/**
 * The candle time closest to `time`. A drawing keeps the timestamp of the bar it was drawn on, and
 * changing interval changes the set of bars, so a point is snapped to the nearest bar of whatever
 * interval is on screen instead of vanishing from the chart.
 */
export function nearestTime(times: number[], time: number): number | null {
    if (times.length === 0) return null;
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < time) lo = mid + 1;
        else hi = mid;
    }
    const upper = times[lo];
    const lower = lo > 0 ? times[lo - 1] : upper;
    return Math.abs(lower - time) <= Math.abs(upper - time) ? lower : upper;
}

// --- persistence -----------------------------------------------------------

/** A chart's shapes, per symbol: they follow the instrument across timeframes, not the timeframe. */
export const drawingsKey = (symbol: string) => `openstock-drawings:${symbol.toUpperCase()}`;

export const MAX_DRAWINGS = 200;

const isPoint = (v: unknown): v is DrawPoint =>
    !!v && typeof v === 'object' && Number.isFinite((v as DrawPoint).time) && Number.isFinite((v as DrawPoint).price);

const cleanDrawing = (value: unknown): Drawing | null => {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Drawing;
    if (typeof candidate.id !== 'string' || !candidate.id) return null;
    if (!isShapeTool(candidate.tool)) return null;
    if (!Array.isArray(candidate.points) || candidate.points.length !== pointsNeeded(candidate.tool)) return null;
    if (!candidate.points.every(isPoint)) return null;

    const labels =
        Array.isArray(candidate.labels) && candidate.labels.every((l) => typeof l === 'string')
            ? candidate.labels.slice(0, 8)
            : undefined;
    const text = candidate.tool === 'text' ? (cleanText(candidate.text) ?? '—') : undefined;
    const color = isColorKey(candidate.color) ? candidate.color : undefined;
    const locked = candidate.locked === true ? true : undefined;
    const width = isWidth(candidate.width) ? candidate.width : undefined;
    const dash = isDash(candidate.dash) ? candidate.dash : undefined;

    return {
        id: candidate.id,
        tool: candidate.tool,
        points: candidate.points,
        ...(labels ? { labels } : {}),
        ...(text ? { text } : {}),
        ...(color ? { color } : {}),
        ...(locked ? { locked } : {}),
        ...(width ? { width } : {}),
        ...(dash ? { dash } : {}),
    };
};

/** Parses whatever was stored: anything that is not a well-formed drawing is dropped, never thrown. */
export function parseDrawings(raw: string | null): Drawing[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(cleanDrawing).filter((d): d is Drawing => d !== null).slice(0, MAX_DRAWINGS);
    } catch {
        return [];
    }
}

export const serializeDrawings = (drawings: Drawing[]): string => JSON.stringify(drawings);

/** Read the stored drawings for a symbol. Safe on the server: returns [] when there is no window. */
export function loadDrawings(symbol: string): Drawing[] {
    if (typeof window === 'undefined') return [];
    try {
        return parseDrawings(window.localStorage.getItem(drawingsKey(symbol)));
    } catch {
        return [];
    }
}

export function saveDrawings(symbol: string, drawings: Drawing[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(drawingsKey(symbol), serializeDrawings(drawings.slice(0, MAX_DRAWINGS)));
    } catch {
        // A full or blocked storage must not break the chart; the drawing simply is not kept.
    }
}

// --- transfer --------------------------------------------------------------

export const TRANSFER_VERSION = 1;

export type TransferPayload = {
    v: number;
    app: 'openstock';
    kind: 'chart-transfer';
    symbol: string;
    drawings: Drawing[];
};

/** One JSON object that carries a chart's shapes to another browser. */
export function buildTransferPayload(symbol: string, drawings: Drawing[]): TransferPayload {
    return {
        v: TRANSFER_VERSION,
        app: 'openstock',
        kind: 'chart-transfer',
        symbol,
        drawings: drawings.slice(0, MAX_DRAWINGS),
    };
}

export type TransferResult =
    | { ok: true; drawings: Drawing[]; symbol: string }
    | { ok: false; error: 'not-json' | 'not-transfer' | 'version' | 'no-source' };

/**
 * A pasted payload, validated with the same gate the loader uses, so a foreign or hand-edited
 * payload can drop entries but can never reach the renderer as something malformed.
 */
export function parseTransferPayload(raw: unknown): TransferResult {
    if (typeof raw !== 'string') return { ok: false, error: 'not-json' };
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ok: false, error: 'not-json' };
    }
    if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'not-transfer' };
    const payload = parsed as Record<string, unknown>;
    if (payload.app !== 'openstock' || payload.kind !== 'chart-transfer') return { ok: false, error: 'not-transfer' };
    if (payload.v !== TRANSFER_VERSION) return { ok: false, error: 'version' };
    if (typeof payload.symbol !== 'string' || payload.symbol.length === 0) return { ok: false, error: 'no-source' };
    const drawings = Array.isArray(payload.drawings)
        ? payload.drawings.map(cleanDrawing).filter((d): d is Drawing => d !== null)
        : [];
    return { ok: true, drawings, symbol: payload.symbol };
}

/** Merges an incoming set into the current one: same ids are replaced, everything else is kept. */
export function mergeDrawings(current: Drawing[], incoming: Drawing[]): Drawing[] {
    const byId = new Map(current.map((d) => [d.id, d]));
    for (const drawing of incoming) byId.set(drawing.id, drawing);
    return [...byId.values()].slice(0, MAX_DRAWINGS);
}

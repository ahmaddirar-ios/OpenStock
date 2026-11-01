// Drawing geometry for the chart, kept apart from the canvas so it can be tested without a browser.
// Everything here works in screen pixels: the component converts a drawing's { time, price } points
// to pixels with the chart's own scales, then asks these helpers what the pointer is touching.

export type DrawPoint = { time: number; price: number };

export type DrawingTool = 'trend' | 'horizontal' | 'rectangle' | 'fib' | 'text';

export type Drawing = {
    id: string;
    tool: DrawingTool;
    /** One point for a horizontal line or a label, two for everything else. */
    points: DrawPoint[];
    /** Only for the label tool. */
    text?: string;
};

export const DRAWING_TOOLS: DrawingTool[] = ['trend', 'horizontal', 'rectangle', 'fib', 'text'];

/** Fibonacci retracement levels, the ones traders actually mark. */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export const pointsNeeded = (tool: DrawingTool): number => (tool === 'horizontal' || tool === 'text' ? 1 : 2);

export const newDrawingId = (): string => Math.random().toString(36).slice(2, 10);

/** Prices of the retracement levels between two anchored points, top to bottom. */
export const fibPrices = (a: DrawPoint, b: DrawPoint): { level: number; price: number }[] =>
    FIB_LEVELS.map((level) => ({ level, price: a.price + (b.price - a.price) * level }));

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
 * A rectangle or a retracement is grabbed by any of its edges, not by its whole surface, so the
 * pointer stays free for panning inside it.
 */
export function hitTest(
    drawings: Drawing[],
    screenPoints: ScreenPoint[][],
    cursor: ScreenPoint,
    tolerance: number,
): Drawing | null {
    for (let i = drawings.length - 1; i >= 0; i -= 1) {
        const points = screenPoints[i];
        if (!points || points.length === 0) continue;
        const drawing = drawings[i];
        if (drawing.tool === 'text' || drawing.tool === 'horizontal') {
            if (isNearPoint(cursor, points[0], tolerance)) return drawing;
            continue;
        }
        const [a, b] = points;
        if (drawing.tool === 'trend') {
            if (distanceToSegment(cursor, a, b) <= tolerance) return drawing;
            continue;
        }
        // rectangle and fib: the four sides, drawn as segments between opposite corners
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

const key = (symbol: string) => `openstock-drawings:${symbol.toUpperCase()}`;

const isPoint = (v: unknown): v is DrawPoint =>
    !!v && typeof v === 'object' && Number.isFinite((v as DrawPoint).time) && Number.isFinite((v as DrawPoint).price);

/** Parses whatever was stored: anything that is not a well-formed drawing is dropped, never thrown. */
export function parseDrawings(raw: string | null): Drawing[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((d): d is Drawing => {
            if (!d || typeof d !== 'object') return false;
            const candidate = d as Drawing;
            return (
                typeof candidate.id === 'string' &&
                DRAWING_TOOLS.includes(candidate.tool) &&
                Array.isArray(candidate.points) &&
                candidate.points.length === pointsNeeded(candidate.tool) &&
                candidate.points.every(isPoint)
            );
        });
    } catch {
        return [];
    }
}

export const serializeDrawings = (drawings: Drawing[]): string => JSON.stringify(drawings);

/** Read the stored drawings for a symbol. Safe on the server: returns [] when there is no window. */
export function loadDrawings(symbol: string): Drawing[] {
    if (typeof window === 'undefined') return [];
    try {
        return parseDrawings(window.localStorage.getItem(key(symbol)));
    } catch {
        return [];
    }
}

export function saveDrawings(symbol: string, drawings: Drawing[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(key(symbol), serializeDrawings(drawings));
    } catch {
        // A full or blocked storage must not break the chart; the drawing simply is not kept.
    }
}

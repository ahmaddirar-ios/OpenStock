// An alert attached to a drawing: the trader draws a trendline, says "tell me when we break it", and the
// checker watches that line afterwards. The line is snapshotted when the alert is made — an alert is a
// promise made at a moment, so later dragging the drawing does not silently change what was promised.
//
// Everything here is arithmetic on the snapshot, so the rule can be proved without a chart, a database or
// a clock: the caller says what time it is, and the module answers where the line sits then.

import { toolDef, type DrawPoint, type ShapeTool } from '@/lib/chart-drawings';

/** The three rules a drawing can carry. */
export const DRAWING_CONDITIONS = ['DRAWING_CROSS_UP', 'DRAWING_CROSS_DOWN', 'DRAWING_TOUCH'] as const;
export type DrawingCondition = (typeof DRAWING_CONDITIONS)[number];

export const isDrawingCondition = (value: unknown): value is DrawingCondition =>
    typeof value === 'string' && (DRAWING_CONDITIONS as readonly string[]).includes(value);

/**
 * How a drawing's geometry is read. A `line` continues in both directions (a trendline is a level, not
 * just the segment that was drawn), a `ray` only forward from the point it was drawn at, and a `level`
 * is one price held across the chart.
 */
export type AnchorKind = 'line' | 'ray' | 'level';

export type DrawingAnchor = {
    tool: ShapeTool;
    kind: AnchorKind;
    /** Two points for a line or a ray, one for a level — in chart time and price. */
    points: { time: number; price: number }[];
};

/** Tools whose kind is a straight line through their two points. */
const LINE_KINDS = new Set(['trend', 'ray', 'extended', 'arrow', 'trendangle', 'cross', 'pricetime']);
/** Tools whose kind is one price held across the chart. */
const LEVEL_KINDS = new Set(['horizontal', 'hray']);

/**
 * The anchor a drawing can offer, or null when it cannot carry an alert. Patterns, Fibonacci readings,
 * Gann constructions and the volume tools are deliberately absent: their "price" at a moment is either
 * a range or an interpretation, and an alert that fires on an interpretation is a broken promise.
 */
export function anchorFor(tool: ShapeTool, points: readonly DrawPoint[]): DrawingAnchor | null {
    const kind = toolDef(tool).kind;
    const usable = points.filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price));
    if (LEVEL_KINDS.has(kind)) {
        if (usable.length === 0) return null;
        return { tool, kind: 'level', points: [{ time: usable[0].time, price: usable[0].price }] };
    }
    if (LINE_KINDS.has(kind)) {
        if (usable.length < 2 || usable[0].time === usable[1].time) return null;
        return {
            tool,
            kind: kind === 'ray' ? 'ray' : 'line',
            points: [
                { time: usable[0].time, price: usable[0].price },
                { time: usable[1].time, price: usable[1].price },
            ],
        };
    }
    return null;
}

/** The price the anchor has at a moment (unix seconds), or null where it does not exist yet. */
export function anchorPriceAt(anchor: DrawingAnchor, time: number): number | null {
    if (anchor.kind === 'level') return anchor.points[0]?.price ?? null;
    const [a, b] = anchor.points;
    if (!a || !b || b.time === a.time) return null;
    if (anchor.kind === 'ray' && time < a.time) return null;
    const price = a.price + ((b.price - a.price) / (b.time - a.time)) * (time - a.time);
    return Number.isFinite(price) ? price : null;
}

/**
 * How far the price sits from the anchor, as a signed fraction of the anchor's own price: positive is
 * above the line, negative below, zero on it. A fraction rather than a raw distance keeps one band
 * meaningful on a 26.00 stock and a 9,876 index alike.
 */
export function anchorGap(anchor: DrawingAnchor, price: number, time: number): number | null {
    const line = anchorPriceAt(anchor, time);
    if (line == null || !Number.isFinite(price) || line === 0) return null;
    return (price - line) / Math.abs(line);
}

/** The band a "touch" rule uses, in percent of price. */
export const DRAWING_BAND = { min: 0.05, max: 5, default: 0.3 } as const;

export const clampBand = (value: unknown): number => {
    const band = Number(value);
    if (!Number.isFinite(band)) return DRAWING_BAND.default;
    return Math.min(DRAWING_BAND.max, Math.max(DRAWING_BAND.min, band));
};

/**
 * Whether a drawing rule fires now. A cross needs the previous gap, so the very first check only records
 * where the price sits — the same rule the price-cross conditions already follow: speak when it happens,
 * not the first time the checker looks.
 */
export function evaluateDrawingRule(input: {
    condition: DrawingCondition;
    anchor: DrawingAnchor;
    price: number;
    time: number;
    lastGap?: number | null;
    band?: number;
}): boolean {
    const gap = anchorGap(input.anchor, input.price, input.time);
    if (gap == null) return false;
    const last = input.lastGap == null ? null : Number(input.lastGap);
    switch (input.condition) {
        case 'DRAWING_CROSS_UP':
            return last != null && Number.isFinite(last) && last <= 0 && gap > 0;
        case 'DRAWING_CROSS_DOWN':
            return last != null && Number.isFinite(last) && last >= 0 && gap < 0;
        case 'DRAWING_TOUCH':
            return Math.abs(gap) <= clampBand(input.band) / 100;
        default:
            return false;
    }
}

/** A stored anchor, held to the same rules as a fresh one: anything unusable reads as null. */
export function parseAnchor(value: unknown): DrawingAnchor | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as { tool?: unknown; kind?: unknown; points?: unknown };
    if (typeof candidate.tool !== 'string' || !Array.isArray(candidate.points)) return null;
    const kind = candidate.kind;
    if (kind !== 'line' && kind !== 'ray' && kind !== 'level') return null;
    const points = candidate.points
        .map((point) => {
            if (!point || typeof point !== 'object') return null;
            const { time, price } = point as { time?: unknown; price?: unknown };
            return typeof time === 'number' && typeof price === 'number' && Number.isFinite(time) && Number.isFinite(price) ? { time, price } : null;
        })
        .filter((point): point is { time: number; price: number } => point !== null)
        .slice(0, 2);
    if (kind === 'level' && points.length !== 1) return null;
    if (kind !== 'level' && (points.length !== 2 || points[0].time === points[1].time)) return null;
    return { tool: candidate.tool as ShapeTool, kind, points };
}

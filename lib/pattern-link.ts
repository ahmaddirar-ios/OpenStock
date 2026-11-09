// The scanner's hand-off to the chart. A hit becomes a token in a URL, and the chart turns the token
// back into an ordinary drawing. Nothing here touches the DOM or the network, so a link is safe to
// build on the server and read on the client.

import { PATTERN_ORDER, PATTERN_POINTS, PATTERN_TOOL, type PatternDirection, type PatternHit, type PatternId } from '@/lib/patterns';
import { newDrawingId, toolDef, type Drawing, type DrawPoint } from '@/lib/chart-drawings';
import { CANDLE_INTERVALS } from '@/lib/yahoo-candles';

export type PatternLink = {
    pattern: PatternId;
    direction: PatternDirection;
    /** The interval the pattern was measured on, so the chart opens on the same bars. */
    intervalId: string;
    points: DrawPoint[];
};

const PATTERNS = new Set<string>(PATTERN_ORDER);
const INTERVALS = new Set<string>(CANDLE_INTERVALS.map((interval) => interval.id));
/** Longer than any real token; a longer one is not ours and is not worth parsing. */
const MAX_TOKEN = 2000;
/** One payload shape, and the only version this build reads. */
const VERSION = 1;

const base64url = (text: string): string =>
    // btoa is latin1-only; every non-ASCII here is already escaped by encodeURIComponent.
    btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64url = (token: string): string =>
    decodeURIComponent(escape(atob(token.replace(/-/g, '+').replace(/_/g, '/'))));

/** The points as pairs, so the token stays small: one time and one price per pivot. */
const pairUp = (points: readonly DrawPoint[]): [number, number][] => points.map((point) => [point.time, point.price]);

export function encodePatternLink(hit: Pick<PatternHit, 'pattern' | 'direction' | 'points'> & { intervalId: string }): string {
    return base64url(JSON.stringify({ v: VERSION, p: hit.pattern, d: hit.direction, i: hit.intervalId, pts: pairUp(hit.points) }));
}

/**
 * Reads a token back into a link, or null when anything about it is not ours: the wrong version, an
 * unknown pattern or interval, the wrong number of points for that pattern, times that do not
 * increase, or a price that is not a finite number. A bad link draws nothing; it never throws.
 */
export function decodePatternLink(token: string | null | undefined): PatternLink | null {
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN) return null;
    try {
        const parsed: unknown = JSON.parse(fromBase64url(token));
        if (typeof parsed !== 'object' || parsed === null) return null;
        const { v, p, d, i, pts } = parsed as Record<string, unknown>;
        if (v !== VERSION) return null;
        if (typeof p !== 'string' || !PATTERNS.has(p)) return null;
        if (d !== 'bullish' && d !== 'bearish') return null;
        if (typeof i !== 'string' || !INTERVALS.has(i)) return null;
        if (!Array.isArray(pts) || pts.length !== PATTERN_POINTS[p as PatternId]) return null;

        const points: DrawPoint[] = [];
        for (const pair of pts) {
            if (!Array.isArray(pair) || pair.length !== 2) return null;
            const [time, price] = pair as unknown[];
            if (typeof time !== 'number' || !Number.isFinite(time)) return null;
            if (typeof price !== 'number' || !Number.isFinite(price)) return null;
            if (points.length > 0 && time <= points[points.length - 1].time) return null;
            points.push({ time, price });
        }
        return { pattern: p as PatternId, direction: d, intervalId: i, points };
    } catch {
        return null;
    }
}

/**
 * The token as a drawing the chart already knows how to paint: the pattern's own tool, its point
 * labels and its default colour. Null when the points do not fit the tool, so a hand-edited link
 * cannot put a four-point shape into a five-point tool.
 */
export function drawingFromLink(link: PatternLink): Drawing | null {
    const tool = PATTERN_TOOL[link.pattern];
    const def = toolDef(tool);
    const needed = def.clicks;
    if (needed === 0 ? link.points.length < 2 : link.points.length !== needed) return null;
    return {
        id: newDrawingId(),
        tool,
        points: link.points.map((point) => ({ time: point.time, price: point.price })),
        labels: def.pointLabels,
        color: def.defaultColor,
    };
}
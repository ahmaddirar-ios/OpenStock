// The scanner's pattern vocabulary and its detectors. Everything here is pure: no fetch, no clock,
// no DOM. A detector is handed the zigzag pivots a chart would already draw and answers whether they
// are one of the shapes a trader names. lib/pattern-scan.ts runs them; the page renders the hits.

import { checkWolfe, lineAt } from '@/lib/wolfe';
import { toolDef, type DrawPoint, type ShapeTool } from '@/lib/chart-drawings';
import type { Pivot } from '@/lib/auto-count';
import type { Candle } from '@/lib/yahoo-candles';
import type { StringKey } from '@/lib/i18n';

export type PatternDirection = 'bullish' | 'bearish';

export type PatternId =
    | 'wolfe' | 'gartley' | 'bat' | 'butterfly' | 'crab' | 'cypher'
    | 'hs' | 'triangle' | 'drives3' | 'impulse' | 'abc';

/** The family a pattern is filed under in the picker. */
export type PatternGroup = 'wolfe' | 'harmonic' | 'classical' | 'elliott';

export type PatternHit = {
    pattern: PatternId;
    direction: PatternDirection;
    /** The drawing tool the hit is painted with: one the chart already ships. */
    tool: ShapeTool;
    /** The pivots, oldest first. */
    points: DrawPoint[];
    /** The tool's own point labels, so the chart prints the shape the trader named. */
    labels: string[];
    /** The price that voids the pattern. */
    invalidation: number;
    /** The measured move, when the shape gives one. */
    target: number | null;
    /** True once price has left the pattern the way it should have. */
    confirmed: boolean;
    /** The pivot index the pattern ends at, so the newest hit sorts first. */
    foundAt: number;
};

/** The picker's order, and the tie-break when two hits end on the same bar. */
export const PATTERN_ORDER: readonly PatternId[] = [
    'wolfe', 'gartley', 'bat', 'butterfly', 'crab', 'cypher', 'hs', 'triangle', 'drives3', 'impulse', 'abc',
];

/**
 * Pattern → the drawing tool that paints it. Every entry is a tool the chart already ships, and the
 * tool's own click count fixes how many pivots the detector returns.
 */
export const PATTERN_TOOL: Record<PatternId, ShapeTool> = {
    wolfe: 'wolfe',
    gartley: 'xabcd',
    bat: 'xabcd',
    butterfly: 'xabcd',
    crab: 'xabcd',
    cypher: 'cypher',
    hs: 'hs',
    triangle: 'triangle',
    drives3: 'polyline',
    impulse: 'ew-impulse',
    abc: 'ew-abc',
};

export const PATTERN_POINTS: Record<PatternId, number> = {
    wolfe: 5, gartley: 5, bat: 5, butterfly: 5, crab: 5, cypher: 5,
    hs: 5, triangle: 4, drives3: 6, impulse: 6, abc: 4,
};

export const PATTERN_GROUP: Record<PatternId, PatternGroup> = {
    wolfe: 'wolfe',
    gartley: 'harmonic', bat: 'harmonic', butterfly: 'harmonic', crab: 'harmonic', cypher: 'harmonic',
    hs: 'classical', triangle: 'classical', drives3: 'classical',
    impulse: 'elliott', abc: 'elliott',
};

export const PATTERN_LABEL_KEY: Record<PatternId, StringKey> = {
    wolfe: 'scan.pattern.wolfe',
    gartley: 'scan.pattern.gartley',
    bat: 'scan.pattern.bat',
    butterfly: 'scan.pattern.butterfly',
    crab: 'scan.pattern.crab',
    cypher: 'scan.pattern.cypher',
    hs: 'scan.pattern.hs',
    triangle: 'scan.pattern.triangle',
    drives3: 'scan.pattern.drives3',
    impulse: 'scan.pattern.impulse',
    abc: 'scan.pattern.abc',
};

/** The glyphs the tool prints beside a hit's points; an open-ended tool prints none. */
export const labelsFor = (pattern: PatternId): string[] => toolDef(PATTERN_TOOL[pattern]).pointLabels ?? [];

/** How far `at` has travelled from `from` toward `to`, as a fraction of the leg. */
export function retrace(from: number, to: number, at: number): number {
    const span = to - from;
    return span === 0 ? 0 : (at - from) / span;
}

/** True when `value` sits inside [min, max], with the slack the published ratios need. */
export function within(value: number, min: number, max: number): boolean {
    return value >= min - 0.05 && value <= max + 0.05;
}

/** Price change per bar between two pivots; 0 when both sit on the same bar. */
export function slopeOf(a: Pivot, b: Pivot): number {
    return b.time === a.time ? 0 : (b.price - a.price) / (b.time - a.time);
}

/** Where the line through `a`,`b` meets the line through `c`,`d`, or null when they are parallel. */
function apexOf(a: DrawPoint, b: DrawPoint, c: DrawPoint, d: DrawPoint): number | null {
    const first = (b.price - a.price) / (b.time - a.time);
    const second = (d.price - c.price) / (d.time - c.time);
    if (first === second) return null;
    return (c.price - a.price - second * c.time + first * a.time) / (first - second);
}

/** Retracement of the leg `start → end` at `point`: 0 at the far end, 1 back at the start. */
const fibRetrace = (start: number, end: number, point: number): number =>
    Math.abs(end - point) / Math.abs(end - start);

/** Extension of the leg `start → end` at `point`, read from `start`: 1 at the far end, more beyond it. */
const fibExtend = (start: number, end: number, point: number): number =>
    Math.abs(point - start) / Math.abs(end - start);

/** How many BC lengths D sits past the far end of BC. D always lands outside BC, on B's side or C's. */
const bcExtension = (b: number, c: number, d: number): number =>
    Math.max(Math.abs(d - b), Math.abs(d - c)) / Math.abs(c - b);

type Ratio = { readonly min: number; readonly max: number };
/** A ratio measured back from A (Gartley, Bat) or out past A (Butterfly, Crab). */
type RatioKind = 'retrace' | 'extend';

/**
 * The published ratios in the spec's order, so a shape that fits Gartley is never also reported as a
 * Bat. `dXaKind` matters twice over: it decides which formula reads D's position on XA, and — because
 * D lands on X's side for a retracement and on A's side for an extension — it also decides the
 * direction. The same rising XA is therefore a bullish Gartley and a bearish Butterfly.
 */
const HARMONIC_VARIANTS: readonly {
    id: 'gartley' | 'bat' | 'butterfly' | 'crab';
    bXa: Ratio;
    cAb: Ratio;
    dXa: Ratio;
    dXaKind: RatioKind;
    dBc: Ratio;
}[] = [
    { id: 'gartley', bXa: { min: 0.618, max: 0.618 }, cAb: { min: 0.382, max: 0.886 }, dXa: { min: 0.786, max: 0.786 }, dXaKind: 'retrace', dBc: { min: 1.27, max: 1.618 } },
    { id: 'bat', bXa: { min: 0.382, max: 0.5 }, cAb: { min: 0.382, max: 0.886 }, dXa: { min: 0.886, max: 0.886 }, dXaKind: 'retrace', dBc: { min: 1.618, max: 2.618 } },
    { id: 'butterfly', bXa: { min: 0.786, max: 0.786 }, cAb: { min: 0.382, max: 0.886 }, dXa: { min: 1.27, max: 1.618 }, dXaKind: 'extend', dBc: { min: 1.618, max: 2.618 } },
    { id: 'crab', bXa: { min: 0.382, max: 0.618 }, cAb: { min: 0.382, max: 0.886 }, dXa: { min: 1.618, max: 1.618 }, dXaKind: 'extend', dBc: { min: 2.24, max: 3.618 } },
];

/** Which way price is expected to leave D. Null when the X→A leg has no height to read. */
const harmonicDirection = (x: number, a: number, kind: RatioKind): PatternDirection | null => {
    if (a === x) return null;
    const dIsLow = kind === 'retrace' ? a > x : a < x;
    return dIsLow ? 'bullish' : 'bearish';
};

/** True once the newest close has turned back off D by at least a tenth of the CD leg. */
const turnedOffD = (candles: readonly Candle[], direction: PatternDirection, c: number, d: number): boolean => {
    const last = candles[candles.length - 1];
    if (!last || !Number.isFinite(last.close)) return false;
    const step = Math.abs(c - d) * 0.1;
    return direction === 'bullish' ? last.close >= d + step : last.close <= d - step;
};

/**
 * The XABCD family. Five pivots X, A, B, C, D, tested against the four published shapes in order;
 * the first whose four ratios all hold is the answer. `target` is A, the conventional first target,
 * and `invalidation` is D itself.
 */
export function detectHarmonic(pivots: readonly Pivot[], candles: readonly Candle[]): PatternHit | null {
    if (pivots.length !== 5 || !usable(pivots)) return null;
    const [x, a, b, c, d] = pivots;

    const bXa = fibRetrace(x.price, a.price, b.price);
    const cAb = fibRetrace(a.price, b.price, c.price);
    const dBc = bcExtension(b.price, c.price, d.price);

    for (const variant of HARMONIC_VARIANTS) {
        const direction = harmonicDirection(x.price, a.price, variant.dXaKind);
        if (!direction) return null;
        const dXa = variant.dXaKind === 'retrace'
            ? fibRetrace(x.price, a.price, d.price)
            : fibExtend(x.price, a.price, d.price);
        if (!within(bXa, variant.bXa.min, variant.bXa.max)) continue;
        if (!within(cAb, variant.cAb.min, variant.cAb.max)) continue;
        if (!within(dXa, variant.dXa.min, variant.dXa.max)) continue;
        if (!within(dBc, variant.dBc.min, variant.dBc.max)) continue;
        return {
            pattern: variant.id,
            direction,
            tool: PATTERN_TOOL[variant.id],
            points: asPoints(pivots),
            labels: labelsFor(variant.id),
            invalidation: d.price,
            target: a.price,
            confirmed: turnedOffD(candles, direction, c.price, d.price),
            foundAt: pivots.length,
        };
    }
    return null;
}

/**
 * Cypher: B retraces 0.382–0.618 of XA, C overshoots A to 1.13–1.414 of XA, and D retraces 0.786 of
 * XC. D sits on X's side, so the direction reads like the retracement harmonics.
 */
export function detectCypher(pivots: readonly Pivot[], candles: readonly Candle[]): PatternHit | null {
    if (pivots.length !== 5 || !usable(pivots)) return null;
    const [x, a, b, c, d] = pivots;

    const direction = harmonicDirection(x.price, a.price, 'retrace');
    if (!direction) return null;
    if (!within(fibRetrace(x.price, a.price, b.price), 0.382, 0.618)) return null;
    if (!within(fibExtend(x.price, a.price, c.price), 1.13, 1.414)) return null;
    if (!within(fibRetrace(x.price, c.price, d.price), 0.786, 0.786)) return null;

    return {
        pattern: 'cypher',
        direction,
        tool: PATTERN_TOOL.cypher,
        points: asPoints(pivots),
        labels: labelsFor('cypher'),
        invalidation: d.price,
        target: a.price,
        confirmed: turnedOffD(candles, direction, c.price, d.price),
        foundAt: pivots.length,
    };
}


/** The pivots as plain points, which is all a detector or a drawing needs. */
const asPoints = (pivots: readonly Pivot[]): DrawPoint[] =>
    pivots.map((pivot) => ({ time: pivot.time, price: pivot.price }));

/** One pivot as a point, for the line helpers. */
const pointOf = (pivot: Pivot): DrawPoint => ({ time: pivot.time, price: pivot.price });

/** Only a finite set of pivots is a shape; a NaN anywhere would poison every ratio below. */
const usable = (pivots: readonly Pivot[]): boolean =>
    pivots.every((pivot) => Number.isFinite(pivot.time) && Number.isFinite(pivot.price));

/**
 * Wolfe wave: five turns whose 1-3 and 2-4 lines converge and whose fifth point pierces the 1-3
 * line. The channel's own rules live in lib/wolfe.ts; this only dresses the answer as a hit. The
 * target is the 1-4 (EPA) line read where the two channel lines meet.
 */
// The scanner calls every detector with the same two arguments; Wolfe reads only the pivots.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function detectWolfe(pivots: readonly Pivot[], _candles: readonly Candle[]): PatternHit | null {
    if (pivots.length !== 5 || !usable(pivots)) return null;
    const points = asPoints(pivots);
    const check = checkWolfe(points);
    if (!check.ok) return null;

    const [p1, p2, p3, p4, p5] = points;
    const apex = apexOf(p1, p3, p2, p4);
    return {
        pattern: 'wolfe',
        direction: check.direction,
        tool: PATTERN_TOOL.wolfe,
        points,
        labels: labelsFor('wolfe'),
        invalidation: p5.price,
        target: apex === null ? null : lineAt(p1, p4, apex),
        confirmed: true,
        foundAt: pivots.length,
    };
}

/**
 * Head & shoulders: LS, N1, head, N2, RS. The head is the middle pivot, the two inner pivots are the
 * neckline, and the shoulders sit on the same side as the head. Bearish when the head is a high,
 * inverse when it is a low. The measured move is the head's height above (below) the neckline, read
 * at the head's own bar and projected from there.
 */
export function detectHeadShoulders(pivots: readonly Pivot[], candles: readonly Candle[]): PatternHit | null {
    if (pivots.length !== 5 || !usable(pivots)) return null;
    const [ls, n1, head, n2, rs] = pivots;
    // Shoulders and head on one side, the neckline's two turns on the other. A zigzag already
    // alternates, so this only guards against a hand-built series.
    if (!(ls.kind === head.kind && head.kind === rs.kind)) return null;
    if (!(n1.kind === n2.kind && n2.kind !== head.kind)) return null;
    const bearish = head.kind === 'high';

    // The head has to clear both shoulders by at least 1% of price, or the shape is a range.
    const clears = (shoulder: number) =>
        bearish ? head.price >= shoulder + Math.abs(shoulder) * 0.01 : head.price <= shoulder - Math.abs(shoulder) * 0.01;
    if (!clears(ls.price) || !clears(rs.price)) return null;

    const neckline = (time: number) => lineAt(pointOf(n1), pointOf(n2), time);
    const height = Math.abs(head.price - neckline(head.time));
    if (!(height > 0)) return null;
    // The shoulders have to look like a pair, measured against the head's own height.
    if (Math.abs(ls.price - rs.price) > height * 0.1) return null;

    const last = candles[candles.length - 1];
    const close = last?.close;
    const readAt = last && Number.isFinite(last.time) ? last.time : rs.time;
    const confirmed = typeof close === 'number' && Number.isFinite(close)
        ? (bearish ? close < neckline(readAt) : close > neckline(readAt))
        : false;

    return {
        pattern: 'hs',
        direction: bearish ? 'bearish' : 'bullish',
        tool: PATTERN_TOOL.hs,
        points: asPoints(pivots),
        labels: labelsFor('hs'),
        invalidation: head.price,
        target: bearish ? neckline(head.time) - height : neckline(head.time) + height,
        confirmed,
        foundAt: pivots.length,
    };
}

/** Which side of a triangle is flat: the top (ascending), the bottom (descending) or neither. */
type TriangleVariant = 'symmetric' | 'ascending' | 'descending';

/**
 * Triangle: four alternating pivots, two highs and two lows. The highs and the lows each define a
 * line, and the shape is a triangle only when those lines converge to the right. The breakout side
 * decides the direction: the newest close outside the upper line is bullish, outside the lower line
 * bearish, and the flat side of an ascending or descending triangle supplies the lean before that.
 * `target` is the first leg's height projected off the breakout line; `invalidation` is the far side.
 */
export function detectTriangle(pivots: readonly Pivot[], candles: readonly Candle[]): PatternHit | null {
    if (pivots.length !== 4 || !usable(pivots)) return null;
    const [p1, p2, p3, p4] = pivots;
    if (p1.kind === p2.kind || p2.kind === p3.kind || p3.kind === p4.kind) return null;

    const highs = pivots.filter((pivot) => pivot.kind === 'high');
    const lows = pivots.filter((pivot) => pivot.kind === 'low');
    if (highs.length !== 2 || lows.length !== 2) return null;
    const [high1, high2] = highs;
    const [low1, low2] = lows;

    const highSlope = slopeOf(high1, high2);
    const lowSlope = slopeOf(low1, low2);
    // Converging to the right means the upper line rises less than the lower one; anything else is a
    // wedge opening out, and its "apex" would sit behind the pattern.
    if (!(highSlope < lowSlope)) return null;
    const apex = apexOf(pointOf(high1), pointOf(high2), pointOf(low1), pointOf(low2));
    if (apex !== null && apex <= p4.time) return null;

    // A side counts as flat when it drifts less than 2% of price across the pattern.
    const price = (Math.abs(high1.price) + Math.abs(high2.price) + Math.abs(low1.price) + Math.abs(low2.price)) / 4;
    const flat = Math.abs(high2.price - high1.price) <= price * 0.02;
    const base = Math.abs(low2.price - low1.price) <= price * 0.02;
    const variant: TriangleVariant = flat && !base ? 'ascending' : base && !flat ? 'descending' : 'symmetric';

    const last = candles[candles.length - 1];
    const close = last?.close;
    const readAt = last && Number.isFinite(last.time) ? last.time : p4.time;
    const upper = lineAt(pointOf(high1), pointOf(high2), readAt);
    const lower = lineAt(pointOf(low1), pointOf(low2), readAt);
    const bullishBreak = typeof close === 'number' && Number.isFinite(close) && close > upper;
    const bearishBreak = typeof close === 'number' && Number.isFinite(close) && close < lower;
    const direction: PatternDirection = bullishBreak ? 'bullish' : bearishBreak ? 'bearish' : variant === 'descending' ? 'bearish' : 'bullish';

    const height = Math.abs(p2.price - p1.price);
    return {
        pattern: 'triangle',
        direction,
        tool: PATTERN_TOOL.triangle,
        points: asPoints(pivots),
        labels: labelsFor('triangle'),
        invalidation: direction === 'bullish' ? lower : upper,
        target: direction === 'bullish' ? upper + height : lower - height,
        confirmed: bullishBreak || bearishBreak,
        foundAt: pivots.length,
    };
}

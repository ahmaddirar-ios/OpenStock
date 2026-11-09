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

/** The pivots as plain points, which is all a detector or a drawing needs. */
const asPoints = (pivots: readonly Pivot[]): DrawPoint[] =>
    pivots.map((pivot) => ({ time: pivot.time, price: pivot.price }));

/** Only a finite set of pivots is a shape; a NaN anywhere would poison every ratio below. */
const usable = (pivots: readonly Pivot[]): boolean =>
    pivots.every((pivot) => Number.isFinite(pivot.time) && Number.isFinite(pivot.price));

/**
 * Wolfe wave: five turns whose 1-3 and 2-4 lines converge and whose fifth point pierces the 1-3
 * line. The channel's own rules live in lib/wolfe.ts; this only dresses the answer as a hit. The
 * target is the 1-4 (EPA) line read where the two channel lines meet.
 */
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

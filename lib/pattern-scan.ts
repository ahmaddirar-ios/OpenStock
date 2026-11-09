// The scan: one zigzag per symbol, then every requested detector walked backwards over the windows
// of that zigzag. No fetch, no clock — lib/actions/pattern-scan.actions.ts does the I/O.

import { DETECTORS, PATTERN_ORDER, PATTERN_POINTS, type PatternHit, type PatternId } from '@/lib/patterns';
import { detectPivots, type AutoSensitivity, type PivotOptions } from '@/lib/auto-count';
import type { Candle } from '@/lib/yahoo-candles';

/** Everything the scanner offers, in the picker's order. */
export const SCAN_PATTERNS: readonly PatternId[] = PATTERN_ORDER;

/** Symbols per server call. The same batch size the formula screen uses. */
export const SCAN_BATCH = 8;
/** The ceiling the action enforces, so one request cannot ask for the whole market. */
export const MAX_SCAN_SYMBOLS = 240;

/**
 * The zigzag settings behind a sensitivity. This lives here rather than in the action because a
 * `'use server'` module may only export async functions, and this is a plain conversion.
 */
export function pivotOptionsFor(sensitivity: AutoSensitivity): PivotOptions {
    return sensitivity === 'atr' ? { mode: 'atr' } : { mode: 'percent', percent: Number(sensitivity) };
}

/** Where each id sits in the picker's order, for the tie-break when two hits end on the same bar. */
const RANK = new Map<PatternId, number>(PATTERN_ORDER.map((id, index) => [id, index]));

/**
 * Runs every requested detector over the pivots of one symbol and returns the newest hit of each
 * kind. A detector sees only its own window; the scan owns the absolute end index, so `foundAt` is
 * rewritten here and "newest first" means what it says. Unknown ids are skipped, not thrown on.
 */
export function scanCandles(
    candles: Candle[],
    patterns: readonly PatternId[],
    options: PivotOptions,
): PatternHit[] {
    const pivots = detectPivots(candles, options);
    if (pivots.length < 4) return [];

    const hits: PatternHit[] = [];
    for (const id of patterns) {
        const detect = DETECTORS[id];
        if (!detect) continue;
        const points = PATTERN_POINTS[id];
        for (let end = pivots.length; end >= points; end -= 1) {
            const hit = detect(pivots.slice(end - points, end), candles);
            // The four harmonic ids share one detector, and it names the variant it actually found.
            // Asking for a Bat must not report a Gartley, or the same shape lands four times.
            if (!hit || hit.pattern !== id) continue;
            hits.push({ ...hit, foundAt: end });
            break;
        }
    }

    return hits.sort((a, b) => b.foundAt - a.foundAt || (RANK.get(a.pattern) ?? 0) - (RANK.get(b.pattern) ?? 0));
}
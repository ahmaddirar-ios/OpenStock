// The screener's formula filter. Every other criterion reads a number the snapshot already holds;
// a formula has to be run, so this is the one filter that costs a fetch per symbol. The pure half
// lives here — one symbol's bars in, a yes/no and the number behind it out — so the server action
// only has to fetch and loop.

import { evaluateFormula, type FormulaBar } from '@/lib/formula';

/** Symbols per server call: enough to make progress, small enough that one call stays quick. */
export const SCREEN_BATCH = 12;

/** The most symbols one screen will look at. Beyond this the answer stops being worth the wait. */
export const MAX_SCREEN_SYMBOLS = 240;

export type FormulaScreenHit = {
    symbol: string;
    match: boolean;
    /** The formula's value on the newest bar, when it had one. Null means it said nothing that bar. */
    value: number | null;
};

/**
 * A formula matches when its newest value is true: a finite number that is not zero. That is how
 * `close > sma(close, 50)` and `rsi(close, 14) < 30` both read, and how a formula that only has
 * something to say after 200 bars (`sma(close, 200)`) stays out of the answer on short history
 * instead of silently matching.
 */
export function screenFormulaMatch(bars: readonly FormulaBar[], expression: string): { match: boolean; value: number | null } {
    if (bars.length === 0) return { match: false, value: null };
    const result = evaluateFormula(expression, bars);
    if (!result.ok) return { match: false, value: null };
    const last = result.values[result.values.length - 1];
    if (last == null || !Number.isFinite(last)) return { match: false, value: null };
    return { match: last !== 0, value: last };
}

/** Ticks the list into the batches the server will be asked for. */
export function screenBatches<T>(items: readonly T[], size = SCREEN_BATCH): T[][] {
    const out: T[][] = [];
    for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
    return out;
}

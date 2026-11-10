import { describe, expect, it } from 'vitest';
import { MAX_SCREEN_SYMBOLS, SCREEN_BATCH, screenBatches, screenFormulaMatch } from '@/lib/formula/screener';
import type { FormulaBar } from '@/lib/formula/formula';

const bar = (close: number, volume = 1_000): FormulaBar => ({ time: 0, open: close, high: close, low: close, close, volume });

const rising = (count: number): FormulaBar[] => Array.from({ length: count }, (_, i) => bar(100 + i));

describe('screenFormulaMatch', () => {
    it('matches when the newest value is true', () => {
        expect(screenFormulaMatch(rising(30), 'close > sma(close, 10)').match).toBe(true);
        expect(screenFormulaMatch(rising(30), 'close < sma(close, 10)').match).toBe(false);
    });

    it('reports the number behind the answer', () => {
        const { value } = screenFormulaMatch(rising(30), 'close - sma(close, 10)');
        expect(value).not.toBeNull();
        expect(value as number).toBeGreaterThan(0);
    });

    it('does not match a formula that has nothing to say yet', () => {
        // A 200-bar average has no value on 30 bars, so the symbol stays out rather than passing.
        expect(screenFormulaMatch(rising(30), 'close > sma(close, 200)').match).toBe(false);
        // And a formula that is only the average has no number at all on the newest bar.
        expect(screenFormulaMatch(rising(30), 'sma(close, 200)')).toEqual({ match: false, value: null });
    });

    it('treats zero as false and a broken formula as no match', () => {
        expect(screenFormulaMatch(rising(10), '0').match).toBe(false);
        expect(screenFormulaMatch(rising(10), 'close >').match).toBe(false);
        expect(screenFormulaMatch([], 'close > 1')).toEqual({ match: false, value: null });
    });

    it('reads a comparison as a boolean, not as a price', () => {
        const { match, value } = screenFormulaMatch(rising(20), 'close > 0');
        expect(match).toBe(true);
        expect(value).toBe(1);
    });
});

describe('screenBatches', () => {
    it('splits into the size the server accepts and keeps the order', () => {
        const items = Array.from({ length: 30 }, (_, i) => i);
        const batches = screenBatches(items);
        expect(batches).toHaveLength(Math.ceil(30 / SCREEN_BATCH));
        expect(batches.flat()).toEqual(items);
        expect(batches.every((batch) => batch.length <= SCREEN_BATCH)).toBe(true);
    });

    it('handles an empty list and a custom size', () => {
        expect(screenBatches([])).toEqual([]);
        expect(screenBatches([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
        expect(MAX_SCREEN_SYMBOLS).toBeGreaterThan(SCREEN_BATCH);
    });
});

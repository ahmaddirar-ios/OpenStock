import { describe, expect, it } from 'vitest';
import {
    MAX_SAVED_FORMULAS,
    addSavedFormula,
    cleanFormulaName,
    mergeFormulas,
    normalizeSavedFormulas,
    parseSavedFormulas,
    removeSavedFormula,
} from '@/lib/formula/library';

describe('formula library', () => {
    it('keeps a named expression', () => {
        const list = addSavedFormula([], '  The spread ', ' ema(close,9) - ema(close,21) ', 'a1', 1000);
        expect(list).toEqual([{ id: 'a1', name: 'The spread', expression: 'ema(close,9) - ema(close,21)', updatedAt: 1000 }]);
        expect(removeSavedFormula(list, 'a1')).toEqual([]);
    });

    it('replaces a formula with the same name, ignoring case', () => {
        const first = addSavedFormula([], 'Spread', 'close - open', 'a1');
        const second = addSavedFormula(first, 'spread', 'high - low', 'a2');
        expect(second).toHaveLength(1);
        expect(second[0]).toMatchObject({ id: 'a2', expression: 'high - low' });
    });

    it('refuses an empty name, an unparsable expression, and a full shelf', () => {
        expect(addSavedFormula([], '   ', 'close')).toEqual([]);
        expect(addSavedFormula([], 'broken', 'close + ')).toEqual([]);
        const full = Array.from({ length: MAX_SAVED_FORMULAS }, (_, i) => ({ id: `f${i}`, name: `f${i}`, expression: 'close' }));
        expect(addSavedFormula(full, 'one more', 'close')).toHaveLength(MAX_SAVED_FORMULAS);
    });

    it('drops junk and formulas that no longer parse', () => {
        expect(parseSavedFormulas(null)).toEqual([]);
        expect(parseSavedFormulas('not json')).toEqual([]);
        expect(parseSavedFormulas(JSON.stringify([{ id: 'x', name: 'bad', expression: 'close +' }]))).toEqual([]);
        expect(parseSavedFormulas(JSON.stringify([{ name: 'no id', expression: 'close' }]))).toEqual([]);
    });

    it('keeps a multi-step formula on one line', () => {
        const [saved] = addSavedFormula([], 'mid', 'mid = (high + low) / 2;\n close - mid', 'm1');
        expect(saved.expression).toBe('mid = (high + low) / 2; close - mid');
    });

    it('caps the name length', () => {
        expect(cleanFormulaName('x'.repeat(50))).toHaveLength(28);
    });

    it('validates a shelf from any source, entry by entry', () => {
        expect(normalizeSavedFormulas(null)).toEqual([]);
        expect(normalizeSavedFormulas('nope')).toEqual([]);
        expect(
            normalizeSavedFormulas([
                { id: 'a', name: 'ok', expression: 'close', updatedAt: 5 },
                { id: 'b', name: 'broken', expression: 'close +' },
                { id: 'c', name: 'OK', expression: 'open' },
                { id: '', name: 'no id', expression: 'close' },
            ]),
        ).toEqual([{ id: 'a', name: 'ok', expression: 'close', updatedAt: 5 }]);
    });

    it('merges the browser and the account, newest per id and one per name', () => {
        const local = [
            { id: 'a', name: 'spread', expression: 'close - open', updatedAt: 10 },
            { id: 'b', name: 'range', expression: 'high - low', updatedAt: 30 },
        ];
        const remote = [
            { id: 'a', name: 'spread', expression: 'ema(close,9) - ema(close,21)', updatedAt: 20 },
            { id: 'c', name: 'Range', expression: 'high - low', updatedAt: 40 },
            { id: 'd', name: 'rsi', expression: 'rsi(close, 14)', updatedAt: 5 },
        ];
        const merged = mergeFormulas(local, remote);
        expect(merged.map((formula) => formula.id)).toEqual(['c', 'a', 'd']);
        expect(merged.find((formula) => formula.id === 'a')?.expression).toBe('ema(close,9) - ema(close,21)');
    });

    it('keeps the local copy when the account has nothing newer', () => {
        const local = [{ id: 'a', name: 'spread', expression: 'close - open', updatedAt: 50 }];
        const remote = [{ id: 'a', name: 'spread', expression: 'high - low', updatedAt: 10 }];
        expect(mergeFormulas(local, remote)[0].expression).toBe('close - open');
    });
});

import { DEFAULT_THEME, THEME_SCRIPT, isTheme } from '@/lib/theme';

describe('theme', () => {
    it('accepts the two themes and nothing else', () => {
        expect(isTheme('dark')).toBe(true);
        expect(isTheme('light')).toBe(true);
        expect(isTheme('system')).toBe(false);
        expect(DEFAULT_THEME).toBe('dark');
    });

    it('runs before the paint and sets the same keys the app sets', () => {
        // The inline script cannot import anything, so its keys are asserted here instead.
        expect(THEME_SCRIPT).toContain("localStorage.getItem('openstock-theme')");
        expect(THEME_SCRIPT).toContain("dataset.theme");
        expect(THEME_SCRIPT).toContain("classList.toggle('dark'");
        expect(THEME_SCRIPT).toContain('prefers-color-scheme: light');
    });
});

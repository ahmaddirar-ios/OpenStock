import { describe, expect, it } from 'vitest';
import {
    checkFormula,
    evaluateFormula,
    formulaAst,
    formulaPlotCount,
    type FormulaBar,
} from '@/lib/formula';
import { rsi } from '@/lib/indicators';

const bar = (close: number, index = 0): FormulaBar => ({
    time: index,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
});

const bars = (closes: number[]): FormulaBar[] => closes.map((close, i) => bar(close, i));

const values = (expression: string, closes: number[]) => {
    const result = evaluateFormula(expression, bars(closes));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    return result.values;
};

describe('formula language v2', () => {
    it('keeps the arithmetic it always had', () => {
        expect(values('(high + low) / 2 - close', [10, 20])).toEqual([0, 0]);
        expect(values('2 ^ 3 ^ 2', [10])).toEqual([512]);
    });

    it('reads series history and lets it compose with calls', () => {
        expect(values('close[1]', [1, 2, 3])).toEqual([NaN, 1, 2]);
        expect(values('close - close[1]', [1, 2, 4])).toEqual([NaN, 1, 2]);
        expect(values('sma(close, 2)[1]', [1, 2, 3, 4])).toEqual([NaN, NaN, 1.5, 2.5]);
        expect(values('close[0]', [7])).toEqual([7]);
    });

    it('rejects a negative or fractional history offset with a position', () => {
        const negative = checkFormula('close[-1]');
        expect(negative.ok).toBe(false);
        if (!negative.ok) {
            expect(negative.error).toBe('history_offset');
            expect(negative.position).toBe(6);
        }
        expect(checkFormula('close[1.5]').ok).toBe(false);
    });

    it('parses and/or/not with the documented precedence', () => {
        // or binds loosest: (0 or 0) and 1 => 0, while 0 or (0 and 1) => 0 too, so use a sharper pair.
        expect(values('1 or 0 and 0', [1])).toEqual([1]);
        expect(values('(1 or 0) and 0', [1])).toEqual([0]);
        expect(values('not 0', [1])).toEqual([1]);
        expect(values('not 1 and 1', [1])).toEqual([0]);
        expect(values('close > 5 and close < 20', [10])).toEqual([1]);
        expect(values('close < 5 or close > 20', [10])).toEqual([0]);
    });

    it('evaluates if, nz, na and bar_index', () => {
        expect(values('if(close > 5, 1, -1)', [4, 6])).toEqual([-1, 1]);
        expect(values('nz(close[1])', [1, 2])).toEqual([0, 1]);
        expect(values('nz(close[1], -1)', [1, 2])).toEqual([-1, 1]);
        expect(values('na', [1, 2])).toEqual([NaN, NaN]);
        expect(values('bar_index', [1, 2, 3])).toEqual([0, 1, 2]);
        expect(values('nz(close[1]) + bar_index', [5, 6, 7])).toEqual([0, 6, 8]);
    });

    it('matches the built-in RSI', () => {
        const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i / 10);
        const expected = rsi(closes, 14);
        const got = values('rsi(close, 14)', closes);
        expect(got[13]).toBeNaN();
        for (let i = 14; i < closes.length; i += 1) {
            expect(got[i]).toBeCloseTo(expected[i] as number, 10);
        }
    });

    it('still draws plots and counts them', () => {
        expect(formulaPlotCount('plot(close); plot(close[1])')).toBe(2);
        const result = evaluateFormula('plot(close); plot(close[1])', bars([1, 2]));
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.lines.map((line) => line.key)).toEqual(['p1', 'p2']);
            expect(result.lines[1].values).toEqual([NaN, 1]);
        }
    });

    it('reports the column of a bad name', () => {
        const checked = checkFormula('close + nope');
        expect(checked.ok).toBe(false);
        if (!checked.ok) {
            expect(checked.error).toBe('unknown_name:nope');
            expect(checked.position).toBe(8);
        }
    });

    it('reports arity for the new functions', () => {
        const checked = checkFormula('if(close, 1)');
        expect(checked.ok).toBe(false);
        if (!checked.ok) expect(checked.error).toBe('arguments:if:2');
        expect(checkFormula('nz(close, 1, 2)').ok).toBe(false);
        expect(checkFormula('rsi(close, 14)').ok).toBe(true);
        expect(checkFormula('sma(close)').ok).toBe(false);
    });

    it('does not reserve history as a name', () => {
        const checked = checkFormula('x = close[1]; x + close');
        expect(checked.ok).toBe(true);
        expect(values('x = close[1]; x + close', [1, 2])).toEqual([NaN, 3]);
    });

    it('exposes one bare expression as an AST and rejects programs', () => {
        expect(formulaAst('close > sma(close, 20)')?.kind).toBe('binary');
        expect(formulaAst('x = close; x')).toBeNull();
        expect(formulaAst('close +')).toBeNull();
    });
});

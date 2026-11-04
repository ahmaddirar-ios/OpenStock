import { describe, expect, it } from 'vitest';
import { checkFormula, evaluateFormula, FORMULA_FUNCTIONS, FORMULA_SERIES, type FormulaBar } from '@/lib/formula';

const bars: FormulaBar[] = Array.from({ length: 10 }, (_, i) => ({
    time: 1_700_000_000 + i * 86400,
    open: 10 + i,
    high: 11 + i,
    low: 9 + i,
    close: 10 + i,
    volume: 100 * (i + 1),
}));

const values = (expression: string) => {
    const result = evaluateFormula(expression, bars);
    if (!result.ok) throw new Error(result.error);
    return result.values;
};

describe('formula language', () => {
    it('reads a series straight', () => {
        expect(values('close')).toEqual(bars.map((bar) => bar.close));
        expect(values('volume')).toEqual(bars.map((bar) => bar.volume));
    });

    it('does arithmetic with precedence and parentheses', () => {
        expect(values('2 + 3 * 4')[0]).toBe(14);
        expect(values('(2 + 3) * 4')[0]).toBe(20);
        expect(values('2 ^ 3 ^ 2')[0]).toBe(512);
        expect(values('-close + 1')[0]).toBe(-9);
        expect(values('high - low')[0]).toBe(2);
    });

    it('averages with the usual functions', () => {
        const sma3 = values('sma(close, 3)');
        expect(sma3[0]).toBeNaN();
        expect(sma3[1]).toBeNaN();
        expect(sma3[2]).toBeCloseTo(11, 10);
        const ema3 = values('ema(close, 3)');
        // An EMA starts on the first bar: no warm-up gap. With n=3 the weight is 0.5, so the
        // second bar sits halfway between its close and the first one.
        expect(ema3[0]).toBe(10);
        expect(ema3[1]).toBeCloseTo(10.5, 10);
        expect(values('sum(volume, 2)')[1]).toBe(300);
        expect(values('highest(high, 3)')[2]).toBe(13);
        expect(values('lowest(low, 3)')[2]).toBe(9);
        expect(values('change(close)')[1]).toBe(1);
    });

    it('refuses what it cannot evaluate, with a reason', () => {
        expect(checkFormula('close + ').ok).toBe(false);
        expect(checkFormula('close + 1')).toEqual({ ok: true });
        const unknown = checkFormula('macd(close, 1, 2)');
        expect(unknown.ok).toBe(false);
        expect(unknown.ok === false && unknown.error).toContain('unknown_function');
        const series = checkFormula('candle');
        expect(series.ok === false && series.error).toContain('unknown_series');
        expect(checkFormula('close @ 2').ok).toBe(false);
        expect(checkFormula('(close + 1').ok).toBe(false);
    });

    it('divides by zero into a gap rather than an infinity', () => {
        expect(values('close / 0')[0]).toBeNaN();
    });

    it('returns the same length as the bars', () => {
        expect(values('sma(close, 5)')).toHaveLength(bars.length);
        expect(evaluateFormula('close', [])).toEqual({ ok: true, values: [] });
    });

    it('documents every series and function it accepts', () => {
        for (const name of FORMULA_SERIES) expect(checkFormula(name)).toEqual({ ok: true });
        for (const fn of FORMULA_FUNCTIONS) {
            const args = fn.name === 'abs' || fn.name === 'sqrt' || fn.name === 'change' ? 'close' : fn.name === 'max' || fn.name === 'min' ? 'close, open' : 'close, 5';
            expect(checkFormula(`${fn.name}(${args})`), fn.name).toEqual({ ok: true });
        }
    });
});

import { describe, expect, it } from 'vitest';
import { checkFormula, evaluateFormula, FORMULA_EXAMPLES, FORMULA_FUNCTIONS, FORMULA_SERIES, type FormulaBar } from '@/lib/formula';

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
        // A bare word is a variable now, so the reason says name rather than series.
        const series = checkFormula('candle');
        expect(series.ok === false && series.error).toContain('unknown_name');
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

    it('names a value and reads it back', () => {
        expect(values('mid = (high + low) / 2; close - mid')).toEqual(bars.map((bar) => bar.close - (bar.high + bar.low) / 2));
        // Two variables, the second built on the first.
        expect(values('a = close * 2; b = a + 1; b')[0]).toBe(21);
    });

    it('decides with comparisons and a ternary', () => {
        // Closes run 10, 11, 12…: strictly above 11 starts at the third bar.
        expect(values('close > 11 ? 1 : -1').slice(0, 3)).toEqual([-1, -1, 1]);
        expect(values('close >= 11 ? 1 : -1')[2]).toBe(1);
        expect(values('close == 11 ? 1 : 0')[1]).toBe(1);
        expect(values('close != 11 ? 1 : 0')[0]).toBe(1);
    });

    it('reports a crossing on the bar it happens', () => {
        const up = values('crossover(close, 12)');
        // The first bar at or above 12 is bar 2 (close 12).
        expect(up).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
        const under = values('crossunder(close, 12)');
        expect(under.every((value) => value === 0)).toBe(true);
    });

    it('measures spread and deviation', () => {
        expect(values('stdev(close, 3)')[2]).toBeCloseTo(0.8165, 3);
        expect(values('pow(2, 3)')[0]).toBe(8);
    });

    it('refuses a name it hides from a series or a function', () => {
        const reserved = checkFormula('sma = close; sma');
        expect(reserved.ok).toBe(false);
        expect(reserved.ok === false && reserved.error).toContain('reserved_name');
    });

    it('reads a variable only after it is declared', () => {
        const early = checkFormula('close - mid; mid = sma(close, 3)');
        expect(early.ok).toBe(false);
        expect(early.ok === false && early.error).toContain('unknown_name');
    });

    it('ships examples that all parse', () => {
        for (const example of FORMULA_EXAMPLES) expect(checkFormula(example), example).toEqual({ ok: true });
    });
});
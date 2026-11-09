import { describe, expect, it } from 'vitest';
import {
    buildExpression,
    defaultBuilderCondition,
    emptyBuilderGroup,
    parseBuilder,
    type BuilderGroup,
} from '@/lib/formula/builder';

const group = (): BuilderGroup => ({
    join: 'and',
    conditions: [
        { left: { kind: 'price', series: 'close' }, op: '>', right: { kind: 'indicator', fn: 'sma', source: 'close', period: 20 } },
        { left: { kind: 'indicator', fn: 'rsi', source: 'close', period: 14 }, op: '<', right: { kind: 'number', value: 30 } },
        { left: { kind: 'price', series: 'close', offset: 1 }, op: 'crossesAbove', right: { kind: 'indicator', fn: 'ema', source: 'close', period: 9 } },
    ],
});

describe('formula builder', () => {
    it('builds text with parentheses around every joined condition', () => {
        expect(buildExpression(group())).toBe(
            '(close > sma(close, 20)) and (rsi(close, 14) < 30) and (crossover(close[1], ema(close, 9)))',
        );
    });

    it('renders a crossing as a call, not an infix operator', () => {
        const text = buildExpression({
            join: 'or',
            conditions: [
                { left: { kind: 'price', series: 'close' }, op: 'crossesAbove', right: { kind: 'indicator', fn: 'sma', source: 'close', period: 50 } },
                { left: { kind: 'price', series: 'close' }, op: 'crossesBelow', right: { kind: 'indicator', fn: 'sma', source: 'close', period: 200 } },
            ],
        });
        expect(text).toContain('crossover(close, sma(close, 50))');
        expect(text).toContain('crossunder(close, sma(close, 200))');
        expect(text).not.toContain('crossesAbove');
        expect(parseBuilder(text)?.conditions.map((c) => c.op)).toEqual(['crossesAbove', 'crossesBelow']);
    });

    it('round-trips a group through text', () => {
        const original = group();
        const text = buildExpression(original);
        expect(parseBuilder(text)).toEqual(original);
    });

    it('reads hand-written parentheses back into the same rows', () => {
        const typed = '(close > sma(close, 20)) and (close > sma(close, 50))';
        expect(parseBuilder(typed)?.conditions).toHaveLength(2);
        expect(buildExpression(parseBuilder(typed)!)).toBe(typed);
    });

    it('round-trips a single condition without parentheses', () => {
        const text = buildExpression({ join: 'and', conditions: [defaultBuilderCondition()] });
        expect(text).toBe('close > sma(close, 20)');
        expect(parseBuilder(text)?.conditions).toHaveLength(1);
    });

    it('returns an empty string for an empty group', () => {
        expect(buildExpression(emptyBuilderGroup())).toBe('');
        expect(parseBuilder('')).toBeNull();
    });

    it('declines formulas outside the rows', () => {
        expect(parseBuilder('close > sma(close, 20) or (close < 5 and close > 1)')).toBeNull();
        expect(parseBuilder('close - sma(close, 20)')).toBeNull();
        expect(parseBuilder('close > 5 ? 1 : 0')).toBeNull();
        expect(parseBuilder('plot(close)')).toBeNull();
        expect(parseBuilder('close[1] > sma(high, 10)[2]')?.conditions[0]).toEqual({
            left: { kind: 'price', series: 'close', offset: 1 },
            op: '>',
            right: { kind: 'indicator', fn: 'sma', source: 'high', period: 10, offset: 2 },
        });
    });

    it('declines unsupported indicators and non-literal periods', () => {
        expect(parseBuilder('close > rma(close, 20)')).toBeNull();
        expect(parseBuilder('close > sma(close, 14 + 6)')).toBeNull();
        expect(parseBuilder('nz(close) > 1')).toBeNull();
    });

    it('keeps parameter placeholders intact through the builder', () => {
        const text = '(close > sma(close, {fast})) and (rsi(close, {period}) < {level})';
        const parsed = parseBuilder(text, ['fast', 'period', 'level']);
        expect(parsed).not.toBeNull();
        expect(parsed!.conditions[0].right).toEqual({ kind: 'indicator', fn: 'sma', source: 'close', period: 1, periodParam: 'fast' });
        expect(parsed!.conditions[1].left).toEqual({ kind: 'indicator', fn: 'rsi', source: 'close', period: 1, periodParam: 'period' });
        expect(parsed!.conditions[1].right).toEqual({ kind: 'param', key: 'level' });
        expect(buildExpression(parsed!)).toBe(text);
    });

    it('declines a placeholder it was not told about', () => {
        expect(parseBuilder('close > {fast}', [])).toBeNull();
        expect(parseBuilder('close > {fast}', ['other'])).toBeNull();
    });

    it('caps the rows it builds', () => {
        const many = { ...group(), conditions: Array.from({ length: 12 }, () => defaultBuilderCondition()) };
        expect(buildExpression(many).split(' and ')).toHaveLength(8);
    });
});

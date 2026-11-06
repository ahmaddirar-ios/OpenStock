import { describe, expect, it } from 'vitest';
import {
    evaluateMeasure,
    groupedRuleCount,
    groupedRowsFromAlerts,
    measureRule,
    planGroups,
    rememberUpdate,
    type AlertRule,
    type GroupedRuleRow,
} from '@/lib/alerts';
import { DEFAULT_CUSTOM_STRATEGY } from '@/lib/custom-strategy';
import type { Candle } from '@/lib/yahoo-candles';

const quote = (price: number, changePercent = 0) => ({ price, changePercent });

const row = (id: string, over: Partial<GroupedRuleRow> = {}): GroupedRuleRow => ({
    id,
    groupId: 'a1',
    join: 'and',
    symbol: 'AAPL',
    condition: 'ABOVE',
    targetPrice: 100,
    ...over,
});

const series = (closes: number[]): Candle[] =>
    closes.map((close) => ({ time: 0, open: close, high: close, low: close, close, volume: 1_000 }));

describe('planGroups — AND', () => {
    it('fires when every rule is true', () => {
        const plan = planGroups(
            [row('a1:0', { targetPrice: 100 }), row('a1:1', { targetPrice: 200, condition: 'ABOVE' })],
            { AAPL: quote(250) },
        );
        expect(plan.fires).toHaveLength(1);
        expect(plan.fires[0]).toMatchObject({ groupId: 'a1', join: 'and', value: 250 });
        expect(plan.checked).toBe(1);
        expect(plan.skipped).toBe(0);
    });

    it('is false as soon as one rule is false, even if another had no data', () => {
        const plan = planGroups(
            [row('a1:0', { targetPrice: 300 }), row('a1:1', { targetPrice: 100, condition: 'RSI_BELOW', params: { period: 14 } })],
            { AAPL: quote(250) },
            {},
        );
        expect(plan.fires).toHaveLength(0);
        // The price rule was answered false, so the unanswered series rule cannot keep it open.
        expect(plan.checked).toBe(1);
        expect(plan.skipped).toBe(0);
    });

    it('is skipped while one rule has no data and everything readable is true', () => {
        const plan = planGroups(
            [row('a1:0', { targetPrice: 100 }), row('a1:1', { targetPrice: 100, condition: 'RSI_BELOW', params: { period: 14 } })],
            { AAPL: quote(250) },
            {},
        );
        expect(plan.fires).toHaveLength(0);
        expect(plan.skipped).toBe(1);
        expect(plan.checked).toBe(0);
    });
});

describe('planGroups — OR', () => {
    it('fires as soon as one rule is true, even with an unreadable sibling', () => {
        const plan = planGroups(
            [
                row('a1:0', { join: 'or', targetPrice: 300 }),
                row('a1:1', { join: 'or', targetPrice: 100 }),
                row('a1:2', { join: 'or', targetPrice: 100, condition: 'RSI_BELOW', params: { period: 14 } }),
            ],
            { AAPL: quote(250) },
            {},
        );
        expect(plan.fires).toHaveLength(1);
        expect(plan.fires[0].join).toBe('or');
        expect(plan.checked).toBe(1);
        expect(plan.skipped).toBe(0);
    });

    it('is skipped when nothing was true and something could not be read', () => {
        const plan = planGroups(
            [
                row('a1:0', { join: 'or', targetPrice: 300 }),
                row('a1:1', { join: 'or', targetPrice: 300, condition: 'RSI_BELOW', params: { period: 14 } }),
            ],
            { AAPL: quote(250) },
            {},
        );
        expect(plan.fires).toHaveLength(0);
        expect(plan.skipped).toBe(1);
    });
});

describe('planGroups — the remembered values', () => {
    it('updates every readable rule and leaves skipped ones untouched', () => {
        const plan = planGroups(
            [
                row('a1:0', { targetPrice: 300 }),
                row('a1:1', { targetPrice: 100, condition: 'RSI_BELOW', params: { period: 14 } }),
            ],
            { AAPL: quote(250) },
            {},
        );
        expect(plan.updates).toEqual([{ id: 'a1:0', value: 250 }]);
    });

    it('separates alerts by group, even when their rules interleave', () => {
        const plan = planGroups(
            [row('a1:0', { targetPrice: 100 }), row('a2:0', { groupId: 'a2', targetPrice: 300 })],
            { AAPL: quote(250) },
        );
        expect(plan.fires.map((fire) => fire.groupId)).toEqual(['a1']);
        expect(plan.checked).toBe(2);
    });
});

describe('groupedRowsFromAlerts', () => {
    it('reads an alert written before groups as a group of one', () => {
        const { rows, owners } = groupedRowsFromAlerts([
            { id: 'a1', symbol: 'AAPL', condition: 'ABOVE', targetPrice: 100, lastPrice: 99, join: undefined },
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: 'a1:0', groupId: 'a1', join: 'and', lastPrice: 99 });
        expect(owners.get('a1:0')).toEqual({ alertId: 'a1', index: 0 });
    });

    it('expands a real group and keeps the join', () => {
        const { rows } = groupedRowsFromAlerts([
            {
                id: 'a1',
                symbol: 'AAPL',
                condition: 'ABOVE',
                targetPrice: 100,
                join: 'or',
                rules: [
                    { condition: 'ABOVE', targetPrice: 100, lastValue: 90 },
                    { condition: 'BELOW', targetPrice: 50, lastValue: 60 },
                ],
            },
        ]);
        expect(rows.map((entry) => entry.condition)).toEqual(['ABOVE', 'BELOW']);
        expect(rows.every((entry) => entry.join === 'or')).toBe(true);
        expect(rows[1].lastPrice).toBe(60);
    });

    it('counts a rule set, defaulting to one', () => {
        expect(groupedRuleCount({})).toBe(1);
        expect(groupedRuleCount({ rules: [] })).toBe(1);
        expect(groupedRuleCount({ rules: [{}, {}, {}] })).toBe(3);
    });
});

describe('rememberUpdate', () => {
    it('writes the first rule to both places and later ones only to their slot', () => {
        expect(rememberUpdate({ alertId: 'a1', index: 0 }, 101)).toEqual({
            'rules.0.lastValue': 101,
            lastPrice: 101,
        });
        expect(rememberUpdate({ alertId: 'a1', index: 2 }, 5, 0.4)).toEqual({
            'rules.2.lastValue': 5,
            'rules.2.lastGap': 0.4,
        });
    });
});

describe('formula and strategy rules', () => {
    const bars = series([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111]);

    it('reads a formula on the newest bar and fires on a non-zero answer', () => {
        const rule: AlertRule = { condition: 'FORMULA', targetPrice: 0, params: { expression: 'close > sma(close, 5)' } };
        const measure = measureRule(rule, bars);
        expect(measure).not.toBeNull();
        expect(measure!.value).toBe(1);
        expect(evaluateMeasure(rule, measure!)).toBe(true);
    });

    it('does not fire a formula that is false, and skips one that cannot be read', () => {
        const falseRule: AlertRule = { condition: 'FORMULA', targetPrice: 0, params: { expression: 'close < sma(close, 5)' } };
        expect(evaluateMeasure(falseRule, measureRule(falseRule, bars)!)).toBe(false);
        const shortRule: AlertRule = { condition: 'FORMULA', targetPrice: 0, params: { expression: 'sma(close, 200)' } };
        expect(measureRule(shortRule, bars)).toBeNull();
        const broken: AlertRule = { condition: 'FORMULA', targetPrice: 0, params: { expression: 'close >' } };
        expect(measureRule(broken, bars)).toBeNull();
    });

    it('reads a strategy entry signal as a yes or no', () => {
        const rule: AlertRule = {
            condition: 'STRATEGY',
            targetPrice: 0,
            params: { strategy: { ...DEFAULT_CUSTOM_STRATEGY, entry: 'close > 0', exit: 'close < 0', params: [] } },
        };
        const measure = measureRule(rule, bars);
        expect(measure).not.toBeNull();
        expect(measure!.value).toBe(1);
        expect(evaluateMeasure(rule, measure!)).toBe(true);
    });

    it('skips a strategy that no longer parses', () => {
        const rule: AlertRule = { condition: 'STRATEGY', targetPrice: 0, params: { strategy: { entry: '', exit: '' } as never } };
        expect(measureRule(rule, bars)).toBeNull();
    });
});

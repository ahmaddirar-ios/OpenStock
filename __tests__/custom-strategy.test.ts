import { describe, expect, it } from 'vitest';
import {
    MAX_CUSTOM_PARAMS,
    MAX_OPTIMIZER_COMBOS,
    backtestCustom,
    checkCustomStrategy,
    checkRule,
    customMetrics,
    customSignals,
    optimize,
    paramCombinations,
    paramValues,
    parseCustomStrategy,
    positionFraction,
    serializeStrategy,
    sourcePosition,
    substituteParams,
    walkForward,
    type CustomStrategy,
} from '@/lib/strategy/custom';
import type { Candle } from '@/lib/market/yahoo-candles';

const candle = (time: number, open: number, high: number, low: number, close: number): Candle => ({
    time,
    open,
    high,
    low,
    close,
    volume: 1_000,
});

const strategy = (over: Partial<CustomStrategy> = {}): CustomStrategy => ({
    id: 'test',
    name: 'Test',
    entry: 'bar_index == 1',
    exit: 'bar_index == 3',
    params: [],
    stopPct: 0,
    targetPct: 0,
    trailingPct: 0,
    riskPct: 0,
    direction: 'long',
    ...over,
});

const flat = (count: number, price = 100): Candle[] =>
    Array.from({ length: count }, (_, i) => candle(i, price, price + 1, price - 1, price));

describe('parseCustomStrategy', () => {
    it('rejects what cannot run and keeps what can', () => {
        expect(parseCustomStrategy(null)).toBeNull();
        expect(parseCustomStrategy({ entry: 'close > 1' })).toBeNull();
        expect(parseCustomStrategy({ exit: 'close > 1' })).toBeNull();
        expect(parseCustomStrategy({ entry: '  ', exit: 'close > 1' })).toBeNull();

        const parsed = parseCustomStrategy({
            name: '  my   plan  ',
            entry: 'close > 1',
            exit: 'close < 1',
        });
        expect(parsed).not.toBeNull();
        expect(parsed!.name).toBe('my plan');
        expect(parsed!.direction).toBe('long');
        expect(parsed!.stopPct).toBe(0);
    });

    it('clamps numbers instead of throwing a strategy away', () => {
        const parsed = parseCustomStrategy({
            entry: 'close > 1',
            exit: 'close < 1',
            stopPct: 500,
            targetPct: -10,
            trailingPct: 120,
            riskPct: 250,
            direction: 'sideways',
        })!;
        expect(parsed.stopPct).toBe(90);
        expect(parsed.targetPct).toBe(0);
        expect(parsed.trailingPct).toBe(90);
        expect(parsed.riskPct).toBe(100);
        expect(parsed.direction).toBe('long');
        expect(parseCustomStrategy({ entry: 'a', exit: 'b', direction: 'short' })!.direction).toBe('short');
        expect(parseCustomStrategy({ entry: 'a', exit: 'b', direction: 'reversal' })!.direction).toBe('reversal');
    });

    it('caps the parameter table and drops duplicates and bad keys', () => {
        const params = Array.from({ length: 12 }, (_, i) => ({ key: `p${i}`, value: i, min: 0, max: 10, step: 1 }));
        params.splice(1, 0, { key: 'p0', value: 1, min: 0, max: 10, step: 1 });
        params.splice(2, 0, { key: 'bad key', value: 1, min: 0, max: 10, step: 1 });
        const parsed = parseCustomStrategy({ entry: 'a', exit: 'b', params })!;
        expect(parsed.params.length).toBe(MAX_CUSTOM_PARAMS);
        expect(new Set(parsed.params.map((param) => param.key)).size).toBe(MAX_CUSTOM_PARAMS);
        expect(parsed.params.some((param) => param.key === 'bad key')).toBe(false);
    });

    it('keeps a value inside its own range', () => {
        const parsed = parseCustomStrategy({
            entry: 'a',
            exit: 'b',
            params: [{ key: 'fast', value: 500, min: 10, max: 20, step: 1 }],
        })!;
        expect(parsed.params[0].value).toBe(20);
    });
});

describe('parameters', () => {
    it('substitutes placeholders and leaves unknown ones for the parser to explain', () => {
        expect(substituteParams('close > sma(close, {fast})', { fast: 50 })).toBe('close > sma(close, 50)');
        expect(substituteParams('close > {missing}', { fast: 50 })).toBe('close > {missing}');
        expect(substituteParams('{a} + {b}', { a: 1, b: 2.5 })).toBe('1 + 2.5');
    });

    it('maps the table to the values the expression sees', () => {
        const parsed = parseCustomStrategy({
            entry: 'a',
            exit: 'b',
            params: [
                { key: 'fast', value: 20, min: 1, max: 40, step: 1 },
                { key: 'slow', value: 50, min: 1, max: 100, step: 1 },
            ],
        })!;
        expect(paramValues(parsed)).toEqual({ fast: 20, slow: 50 });
    });

    it('checks both rules and says which one failed', () => {
        const good = strategy({ entry: 'close > sma(close, {fast})', exit: 'close < sma(close, {fast})', params: [{ key: 'fast', value: 20, min: 1, max: 40, step: 1 }] });
        expect(checkCustomStrategy(good)).toEqual({ ok: true });

        const badEntry = strategy({ entry: 'close >' });
        const entryCheck = checkCustomStrategy(badEntry);
        expect(entryCheck.ok).toBe(false);
        if (!entryCheck.ok) expect(entryCheck.rule).toBe('entry');

        const badExit = strategy({ exit: 'close < nope' });
        const exitCheck = checkCustomStrategy(badExit);
        expect(exitCheck.ok).toBe(false);
        if (!exitCheck.ok) expect(exitCheck.rule).toBe('exit');

        const unknown = strategy({ entry: 'close > {missing}' });
        expect(checkCustomStrategy(unknown).ok).toBe(false);
    });
});

describe('rule checks', () => {
    it('reports a parse error with its position', () => {
        const ok = checkRule('close > sma(close, {fast})', { fast: 20 });
        expect(ok).toEqual({ ok: true });

        const bad = checkRule('close > nope', {});
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(typeof bad.position).toBe('number');
    });

    it('maps an error position back through the placeholders', () => {
        const text = 'close > sma(close, {fast}) and nope';
        const values = { fast: 50 };
        const substituted = substituteParams(text, values);
        const position = substituted.indexOf('nope');
        expect(sourcePosition(text, values, position)).toBe(text.indexOf('nope'));
        expect(sourcePosition(text, values, undefined)).toBeNull();
        expect(sourcePosition(text, values, 0)).toBe(0);
    });
});

describe('position sizing', () => {
    it('takes the whole account when risk is off', () => {
        expect(positionFraction(strategy())).toBe(1);
    });

    it('divides risk by the stop distance and never exceeds the account', () => {
        expect(positionFraction(strategy({ riskPct: 2, stopPct: 4 }))).toBeCloseTo(0.5, 10);
        expect(positionFraction(strategy({ riskPct: 10, stopPct: 2 }))).toBe(1);
        expect(positionFraction(strategy({ riskPct: 1, stopPct: 0 }))).toBeCloseTo(0.1, 10);
    });
});

describe('backtestCustom', () => {
    it('fills a signal on the next open and reports the round trip', () => {
        const candles = [
            candle(0, 100, 101, 99, 100),
            candle(1, 100, 102, 99, 101),
            candle(2, 101, 103, 100, 102),
            candle(3, 102, 104, 101, 103),
            candle(4, 103, 105, 102, 104),
            candle(5, 104, 106, 103, 105),
        ];
        const result = backtestCustom(candles, strategy())!;
        expect(result.trades).toHaveLength(1);
        const trade = result.trades[0];
        expect(trade.entryIndex).toBe(2);
        expect(trade.exitIndex).toBe(4);
        expect(trade.entryPrice).toBeCloseTo(101 * 1.0005 * 1.0005, 6);
        expect(trade.exitPrice).toBeCloseTo(103 * 0.9995 * 0.9995, 6);
        expect(trade.reason).toBe('signal');
        expect(trade.pnlPct).toBeCloseTo((trade.exitPrice / trade.entryPrice - 1) * 100, 8);
        expect(trade.pnl).toBeCloseTo(100 * (trade.exitPrice / trade.entryPrice - 1), 8);
    });

    it('stops out before the target when a bar touched both', () => {
        const candles = [
            candle(0, 100, 101, 99, 100),
            candle(1, 100, 101, 99, 100),
            candle(2, 100, 120, 80, 95),
            candle(3, 95, 96, 94, 95),
        ];
        const result = backtestCustom(candles, strategy({ entry: 'bar_index == 0', exit: 'bar_index == 3', stopPct: 5, targetPct: 10 }))!;
        expect(result.trades).toHaveLength(1);
        expect(result.trades[0].reason).toBe('stop');
        expect(result.trades[0].exitPrice).toBeCloseTo(100 * 1.0005 * 1.0005 * 0.95 * 0.9995 * 0.9995, 6);
        expect(result.trades[0].exitIndex).toBe(2);
    });

    it('takes the target when it is the only level the bar reached', () => {
        const candles = [
            candle(0, 100, 101, 99, 100),
            candle(1, 100, 101, 99, 100),
            candle(2, 100, 112, 100, 111),
            candle(3, 111, 112, 110, 111),
        ];
        const result = backtestCustom(candles, strategy({ entry: 'bar_index == 0', exit: 'bar_index == 3', targetPct: 10 }))!;
        expect(result.trades[0].reason).toBe('target');
        expect(result.trades[0].exitPrice).toBeCloseTo(100 * 1.0005 * 1.0005 * 1.1 * 0.9995 * 0.9995, 6);
    });

    it('tightens the trailing stop and never loosens it', () => {
        const candles = [
            candle(0, 100, 101, 99, 100),
            candle(1, 100, 105, 103, 104),
            candle(2, 104, 110, 108, 109),
            candle(3, 109, 112, 110, 111),
            candle(4, 111, 111, 105, 106),
            candle(5, 106, 107, 105, 106),
        ];
        const result = backtestCustom(candles, strategy({ entry: 'bar_index == 0', exit: 'bar_index == 99', trailingPct: 2 }))!;
        expect(result.trades).toHaveLength(1);
        const trade = result.trades[0];
        expect(trade.reason).toBe('trail');
        expect(trade.exitIndex).toBe(4);
        // 112 is the best high, so the tightest trail the bar can hold is 112 * 0.98.
        expect(trade.exitPrice).toBeCloseTo(112 * 0.98 * 0.9995 * 0.9995, 6);
    });

    it('uses the original stop as the floor when the trail is looser', () => {
        const candles = [
            candle(0, 100, 101, 99, 100),
            candle(1, 100, 101, 99, 100),
            candle(2, 100, 101, 90, 92),
            candle(3, 92, 93, 91, 92),
        ];
        const result = backtestCustom(candles, strategy({ entry: 'bar_index == 0', exit: 'bar_index == 99', stopPct: 5, trailingPct: 20 }))!;
        expect(result.trades[0].reason).toBe('stop');
        expect(result.trades[0].exitPrice).toBeCloseTo(100 * 1.0005 * 1.0005 * 0.95 * 0.9995 * 0.9995, 6);
    });

    it('short sells an entry the long system would buy', () => {
        const candles = [
            candle(0, 100, 101, 99, 100),
            candle(1, 100, 101, 99, 100),
            candle(2, 100, 101, 99, 100),
            candle(3, 90, 91, 89, 90),
            candle(4, 90, 91, 89, 90),
        ];
        const result = backtestCustom(candles, strategy({ entry: 'bar_index == 1', exit: 'bar_index == 3', direction: 'short' }))!;
        expect(result.trades).toHaveLength(1);
        expect(result.trades[0].entryPrice).toBeCloseTo(100 * 0.9995 * 0.9995, 6);
        expect(result.trades[0].exitPrice).toBeCloseTo(90 * 1.0005 * 1.0005, 6);
        expect(result.trades[0].pnl).toBeGreaterThan(0);
    });

    it('reverses on the opposite rule instead of going flat', () => {
        const candles = [
            candle(0, 100, 101, 99, 100),
            candle(1, 100, 102, 99, 101),
            candle(2, 101, 103, 100, 102),
            candle(3, 102, 104, 101, 103),
            candle(4, 103, 105, 102, 104),
            candle(5, 104, 106, 103, 105),
        ];
        const result = backtestCustom(candles, strategy({ entry: 'bar_index == 1', exit: 'bar_index == 3', direction: 'reversal' }))!;
        // Long from bar 2's open, flat-and-short at bar 4's open, then closed on the last bar.
        expect(result.trades).toHaveLength(2);
        expect(result.trades[0].entryIndex).toBe(2);
        expect(result.trades[0].exitIndex).toBe(4);
        expect(result.trades[1].entryIndex).toBe(4);
        expect(result.trades[1].exitIndex).toBe(candles.length - 1);
    });

    it('scales the result by the risk-based fraction', () => {
        const candles = flat(6);
        const full = backtestCustom(candles, strategy({ entry: 'bar_index == 0', exit: 'bar_index == 4' }))!;
        const half = backtestCustom(candles, strategy({ entry: 'bar_index == 0', exit: 'bar_index == 4', riskPct: 2, stopPct: 4 }))!;
        expect(half.trades[0].pnl).toBeCloseTo(full.trades[0].pnl * 0.5, 8);
        expect(half.trades[0].pnlPct).toBeCloseTo(full.trades[0].pnlPct, 10);
    });

    it('closes an open position on the last bar instead of hiding it', () => {
        const candles = flat(5);
        const result = backtestCustom(candles, strategy({ entry: 'bar_index == 1', exit: 'bar_index == 99' }))!;
        expect(result.trades).toHaveLength(1);
        expect(result.trades[0].exitIndex).toBe(4);
        expect(result.trades[0].reason).toBe('signal');
        expect(result.equity[result.equity.length - 1].value).toBeCloseTo(100 + result.trades[0].pnl, 8);
    });

    it('needs two bars and refuses a rule that does not parse', () => {
        expect(backtestCustom([], strategy())).toBeNull();
        expect(backtestCustom([candle(0, 1, 1, 1, 1)], strategy())).toBeNull();
        const broken = backtestCustom(flat(10), strategy({ entry: 'close >' }))!;
        expect(broken.trades).toHaveLength(0);
    });

    it('keeps one boolean per bar from each rule', () => {
        const signals = customSignals(flat(5), strategy({ entry: 'bar_index == 2', exit: 'bar_index >= 3' }));
        expect(signals.entries).toEqual([false, false, true, false, false]);
        expect(signals.exits).toEqual([false, false, false, true, true]);
    });

    it('annualises through the interval, not always as daily', () => {
        const candles = flat(30);
        const result = backtestCustom(candles, strategy({ entry: 'bar_index == 1', exit: 'bar_index == 5' }))!;
        const weekly = customMetrics(result, '1wk');
        const daily = customMetrics(result, '1d');
        expect(weekly.cagr).not.toBeNull();
        expect(daily.cagr).not.toBeNull();
        expect(weekly.cagr).not.toBeCloseTo(daily.cagr as number, 6);
        expect(customMetrics(result, '15m').cagr).toBeNull();
    });
});

const wave = (count: number): Candle[] =>
    Array.from({ length: count }, (_, i) => {
        const base = 100 + Math.sin(i / 4) * 12 + Math.cos(i / 9) * 4;
        return candle(i, base, base + 2, base - 2, base + (i % 2 === 0 ? 0.6 : -0.6));
    });

describe('optimizer', () => {
    it('caps the grid and reports that it was cut', () => {
        const params = [
            { key: 'a', value: 1, min: 1, max: 60, step: 1 },
            { key: 'b', value: 1, min: 1, max: 60, step: 1 },
        ];
        const { combos, truncated } = paramCombinations(params);
        expect(combos.length).toBeLessThanOrEqual(MAX_OPTIMIZER_COMBOS);
        expect(combos.length).toBeGreaterThan(0);
        expect(truncated).toBe(true);
        // The cap thins the grid; it must still reach both ends of every range.
        expect(combos.some((combo) => combo.a === 1)).toBe(true);
        expect(combos.some((combo) => combo.a === 60)).toBe(true);
        expect(combos.some((combo) => combo.b === 1)).toBe(true);
        expect(combos.some((combo) => combo.b === 60)).toBe(true);
        expect(paramCombinations([])).toEqual({ combos: [{}], truncated: false });
        expect(paramCombinations([{ key: 'x', value: 3, min: 3, max: 3, step: 1 }]).combos).toEqual([{ x: 3 }]);
    });

    it('ranks the runs by the chosen objective', () => {
        const tuned = strategy({
            entry: 'close > sma(close, {fast})',
            exit: 'close < sma(close, {fast})',
            params: [{ key: 'fast', value: 10, min: 5, max: 15, step: 5 }],
        });
        const result = optimize(wave(160), tuned, 'totalReturn');
        expect(result.tried).toBe(3);
        expect(result.truncated).toBe(false);
        expect(result.rows.length).toBeGreaterThan(0);
        const totals = result.rows.map((row) => row.metrics.totalReturn ?? -Infinity);
        for (let i = 1; i < totals.length; i += 1) expect(totals[i - 1]).toBeGreaterThanOrEqual(totals[i]);
        for (const row of result.rows) expect([5, 10, 15]).toContain(row.values.fast);
    });

    it('keeps only parameter sets that actually traded', () => {
        const idle = strategy({ entry: 'close > 1e9', exit: 'close < 1e9' });
        expect(optimize(wave(80), idle).rows).toHaveLength(0);
    });
});

describe('walk-forward', () => {
    it('never lets a fold train on its own test block', () => {
        const tuned = strategy({
            entry: 'close > sma(close, {fast})',
            exit: 'close < sma(close, {fast})',
            params: [{ key: 'fast', value: 5, min: 5, max: 15, step: 5 }],
        });
        const result = walkForward(wave(200), tuned, 3);
        expect(result).not.toBeNull();
        expect(result!.folds.length).toBeGreaterThan(0);
        for (const fold of result!.folds) {
            expect(fold.testFrom).toBe(fold.trainTo);
            expect(fold.testTo).toBeGreaterThan(fold.testFrom);
            expect(fold.testTo).toBeLessThanOrEqual(200);
            expect(fold.trainTo).toBeLessThanOrEqual(fold.testFrom);
        }
        expect(result!.folds[0].trainFrom).toBe(0);
        expect(result!.folds[0].trainTo).toBeGreaterThan(0);
    });

    it('refuses a series too short to hold the folds', () => {
        expect(walkForward(flat(10), strategy(), 4)).toBeNull();
    });
});

describe('serializeStrategy', () => {
    it('round-trips through the parser', () => {
        const original = strategy({ name: 'Round trip', entry: 'close > sma(close, {fast})', params: [{ key: 'fast', value: 20, min: 5, max: 40, step: 5 }] });
        const parsed = parseCustomStrategy(JSON.parse(serializeStrategy(original)))!;
        expect(parsed).toEqual(original);
    });
});

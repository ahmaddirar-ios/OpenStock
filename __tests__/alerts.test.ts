import { describe, expect, it } from 'vitest';
import {
    ALERT_CONDITIONS,
    alertSource,
    alertStoredSymbol,
    alertYahooSymbol,
    evaluateAlert,
    evaluateMeasure,
    isAlertCondition,
    isPercentCondition,
    measureRule,
    needsCandles,
    nextLastPrice,
    normalizeAlertParams,
    planCheck,
    validateAlertParams,
    validateAlertTarget,
    type AlertCondition,
} from '@/lib/alerts';

describe('alertSource', () => {
    it('routes every spelling of a Saudi listing to Yahoo', () => {
        expect(alertSource('2222')).toBe('yahoo');
        expect(alertSource('2222.SR')).toBe('yahoo');
        expect(alertSource(' tadawul:2222 ')).toBe('yahoo');
        expect(alertYahooSymbol('2222')).toBe('2222.SR');
        expect(alertYahooSymbol('tadawul:1120')).toBe('1120.SR');
        expect(alertStoredSymbol('2222')).toBe('2222.SR');
    });

    it('routes US stocks and crypto to Finnhub', () => {
        expect(alertSource('AAPL')).toBe('finnhub');
        expect(alertSource('brk.b')).toBe('finnhub');
        expect(alertSource('BINANCE:BTCUSDT')).toBe('finnhub');
    });

    it('refuses what the app cannot price', () => {
        expect(alertSource('')).toBeNull();
        expect(alertSource('   ')).toBeNull();
        expect(alertSource('VOD.L')).toBeNull();
        expect(alertSource('not a symbol!')).toBeNull();
        expect(alertSource('^TASI.SR')).toBeNull();
        expect(alertStoredSymbol('VOD.L')).toBeNull();
    });
});

describe('conditions', () => {
    it('recognises only the eleven it lists', () => {
        expect(isAlertCondition('ABOVE')).toBe(true);
        expect(isAlertCondition('RSI_BELOW')).toBe(true);
        expect(isAlertCondition('PRICE_CROSS_UP_SMA')).toBe(true);
        expect(isAlertCondition('VOLUME_SPIKE')).toBe(true);
        expect(isAlertCondition('SIDEWAYS')).toBe(false);
        expect(isAlertCondition(null)).toBe(false);
    });

    it('marks only the change rules as percentages', () => {
        expect(isPercentCondition('CHANGE_UP')).toBe(true);
        expect(isPercentCondition('CHANGE_DOWN')).toBe(true);
        expect(isPercentCondition('CROSS_UP')).toBe(false);
        expect(isPercentCondition('ABOVE')).toBe(false);
    });
});

describe('validateAlertTarget', () => {
    it('accepts positive prices and sane percentages', () => {
        expect(validateAlertTarget('ABOVE', 30)).toBe(true);
        expect(validateAlertTarget('CROSS_DOWN', 0.5)).toBe(true);
        expect(validateAlertTarget('CHANGE_UP', 5)).toBe(true);
        expect(validateAlertTarget('CHANGE_DOWN', 100)).toBe(true);
    });

    it('rejects zero, negatives, junk and impossible percentages', () => {
        expect(validateAlertTarget('ABOVE', 0)).toBe(false);
        expect(validateAlertTarget('BELOW', -3)).toBe(false);
        expect(validateAlertTarget('ABOVE', Number.NaN)).toBe(false);
        expect(validateAlertTarget('CHANGE_UP', 101)).toBe(false);
        expect(validateAlertTarget('CHANGE_DOWN', 0)).toBe(false);
    });
});

const rule = (condition: AlertCondition, targetPrice: number, lastPrice: number | null = null) => ({
    condition,
    targetPrice,
    lastPrice,
});

describe('evaluateAlert', () => {
    const snap = (price: number, changePercent = 0) => ({ price, changePercent });

    it('fires ABOVE and BELOW at the boundary', () => {
        expect(evaluateAlert(rule('ABOVE', 30), snap(30))).toBe(true);
        expect(evaluateAlert(rule('ABOVE', 30), snap(29.99))).toBe(false);
        expect(evaluateAlert(rule('BELOW', 30), snap(30))).toBe(true);
        expect(evaluateAlert(rule('BELOW', 30), snap(30.01))).toBe(false);
    });

    it('needs a previous price for a cross, and the right direction', () => {
        expect(evaluateAlert(rule('CROSS_UP', 30), snap(31))).toBe(false);
        expect(evaluateAlert(rule('CROSS_UP', 30, 29), snap(30))).toBe(true);
        expect(evaluateAlert(rule('CROSS_UP', 30, 31), snap(32))).toBe(false);
        expect(evaluateAlert(rule('CROSS_UP', 30, 29), snap(29.5))).toBe(false);
        expect(evaluateAlert(rule('CROSS_DOWN', 30, 31), snap(30))).toBe(true);
        expect(evaluateAlert(rule('CROSS_DOWN', 30, 29), snap(28))).toBe(false);
    });

    it('reads the sign of the day change for CHANGE_UP and CHANGE_DOWN', () => {
        expect(evaluateAlert(rule('CHANGE_UP', 5), snap(100, 5))).toBe(true);
        expect(evaluateAlert(rule('CHANGE_UP', 5), snap(100, 4.9))).toBe(false);
        expect(evaluateAlert(rule('CHANGE_UP', 5), snap(100, -6))).toBe(false);
        expect(evaluateAlert(rule('CHANGE_DOWN', 5), snap(100, -5))).toBe(true);
        expect(evaluateAlert(rule('CHANGE_DOWN', 5), snap(100, -4.9))).toBe(false);
        expect(evaluateAlert(rule('CHANGE_DOWN', 5), snap(100, 6))).toBe(false);
    });

    it('never fires on a missing or zero price', () => {
        expect(evaluateAlert(rule('BELOW', 30), snap(0))).toBe(false);
        expect(evaluateAlert(rule('BELOW', 30), snap(Number.NaN))).toBe(false);
    });

    it('does not fire a cross that only touches the level', () => {
        expect(evaluateAlert(rule('CROSS_UP', 30, 30), snap(30))).toBe(false);
        expect(evaluateAlert(rule('CROSS_DOWN', 30, 30), snap(30))).toBe(false);
    });

    it('moves the remembered price forward on every check', () => {
        expect(nextLastPrice(snap(31.5))).toBe(31.5);
        expect(evaluateAlert(rule('CROSS_UP', 30, nextLastPrice(snap(29))), snap(30))).toBe(true);
    });
});

describe('planCheck', () => {
    const row = (over: Partial<Parameters<typeof planCheck>[0][number]> = {}) => ({
        id: 'a1',
        symbol: '2222.SR',
        condition: 'ABOVE' as AlertCondition,
        targetPrice: 30,
        lastPrice: null,
        ...over,
    });

    it('skips a rule whose quote never came back and counts the rest as checked', () => {
        const plan = planCheck(
            [row(), row({ id: 'a2', symbol: 'AAPL' })],
            { '2222.SR': { price: 31, changePercent: 1 } },
        );
        expect(plan.checked).toBe(1);
        expect(plan.skipped).toBe(1);
        expect(plan.fires.map((fire) => fire.id)).toEqual(['a1']);
        expect(plan.misses).toEqual([]);
    });

    it('never reads a zero-price or missing quote as a price', () => {
        expect(planCheck([row()], { '2222.SR': { price: 0, changePercent: 4 } })).toMatchObject({ checked: 0, skipped: 1, fires: [] });
        expect(planCheck([row()], {})).toMatchObject({ checked: 0, skipped: 1, fires: [] });
    });

    it('remembers a miss and reports the price that fired a rule', () => {
        const plan = planCheck(
            [
                row({ id: 'miss', condition: 'CROSS_UP', targetPrice: 40 }),
                row({ id: 'hit', targetPrice: 30 }),
            ],
            { '2222.SR': { price: 31, changePercent: 2 } },
        );
        expect(plan.misses).toEqual([{ id: 'miss', value: 31 }]);
        expect(plan.fires).toEqual([
            { id: 'hit', symbol: '2222.SR', condition: 'ABOVE', targetPrice: 30, value: 31, price: 31, changePercent: 2 },
        ]);
    });
});

// --- indicator and volume rules -------------------------------------------------------------

const series = (closes: number[], volumes?: number[]) =>
    closes.map((close, i) => ({ time: i * 86_400, open: close, high: close, low: close, close, volume: volumes?.[i] ?? 1_000 }));

const rising = (n: number) => Array.from({ length: n }, (_, i) => 100 + i);
const falling = (n: number) => Array.from({ length: n }, (_, i) => 100 - i);

describe('needsCandles', () => {
    it('routes the price and percent rules to a quote and the rest to a series', () => {
        for (const condition of ['ABOVE', 'BELOW', 'CROSS_UP', 'CROSS_DOWN', 'CHANGE_UP', 'CHANGE_DOWN'] as AlertCondition[]) {
            expect(needsCandles(condition)).toBe(false);
        }
        for (const condition of ['RSI_BELOW', 'RSI_ABOVE', 'PRICE_CROSS_UP_SMA', 'PRICE_CROSS_DOWN_SMA', 'VOLUME_SPIKE'] as AlertCondition[]) {
            expect(needsCandles(condition)).toBe(true);
        }
    });

    it('lists all fourteen conditions', () => {
        expect(ALERT_CONDITIONS).toHaveLength(14);
    });
});

describe('the new rules’ numbers', () => {
    it('bounds an RSI level, an SMA period and a volume multiple', () => {
        expect(validateAlertTarget('RSI_BELOW', 30)).toBe(true);
        expect(validateAlertTarget('RSI_BELOW', 0)).toBe(false);
        expect(validateAlertTarget('RSI_ABOVE', 99)).toBe(true);
        expect(validateAlertTarget('RSI_ABOVE', 100)).toBe(false);
        expect(validateAlertTarget('PRICE_CROSS_UP_SMA', 50)).toBe(true);
        expect(validateAlertTarget('PRICE_CROSS_UP_SMA', 4)).toBe(false);
        expect(validateAlertTarget('PRICE_CROSS_DOWN_SMA', 401)).toBe(false);
        expect(validateAlertTarget('VOLUME_SPIKE', 2)).toBe(true);
        expect(validateAlertTarget('VOLUME_SPIKE', 0.5)).toBe(false);
        expect(validateAlertTarget('VOLUME_SPIKE', 21)).toBe(false);
    });

    it('bounds the second number and fills its default', () => {
        expect(validateAlertParams('RSI_BELOW', { period: 14 })).toBe(true);
        expect(validateAlertParams('RSI_BELOW', { period: 1 })).toBe(false);
        expect(validateAlertParams('RSI_BELOW', { period: 51 })).toBe(false);
        expect(validateAlertParams('VOLUME_SPIKE', { window: 20 })).toBe(true);
        expect(validateAlertParams('VOLUME_SPIKE', { window: 4 })).toBe(false);
        expect(validateAlertParams('VOLUME_SPIKE', { window: 101 })).toBe(false);

        expect(normalizeAlertParams('RSI_BELOW')).toEqual({ period: 14 });
        expect(normalizeAlertParams('RSI_BELOW', { period: 21 })).toEqual({ period: 21 });
        expect(normalizeAlertParams('VOLUME_SPIKE')).toEqual({ window: 20 });
        expect(normalizeAlertParams('VOLUME_SPIKE', { window: 50 })).toEqual({ window: 50 });
        expect(normalizeAlertParams('ABOVE')).toEqual({});
        expect(normalizeAlertParams('PRICE_CROSS_UP_SMA')).toEqual({});
    });
});

describe('measureRule', () => {
    const rule = (condition: AlertCondition, targetPrice = 30, params = {}) => ({ condition, targetPrice, params });

    it('reads RSI at the last bar, and the ceiling and floor of a one-way run', () => {
        const up = measureRule(rule('RSI_BELOW'), series(rising(30)));
        expect(up?.value).toBe(100);
        expect(up?.display).toBe(100);

        const down = measureRule(rule('RSI_BELOW'), series(falling(30)));
        expect(down?.value).toBe(0);

        const mixed = measureRule(rule('RSI_BELOW'), series([100, 101, 100, 102, 101, 103, 102, 104, 103, 105, 104, 106, 105, 107, 106, 108]));
        expect(mixed!.value).toBeGreaterThan(0);
        expect(mixed!.value).toBeLessThan(100);
    });

    it('returns no measure when the series is shorter than the rule needs', () => {
        expect(measureRule(rule('RSI_BELOW'), series(rising(14)))).toBeNull(); // period 14 needs 15 bars for one value
        expect(measureRule(rule('PRICE_CROSS_UP_SMA', 50), series(rising(49)))).toBeNull();
        expect(measureRule(rule('VOLUME_SPIKE', 2), series(rising(20)))).toBeNull(); // 20 bars, but the window is 20
        expect(measureRule(rule('RSI_BELOW'), [])).toBeNull();
        expect(measureRule(rule('RSI_BELOW'), undefined)).toBeNull();
    });

    it('has only one value, hence no previous, on the bar RSI first exists', () => {
        const measure = measureRule(rule('RSI_BELOW'), series(rising(15)));
        expect(measure?.value).toBe(100);
        expect(measure?.previous).toBeNull();
    });

    it('measures an SMA cross as the gap between the close and the average', () => {
        // period 5: the last close jumps above its own average while the bar before sat below it.
        const candles = series([10, 10, 10, 10, 10, 9, 9, 12]);
        const measure = measureRule(rule('PRICE_CROSS_UP_SMA', 5), candles);
        expect(measure?.value).toBeCloseTo(2, 6); // 12 − mean(10,10,9,9,12) = 2
        expect(measure?.previous).toBeCloseTo(-0.6, 6); // 9 − mean(10,10,10,9,9)
        expect(measure?.display).toBe(12); // the price a trader reads, not the gap
        expect(evaluateMeasure(rule('PRICE_CROSS_UP_SMA', 5), measure!)).toBe(true);
        expect(evaluateMeasure(rule('PRICE_CROSS_DOWN_SMA', 5), measure!)).toBe(false);
    });

    it('averages the volume of the bars before the current one, never the current bar itself', () => {
        const volumes = [...Array(20).fill(100), 300]; // 21 bars, window 20
        const measure = measureRule(rule('VOLUME_SPIKE', 2, { window: 20 }), series([...Array(21).fill(50)], volumes));
        expect(measure?.value).toBeCloseTo(3, 6); // 300 ÷ 100, so the spike is not diluted by itself
        expect(measure?.display).toBeCloseTo(3, 6);
        expect(evaluateMeasure(rule('VOLUME_SPIKE', 2), measure!)).toBe(true);
    });

    it('never divides by a zero-volume average', () => {
        const volumes = [...Array(20).fill(0), 500];
        expect(measureRule(rule('VOLUME_SPIKE', 2, { window: 20 }), series([...Array(21).fill(50)], volumes))).toBeNull();
    });
});

describe('evaluateMeasure', () => {
    const rule = (condition: AlertCondition, targetPrice: number, params = {}) => ({ condition, targetPrice, params });

    it('fires a level rule at the level, and not a hair past it', () => {
        expect(evaluateMeasure(rule('RSI_BELOW', 30), { value: 30, previous: 40, display: 30 })).toBe(true);
        expect(evaluateMeasure(rule('RSI_BELOW', 30), { value: 30.1, previous: 40, display: 30.1 })).toBe(false);
        expect(evaluateMeasure(rule('RSI_ABOVE', 70), { value: 70, previous: 60, display: 70 })).toBe(true);
        expect(evaluateMeasure(rule('RSI_ABOVE', 70), { value: 69.9, previous: 60, display: 69.9 })).toBe(false);
        expect(evaluateMeasure(rule('VOLUME_SPIKE', 2), { value: 2, previous: 1, display: 2 })).toBe(true);
        expect(evaluateMeasure(rule('VOLUME_SPIKE', 2), { value: 1.99, previous: 1, display: 1.99 })).toBe(false);
    });

    it('needs a previous value for a cross, and only the transition counts', () => {
        expect(evaluateMeasure(rule('PRICE_CROSS_UP_SMA', 50), { value: 1, previous: null, display: 12 })).toBe(false);
        expect(evaluateMeasure(rule('PRICE_CROSS_UP_SMA', 50), { value: 2, previous: -0.6, display: 12 })).toBe(true);
        expect(evaluateMeasure(rule('PRICE_CROSS_UP_SMA', 50), { value: 3, previous: 1, display: 12 })).toBe(false); // already above
        expect(evaluateMeasure(rule('PRICE_CROSS_UP_SMA', 50), { value: 0, previous: 0, display: 12 })).toBe(false); // only touched
        expect(evaluateMeasure(rule('PRICE_CROSS_DOWN_SMA', 50), { value: -1, previous: 0.6, display: 12 })).toBe(true);
        expect(evaluateMeasure(rule('PRICE_CROSS_DOWN_SMA', 50), { value: -1, previous: -0.5, display: 12 })).toBe(false);
    });
});

describe('planCheck with candles', () => {
    const row = (over: Partial<Parameters<typeof planCheck>[0][number]> = {}) => ({
        id: 'a1',
        symbol: '2222.SR',
        condition: 'RSI_BELOW' as AlertCondition,
        targetPrice: 70,
        params: {},
        lastPrice: null,
        ...over,
    });

    it('reads a series rule from the candles, with no quote at all', () => {
        const plan = planCheck([row()], {}, { '2222.SR': series(falling(30)) });
        expect(plan.checked).toBe(1);
        expect(plan.fires).toEqual([
            { id: 'a1', symbol: '2222.SR', condition: 'RSI_BELOW', targetPrice: 70, value: 0, price: undefined, changePercent: undefined },
        ]);
    });

    it('skips a series rule whose candles are missing or too short, and never reads zero', () => {
        const missing = planCheck([row()], {}, {});
        expect(missing).toMatchObject({ checked: 0, skipped: 1, fires: [] });
        const short = planCheck([row()], {}, { '2222.SR': series(falling(10)) });
        expect(short).toMatchObject({ checked: 0, skipped: 1, fires: [] });
    });

    it('remembers the measured value, not a price, on a miss', () => {
        const plan = planCheck([row({ targetPrice: 0.5 })], {}, { '2222.SR': series(rising(20)) });
        // RSI on a strictly rising series is 100, which is not below 0.5, so it is a miss.
        expect(plan.misses).toEqual([{ id: 'a1', value: 100 }]);
    });

    it('mixes price rules and series rules in one check, each from its own source', () => {
        const plan = planCheck(
            [
                row({ id: 'series', symbol: '2222.SR' }),
                row({ id: 'quote', symbol: 'AAPL', condition: 'ABOVE', targetPrice: 100, params: {} }),
            ],
            { AAPL: { price: 101, changePercent: 1 } },
            { '2222.SR': series(falling(30)) },
        );
        expect(plan.checked).toBe(2);
        expect(plan.skipped).toBe(0);
        expect(plan.fires.map((fire) => fire.id).sort()).toEqual(['quote', 'series']);
    });
});

// --- volatility and breakout rules ---------------------------------------------------------

describe('the ATR and 52-week rules', () => {
    const ruleOf = (condition: AlertCondition, targetPrice = 3, params = {}) => ({ condition, targetPrice, params });
    // Every bar spans `range` points around its close, so ATR has something to average.
    const ranged = (closes: number[], range = 2) =>
        closes.map((close, i) => ({ time: i * 86_400, open: close, high: close + range / 2, low: close - range / 2, close, volume: 1_000 }));

    it('are series rules, not quote rules', () => {
        for (const condition of ['ATR_ABOVE', 'CROSS_52W_HIGH', 'CROSS_52W_LOW'] as AlertCondition[]) {
            expect(needsCandles(condition)).toBe(true);
        }
    });

    it('bounds the ATR percentage, its period, and the breakout lookback', () => {
        expect(validateAlertTarget('ATR_ABOVE', 3)).toBe(true);
        expect(validateAlertTarget('ATR_ABOVE', 0.05)).toBe(false);
        expect(validateAlertTarget('ATR_ABOVE', 51)).toBe(false);
        expect(validateAlertTarget('CROSS_52W_HIGH', 252)).toBe(true);
        expect(validateAlertTarget('CROSS_52W_HIGH', 19)).toBe(false);
        expect(validateAlertTarget('CROSS_52W_LOW', 401)).toBe(false);

        expect(validateAlertParams('ATR_ABOVE', { period: 14 })).toBe(true);
        expect(validateAlertParams('ATR_ABOVE', { period: 1 })).toBe(false);
        expect(validateAlertParams('CROSS_52W_HIGH', {})).toBe(true);
        expect(validateAlertParams('CROSS_52W_HIGH', { period: 20 })).toBe(false);

        expect(normalizeAlertParams('ATR_ABOVE')).toEqual({ period: 14 });
        expect(normalizeAlertParams('ATR_ABOVE', { period: 21 })).toEqual({ period: 21 });
        expect(normalizeAlertParams('CROSS_52W_HIGH')).toEqual({});
    });

    it('reads ATR as a percentage of the close', () => {
        // fifteen flat 100 closes, each spanning 2 points: ATR 2 on a 100 close is 2%
        const measure = measureRule(ruleOf('ATR_ABOVE', 1.5, { period: 14 }), ranged(Array(15).fill(100)));
        expect(measure?.value).toBeCloseTo(2, 6);
        expect(measure?.display).toBeCloseTo(2, 6);
        expect(measure?.previous).toBeNull();
        expect(evaluateMeasure(ruleOf('ATR_ABOVE', 1.5), measure!)).toBe(true);
        expect(evaluateMeasure(ruleOf('ATR_ABOVE', 2.5), measure!)).toBe(false);
    });

    it('returns no measure when the series is shorter than the ATR period', () => {
        expect(measureRule(ruleOf('ATR_ABOVE', 3, { period: 14 }), ranged(Array(13).fill(100)))).toBeNull();
        expect(measureRule(ruleOf('ATR_ABOVE', 3, { period: 14 }), [])).toBeNull();
    });

    it('never divides by a zero close', () => {
        expect(measureRule(ruleOf('ATR_ABOVE', 3, { period: 14 }), ranged(Array(15).fill(0)))).toBeNull();
    });

    it('measures a 52-week break as the distance to the highest close before today', () => {
        const closes = [...Array(20).fill(100), 99, 101];
        const measure = measureRule(ruleOf('CROSS_52W_HIGH', 20), series(closes));
        expect(measure?.value).toBeCloseTo(1, 6);      // 101 versus the 100 high of the 20 bars before it
        expect(measure?.previous).toBeCloseTo(-1, 6);  // 99 versus the same 100 high
        expect(measure?.display).toBe(101);
        expect(evaluateMeasure(ruleOf('CROSS_52W_HIGH', 20), measure!)).toBe(true);
        expect(evaluateMeasure(ruleOf('CROSS_52W_LOW', 20), measure!)).toBe(false);
    });

    it('measures a 52-week low break as the distance below the lowest close before today', () => {
        const closes = [...Array(20).fill(100), 101, 99];
        const measure = measureRule(ruleOf('CROSS_52W_LOW', 20), series(closes));
        expect(measure?.value).toBeCloseTo(-1, 6);     // 99 versus the 100 low of the window
        expect(measure?.previous).toBeCloseTo(1, 6);   // 101 versus the same 100 low
        expect(evaluateMeasure(ruleOf('CROSS_52W_LOW', 20), measure!)).toBe(true);
        expect(evaluateMeasure(ruleOf('CROSS_52W_HIGH', 20), measure!)).toBe(false);
    });

    it('needs the lookback plus a previous bar before it can report a break', () => {
        expect(measureRule(ruleOf('CROSS_52W_HIGH', 20), series(Array(21).fill(100)))).toBeNull();
        expect(measureRule(ruleOf('CROSS_52W_HIGH', 20), series(Array(20).fill(100)))).toBeNull();
    });

    it('does not fire a break that only touches the old high', () => {
        const closes = [...Array(20).fill(100), 99, 100];
        const measure = measureRule(ruleOf('CROSS_52W_HIGH', 20), series(closes));
        expect(measure?.value).toBeCloseTo(0, 6);
        expect(evaluateMeasure(ruleOf('CROSS_52W_HIGH', 20), measure!)).toBe(false);
    });
});

import { describe, expect, it } from 'vitest';
import {
    ALERT_CONDITIONS,
    alertSource,
    alertStoredSymbol,
    alertYahooSymbol,
    evaluateAlert,
    isAlertCondition,
    isPercentCondition,
    nextLastPrice,
    planCheck,
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
    it('lists all six and recognises only them', () => {
        expect(ALERT_CONDITIONS).toHaveLength(6);
        expect(isAlertCondition('ABOVE')).toBe(true);
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
        expect(plan.misses).toEqual([{ id: 'miss', lastPrice: 31 }]);
        expect(plan.fires).toEqual([
            { id: 'hit', symbol: '2222.SR', condition: 'ABOVE', targetPrice: 30, price: 31, changePercent: 2 },
        ]);
    });
});

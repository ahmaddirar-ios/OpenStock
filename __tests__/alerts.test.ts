import { describe, expect, it } from 'vitest';
import {
    ALERT_CONDITIONS,
    alertSource,
    alertStoredSymbol,
    alertYahooSymbol,
    distanceToTarget,
    evaluateAlert,
    isAlertCondition,
    isPercentCondition,
    nextLastPrice,
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

    it('moves the remembered price forward on every check', () => {
        expect(nextLastPrice(snap(31.5))).toBe(31.5);
        expect(evaluateAlert(rule('CROSS_UP', 30, nextLastPrice(snap(29))), snap(30))).toBe(true);
    });

    it('measures the distance to the target in the right unit', () => {
        expect(distanceToTarget(rule('ABOVE', 30), snap(28))).toBe(-2);
        expect(distanceToTarget(rule('CHANGE_UP', 5), snap(100, 2))).toBe(-3);
        expect(distanceToTarget(rule('CHANGE_UP', 5), snap(100, -2))).toBeNull();
        expect(distanceToTarget(rule('CHANGE_DOWN', 5), snap(100, -2))).toBe(-3);
    });
});

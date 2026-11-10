import { describe, expect, it } from 'vitest';
import { apiKeyFromHeaders, generateApiKey, hashApiKey, isApiKeyShaped } from '@/lib/api/keys';
import { apiQuotaForPlan } from '@/lib/api/limits';
import {
    parseInteger,
    parseInterval,
    parseNumber,
    parseSymbol,
    parseSymbols,
} from '@/lib/api/request';
import { serializeCandles } from '@/lib/api/serialize';
import { computeIndicator, minimumBars, type IndicatorSpec } from '@/lib/api/indicators';
import { FEATURE_GROUPS, FEATURES, PLAN_FEATURES } from '@/lib/plans';
import type { Candle } from '@/lib/market/yahoo-candles';

const spec = (overrides: Partial<IndicatorSpec> = {}): IndicatorSpec => ({
    indicator: 'sma',
    period: 5,
    fast: 12,
    slow: 26,
    signal: 9,
    stdDev: 2,
    ...overrides,
});

const candles = (count: number): Candle[] =>
    Array.from({ length: count }, (_, index) => ({
        time: 1_700_000_000 + index * 86_400,
        open: index + 0.5,
        high: index + 1.5,
        low: index + 0.25,
        close: index + 1,
        volume: 1_000 + index,
    }));

describe('API keys', () => {
    it('mints an rvx_ key and stores only a hash', () => {
        const generated = generateApiKey();
        expect(generated.key.startsWith('rvx_')).toBe(true);
        expect(isApiKeyShaped(generated.key)).toBe(true);
        expect(generated.prefix).toBe(generated.key.slice(0, 12));
        expect(generated.last4).toBe(generated.key.slice(-4));
        expect(generated.hash).toBe(hashApiKey(generated.key));
        expect(generated.hash).not.toContain(generated.key);
        expect(generated.hash).toHaveLength(64);
    });

    it('hashes deterministically and distinguishes different keys', () => {
        expect(hashApiKey('rvx_a')).toBe(hashApiKey('rvx_a'));
        expect(hashApiKey('rvx_a')).not.toBe(hashApiKey('rvx_b'));
    });

    it('reads x-api-key first, then a Bearer token', () => {
        expect(apiKeyFromHeaders(new Headers({ 'x-api-key': 'rvx_direct' }))).toBe('rvx_direct');
        expect(apiKeyFromHeaders(new Headers({ authorization: 'Bearer rvx_bearer' }))).toBe('rvx_bearer');
        expect(apiKeyFromHeaders(new Headers({ authorization: 'bearer rvx_lower' }))).toBe('rvx_lower');
        expect(apiKeyFromHeaders(new Headers())).toBeNull();
        expect(apiKeyFromHeaders(new Headers({ authorization: 'Basic abc' }))).toBeNull();
    });
});

describe('API parameter parsing', () => {
    it('accepts real symbols and refuses junk', () => {
        expect(parseSymbol(' aapl ')).toBe('AAPL');
        expect(parseSymbol('2222.SR')).toBe('2222.SR');
        expect(parseSymbol('BINANCE:BTCUSDT')).toBe('BINANCE:BTCUSDT');
        expect(parseSymbol('^GSPC')).toBe('^GSPC');
        expect(parseSymbol('not a symbol')).toBeNull();
        expect(parseSymbol('')).toBeNull();
        expect(parseSymbol(null)).toBeNull();
    });

    it('deduplicates a symbol list and caps it', () => {
        expect(parseSymbols('aapl, AAPL, msft', 25)).toEqual(['AAPL', 'MSFT']);
        expect(parseSymbols('aapl,msft,nvda', 2)).toEqual(['AAPL', 'MSFT']);
        expect(parseSymbols('bad symbol,,msft', 25)).toEqual(['MSFT']);
    });

    it('falls back to the default interval', () => {
        expect(parseInterval('1d')).toBe('1d');
        expect(parseInterval('4h')).toBe('4h');
        expect(parseInterval('7m')).toBe('1d');
        expect(parseInterval(null)).toBe('1d');
    });

    it('clamps integers and numbers into range', () => {
        expect(parseInteger('14', 9, 2, 100)).toBe(14);
        expect(parseInteger('1', 9, 2, 100)).toBe(2);
        expect(parseInteger('999', 9, 2, 100)).toBe(100);
        expect(parseInteger('2.5', 9, 2, 100)).toBe(9);
        expect(parseInteger(null, 9, 2, 100)).toBe(9);
        expect(parseNumber('2.5', 2, 0.1, 10)).toBe(2.5);
        expect(parseNumber('50', 2, 0.1, 10)).toBe(10);
    });
});

describe('API quotas', () => {
    it('prices each plan and falls back to free', () => {
        expect(apiQuotaForPlan('free')).toBe(60);
        expect(apiQuotaForPlan('pro')).toBe(600);
        expect(apiQuotaForPlan('premium')).toBe(3000);
        expect(apiQuotaForPlan('enterprise')).toBe(60);
        expect(apiQuotaForPlan(undefined)).toBe(60);
    });
});

describe('API serialization', () => {
    it('shapes bars compactly and keeps the newest when a limit is given', () => {
        const set = {
            candles: candles(5),
            currency: 'SAR',
            previousClose: 28.4,
        };
        const all = serializeCandles(set);
        expect(all.currency).toBe('SAR');
        expect(all.previousClose).toBe(28.4);
        expect(all.candles).toHaveLength(5);
        expect(Object.keys(all.candles[0]).sort()).toEqual(['c', 'h', 'l', 'o', 't', 'v']);

        const tail = serializeCandles(set, 2);
        expect(tail.candles).toHaveLength(2);
        expect(tail.candles[1].c).toBe(5);
    });

    it('omits an unknown previous close', () => {
        expect(serializeCandles({ candles: candles(1), currency: 'USD' })).not.toHaveProperty('previousClose');
    });
});

describe('API indicators', () => {
    it('computes a moving average aligned with the candles', () => {
        const result = computeIndicator(candles(10), spec({ indicator: 'sma', period: 5 }));
        expect(result.points).toHaveLength(6);
        expect(result.points[0].t).toBe(1_700_000_000 + 4 * 86_400);
        expect(result.points[0].value).toBeCloseTo(3);
        expect(result.points.at(-1)?.value).toBeCloseTo(8);
    });

    it('emits the three MACD series', () => {
        const result = computeIndicator(candles(60), spec({ indicator: 'macd' }));
        expect(result.points.length).toBeGreaterThan(0);
        const point = result.points.at(-1)!;
        expect(point).toHaveProperty('macd');
        expect(point).toHaveProperty('signal');
        expect(point).toHaveProperty('histogram');
    });

    it('emits bands for bollinger and directional lines for adx', () => {
        const bands = computeIndicator(candles(40), spec({ indicator: 'bollinger', period: 10 }));
        expect(bands.points.at(-1)).toHaveProperty('upper');
        expect(bands.points.at(-1)).toHaveProperty('middle');
        expect(bands.points.at(-1)).toHaveProperty('lower');

        const directional = computeIndicator(candles(40), spec({ indicator: 'adx', period: 10 }));
        expect(directional.points.at(-1)).toHaveProperty('adx');
        expect(directional.points.at(-1)).toHaveProperty('plusDi');
        expect(directional.points.at(-1)).toHaveProperty('minusDi');
    });

    it('reports the warm-up each study needs', () => {
        expect(minimumBars(spec({ indicator: 'macd' }))).toBe(35);
        expect(minimumBars(spec({ indicator: 'sma', period: 20 }))).toBe(21);
        expect(minimumBars(spec({ indicator: 'obv' }))).toBe(2);
    });
});

describe('api.rest entitlement', () => {
    it('is sold on Pro and Premium, not on Free', () => {
        expect(FEATURES).toContain('api.rest');
        expect(PLAN_FEATURES.pro).toContain('api.rest');
        expect(PLAN_FEATURES.premium).toContain('api.rest');
        expect(PLAN_FEATURES.free).not.toContain('api.rest');
    });

    it('has its own admin group', () => {
        const group = FEATURE_GROUPS.find((entry) => entry.id === 'api');
        expect(group?.features).toEqual(['api.rest']);
    });
});

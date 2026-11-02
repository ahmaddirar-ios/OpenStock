import { describe, expect, it } from 'vitest';
import {
    MAX_STUDIES,
    STUDIES,
    STUDY_IDS,
    defaultStudy,
    describeStudy,
    parseStudies,
    studiesParam,
    type StudyId,
} from '@/lib/chart-studies';
import { tx } from '@/lib/i18n';
import type { Candle } from '@/lib/yahoo-candles';

/** Studies that answer from the first bars instead of waiting for a window to fill. */
const IMMEDIATE = new Set<StudyId>(['vwap', 'obv', 'sar', 'pivots']);

const candles: Candle[] = Array.from({ length: 80 }, (_, i) => ({
    time: 1_600_000_000 + i * 86_400,
    open: 10 + i,
    high: 12 + i,
    low: 9 + i,
    close: 11 + i,
    volume: 1_000 + i * 10,
}));

describe('the registry', () => {
    it('is consistent: one definition per id, at least one line, defaults inside their range', () => {
        expect(new Set(STUDY_IDS).size).toBe(STUDY_IDS.length);
        for (const id of STUDY_IDS) {
            const def = STUDIES[id];
            expect(def.id).toBe(id);
            expect(def.lines.length).toBeGreaterThan(0);
            for (const param of def.params) {
                expect(param.default).toBeGreaterThanOrEqual(param.min);
                expect(param.default).toBeLessThanOrEqual(param.max);
                expect(param.step).toBeGreaterThan(0);
            }
        }
    });

    it('draws exactly the lines it declares, one value per candle', () => {
        for (const id of STUDY_IDS) {
            const def = STUDIES[id];
            const result = def.compute(candles, defaultStudy(id).params);
            expect(Object.keys(result).sort()).toEqual(def.lines.map((line) => line.key).sort());
            for (const [key, series] of Object.entries(result)) {
                expect(series, `${id}.${key}`).toHaveLength(candles.length);
                for (const value of series) expect(value === null || Number.isFinite(value)).toBe(true);
            }
        }
    });

    it('never lets a period longer than the history produce junk', () => {
        const short = candles.slice(0, 3);
        for (const id of STUDY_IDS) {
            const def = STUDIES[id];
            const result = def.compute(short, defaultStudy(id).params);
            for (const series of Object.values(result)) {
                expect(series).toHaveLength(3);
                for (const value of series) expect(value === null || Number.isFinite(value)).toBe(true);
                // A window longer than the history reads nothing. These four have no window: VWAP
                // anchors at the start, OBV accumulates, SAR accelerates from bar 1, and the pivots
                // come from the previous bar.
                if (!IMMEDIATE.has(id)) expect(series.every((value) => value === null)).toBe(true);
            }
        }
    });
});

describe('describeStudy', () => {
    it('names a study with its parameters, in declared order', () => {
        expect(describeStudy(defaultStudy('sma'), 'en')).toBe('SMA 20');
        expect(describeStudy(defaultStudy('bb'), 'en')).toBe('Bollinger Bands 20 · 2');
        expect(describeStudy(defaultStudy('macd'), 'en')).toBe('MACD 12 · 26 · 9');
        expect(describeStudy(defaultStudy('vwap'), 'en')).toBe('VWAP');
        expect(describeStudy(defaultStudy('stoch'), 'en')).toBe('Stochastic 14 · 3 · 3');
        expect(describeStudy(defaultStudy('adx'), 'en')).toBe('ADX / DMI 14');
        expect(describeStudy(defaultStudy('wr'), 'en')).toBe('Williams %R 14');
        expect(describeStudy(defaultStudy('cci'), 'en')).toBe('CCI 20');
        expect(describeStudy(defaultStudy('obv'), 'en')).toBe('OBV');
        expect(describeStudy(defaultStudy('ichimoku'), 'en')).toBe('Ichimoku 9 · 26 · 52 · 26');
        expect(describeStudy(defaultStudy('supertrend'), 'en')).toBe('Supertrend 10 · 3');
        expect(describeStudy(defaultStudy('donchian'), 'en')).toBe('Donchian Channel 20');
        expect(describeStudy(defaultStudy('keltner'), 'en')).toBe('Keltner Channel 20 · 2');
        expect(describeStudy(defaultStudy('sar'), 'en')).toBe('Parabolic SAR 0.02 · 0.2');
        expect(describeStudy(defaultStudy('pivots'), 'en')).toBe('Pivot Points');
        expect(describeStudy(defaultStudy('wma'), 'en')).toBe('WMA 20');
        expect(describeStudy(defaultStudy('hma'), 'en')).toBe('HMA 9');
        expect(describeStudy(defaultStudy('vwma'), 'en')).toBe('VWMA 20');
    });

    it('follows the parameters the trader actually set', () => {
        expect(describeStudy({ id: 'sma', params: { period: 200 } }, 'en')).toBe('SMA 200');
    });

    it('localises its digits without localising the name', () => {
        const text = describeStudy(defaultStudy('sma'), 'ar');
        expect(text).toContain('SMA');
        expect(text).toContain('٢٠');
    });
});

describe('the dictionary', () => {
    it('names every study, parameter and line in both languages', () => {
        for (const id of STUDY_IDS) {
            const def = STUDIES[id];
            for (const lang of ['en', 'ar'] as const) {
                expect(tx(lang, def.label), `${lang} ${id}`).not.toBe('');
                for (const param of def.params) expect(tx(lang, param.label)).not.toBe('');
                for (const line of def.lines) expect(tx(lang, line.name)).not.toBe('');
                expect(describeStudy(defaultStudy(id), lang)).toContain(tx(lang, def.label));
            }
        }
    });
});

describe('defaultStudy', () => {
    it('hands back an independent copy of the defaults', () => {
        const first = defaultStudy('sma');
        first.params.period = 7;
        expect(defaultStudy('sma').params.period).toBe(20);
    });
});

describe('studiesParam', () => {
    it('reads a parameter and falls back to the default for a missing key', () => {
        expect(studiesParam({ id: 'sma', params: { period: 50 } }, 'period')).toBe(50);
        expect(studiesParam({ id: 'sma', params: {} }, 'period')).toBe(20);
        expect(studiesParam({ id: 'sma', params: {} }, 'nonsense')).toBe(0);
    });
});

describe('parseStudies', () => {
    const stored = (studies: unknown) => ({ v: 1, studies });

    it('answers an empty list for anything that is not a v1 payload', () => {
        expect(parseStudies(null)).toEqual([]);
        expect(parseStudies('x')).toEqual([]);
        expect(parseStudies([])).toEqual([]);
        expect(parseStudies({})).toEqual([]);
        expect(parseStudies({ v: 2, studies: [{ id: 'sma', params: {} }] })).toEqual([]);
        expect(parseStudies({ v: 1, studies: 'nope' })).toEqual([]);
    });

    it('drops a study it does not know and keeps the rest', () => {
        const list = parseStudies(stored([{ id: 'sma', params: { period: 20 } }, { id: 'magic', params: {} }]));
        expect(list.map((study) => study.id)).toEqual(['sma']);
    });

    it('clamps out-of-range and non-finite parameters, and fills the missing ones', () => {
        const [high] = parseStudies(stored([{ id: 'sma', params: { period: 9_999 } }]));
        expect(high.params.period).toBe(500);
        const [nan] = parseStudies(stored([{ id: 'bb', params: { period: 'x', stdDev: 4.5 } }]));
        expect(nan.params.period).toBe(20);
        expect(nan.params.stdDev).toBe(4.5);
        const [empty] = parseStudies(stored([{ id: 'macd', params: {} }]));
        expect(empty.params).toEqual({ fast: 12, slow: 26, signal: 9 });
    });

    it('keeps order and duplicates — two SMAs are two studies', () => {
        const list = parseStudies(
            stored([
                { id: 'sma', params: { period: 200 } },
                { id: 'rsi', params: {} },
                { id: 'sma', params: { period: 20 } },
            ]),
        );
        expect(list.map((study) => study.id)).toEqual(['sma', 'rsi', 'sma']);
        expect(list.map((study) => study.params.period)).toEqual([200, 14, 20]);
    });

    it('caps the list at the pane budget', () => {
        const many = Array.from({ length: MAX_STUDIES + 5 }, () => ({ id: 'sma', params: {} }));
        expect(parseStudies(stored(many))).toHaveLength(MAX_STUDIES);
    });
});

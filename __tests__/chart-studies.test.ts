import { describe, expect, it } from 'vitest';
import type { StringKey } from '@/lib/i18n';
import {
    MAX_STUDIES,
    STUDIES,
    STUDY_IDS,
    defaultStudy,
    describeStudy,
    studiesChoice,
    studyColor,
    studyLineStyle,
    studyLines,
    bandSegments,
    studyWantsPane,
    studyWidth,
    STUDY_COLOR_TOKENS,
    STUDY_LINE_DASHES,
    STUDY_WIDTHS,
    parseStudies,
    studiesParam,
    type StudyId,
} from '@/lib/chart-studies';
import { tx } from '@/lib/i18n';
import type { Candle } from '@/lib/yahoo-candles';

/** Studies that answer from the first bars instead of waiting for a window to fill. */
const IMMEDIATE = new Set<StudyId>(['vwap', 'obv', 'sar', 'pivots', 'avwap']);

const studiesWith = (id: StudyId, params: Record<string, number | string>) => ({
    id,
    params: { ...defaultStudy(id).params, ...params },
});

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
            // A profile is drawn as bars against the pane edge, so it is the one kind with no lines.
            if (def.profile) expect(def.lines).toEqual([]);
            else expect(def.lines.length).toBeGreaterThan(0);
            // A fill has to name two lines that exist, or the host paints nothing and says nothing.
            if (def.fill) {
                const keys = def.lines.map((line) => line.key);
                expect(keys).toContain(def.fill.upper);
                expect(keys).toContain(def.fill.lower);
            }
            for (const param of def.params) {
                if (param.kind === 'choice') {
                    expect(param.choices.length).toBeGreaterThan(1);
                    expect(param.choices.map((choice) => choice.value)).toContain(param.default);
                    continue;
                }
                // Only a number carries bounds; a formula's bounds are the language's grammar.
                // A date's default may be empty: "no anchor" is a real choice, not a missing default.
                if (param.kind === 'text') {
                    if (param.input !== 'date') expect(param.default.trim().length).toBeGreaterThan(0);
                    continue;
                }
                expect(param.default).toBeGreaterThanOrEqual(param.min);
                expect(param.default).toBeLessThanOrEqual(param.max);
                expect(param.step).toBeGreaterThan(0);
            }
        }
    });

    it('draws exactly the lines it declares, one value per candle', () => {
        for (const id of STUDY_IDS) {
            const def = STUDIES[id];
            if (def.profile) continue;
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
            if (def.profile) continue;
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
        expect(describeStudy(defaultStudy('sma'), 'en')).toBe('SMA 20 · Close');
        expect(describeStudy(defaultStudy('bb'), 'en')).toBe('Bollinger Bands 20 · 2 · Close');
        expect(describeStudy(defaultStudy('macd'), 'en')).toBe('MACD 12 · 26 · 9 · Close');
        expect(describeStudy(defaultStudy('vwap'), 'en')).toBe('VWAP');
        expect(describeStudy(defaultStudy('stoch'), 'en')).toBe('Stochastic 14 · 3 · 3');
        expect(describeStudy(defaultStudy('adx'), 'en')).toBe('ADX / DMI 14');
        expect(describeStudy(defaultStudy('wr'), 'en')).toBe('Williams %R 14');
        expect(describeStudy(defaultStudy('cci'), 'en')).toBe('CCI 20');
        expect(describeStudy(defaultStudy('obv'), 'en')).toBe('OBV');
        expect(describeStudy(defaultStudy('ichimoku'), 'en')).toBe('Ichimoku 9 · 26 · 52 · 26');
        expect(describeStudy(defaultStudy('supertrend'), 'en')).toBe('Supertrend 10 · 3');
        expect(describeStudy(defaultStudy('donchian'), 'en')).toBe('Donchian Channel 20');
        expect(describeStudy(defaultStudy('keltner'), 'en')).toBe('Keltner Channel 20 · 2 · Close');
        expect(describeStudy(defaultStudy('sar'), 'en')).toBe('Parabolic SAR 0.02 · 0.2');
        expect(describeStudy(defaultStudy('pivots'), 'en')).toBe('Pivot Points Previous bar');
        expect(describeStudy(defaultStudy('stochrsi'), 'en')).toBe('Stochastic RSI 14 · 14 · 3 · 3 · Close');
        expect(describeStudy(defaultStudy('ao'), 'en')).toBe('Awesome Oscillator 5 · 34');
        expect(describeStudy(defaultStudy('cmf'), 'en')).toBe('Chaikin Money Flow 20');
        expect(describeStudy(defaultStudy('wma'), 'en')).toBe('WMA 20 · Close');
        expect(describeStudy(defaultStudy('hma'), 'en')).toBe('HMA 9 · Close');
        expect(describeStudy(defaultStudy('vwma'), 'en')).toBe('VWMA 20 · Close');
        expect(describeStudy(defaultStudy('momentum'), 'en')).toBe('Momentum 10 · Close');
        expect(describeStudy(defaultStudy('roc'), 'en')).toBe('Rate of Change 9 · Close');
        expect(describeStudy(defaultStudy('aroon'), 'en')).toBe('Aroon 14');
        expect(describeStudy(defaultStudy('trix'), 'en')).toBe('TRIX 15 · Close');
        expect(describeStudy(defaultStudy('mfi'), 'en')).toBe('Money Flow Index 14');
        // An empty anchor is left out of the name rather than printed as a gap.
        expect(describeStudy(defaultStudy('avwap'), 'en')).toBe('Anchored VWAP 2');
        expect(describeStudy(studiesWith('avwap', { anchor: '2026-01-02' }), 'en')).toBe('Anchored VWAP 2026-01-02 · 2');
        expect(describeStudy(defaultStudy('vprofile'), 'en')).toBe('Volume Profile 24 · 70 · Right');
        expect(describeStudy({ ...defaultStudy('vprofile'), params: { rows: 40, side: 'left' } }, 'en')).toBe(
            'Volume Profile 40 · 70 · Left',
        );
    });

    it('names a choice by its label, not by a number', () => {
        const sma = { ...defaultStudy('sma'), params: { period: 50, source: 'high' } };
        expect(describeStudy(sma, 'en')).toBe('SMA 50 · High');
        expect(describeStudy(sma, 'ar')).toContain('الأعلى');
    });

    it('follows the parameters the trader actually set', () => {
        expect(describeStudy({ id: 'sma', params: { period: 200 } }, 'en')).toBe('SMA 200 · Close');
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
                for (const param of def.params) {
                    expect(tx(lang, param.label)).not.toBe('');
                    if (param.kind === 'choice') {
                        for (const choice of param.choices) expect(tx(lang, choice.label)).not.toBe('');
                    }
                }
                for (const line of def.lines) expect(tx(lang, line.name)).not.toBe('');
                for (const line of studyLines({ id, params: defaultStudy(id).params })) {
                    expect(tx(lang, line.name)).not.toBe('');
                }
                if (def.profile) {
                    // The rows, the value area and the side are the profile's only controls.
                    expect(def.params.map((param) => param.key)).toContain(def.profile.rowsParam);
                }
                for (const param of def.params) {
                    if (param.kind === 'text' && param.hint) expect(tx(lang, param.hint)).not.toBe('');
                }
                expect(describeStudy(defaultStudy(id), lang)).toContain(tx(lang, def.label));
                for (const key of ['study.width', 'study.colour'] as StringKey[]) {
                    expect(tx(lang, key), `${lang} ${key}`).not.toBe('');
                }
                for (const token of STUDY_COLOR_TOKENS) {
                    const key: StringKey = `study.colour.${token}`;
                    expect(tx(lang, key), `${lang} ${token}`).not.toBe('');
                }
                for (const dash of STUDY_LINE_DASHES) {
                    const key: StringKey = `study.dash.${dash}`;
                    expect(tx(lang, key), `${lang} ${dash}`).not.toBe('');
                }
            }
        }
    });
});

describe('bandSegments', () => {
    const bar = (i: number) => ({ time: 1_600_000_000 + i * 86_400 }) as Candle;
    const bars = Array.from({ length: 5 }, (_, i) => bar(i));

    it('keeps one run when both edges exist all the way', () => {
        const runs = bandSegments(bars, [3, 4, 5, 6, 7], [1, 2, 3, 4, 5]);
        expect(runs).toHaveLength(1);
        expect(runs[0]).toHaveLength(5);
        expect(runs[0][0]).toEqual({ time: bars[0].time, upper: 3, lower: 1 });
    });

    it('breaks the ribbon where an edge is missing instead of drawing through it', () => {
        // Two runs of two either side of the gap; the lone bar at the end has no area, so no run.
        const runs = bandSegments(bars, [3, 4, null, 6, 7], [1, 2, null, 4, 5]);
        expect(runs.map((run) => run.map((point) => point.upper))).toEqual([[3, 4], [6, 7]]);
        expect(bandSegments(bars, [3, 4, 5, null, 7], [1, 2, 3, 4, 5]).map((run) => run.length)).toEqual([3]);
    });

    it('drops a run of one point, which has no area to fill', () => {
        expect(bandSegments(bars, [3, null, null, null, null], [1, null, null, null, null])).toEqual([]);
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
        expect(empty.params).toEqual({ fast: 12, slow: 26, signal: 9, source: 'close' });
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

describe('line styles', () => {
    it('falls back to the definition, solid', () => {
        const style = studyLineStyle(defaultStudy('bb'), STUDIES.bb.lines[2]);
        expect(style).toEqual({ color: 'faint', dash: 'solid' });
    });

    it('lets each line of a multi-line study be styled on its own', () => {
        const study = {
            ...defaultStudy('bb'),
            lines: {
                middle: { color: 'up' as const, dash: 'dashed' as const },
                lower: { color: 'down' as const },
            },
        };
        expect(studyLineStyle(study, STUDIES.bb.lines[0])).toEqual({ color: 'faint', dash: 'solid' });
        expect(studyLineStyle(study, STUDIES.bb.lines[1])).toEqual({ color: 'up', dash: 'dashed' });
        expect(studyLineStyle(study, STUDIES.bb.lines[2])).toEqual({ color: 'down', dash: 'solid' });
    });

    it('still honours the legacy single-line colour', () => {
        expect(studyColor({ ...defaultStudy('sma'), color: 'down' }, STUDIES.sma.lines[0])).toBe('down');
        // The per-line form wins when both are present.
        const both = { ...defaultStudy('sma'), color: 'down' as const, lines: { value: { color: 'warn' as const } } };
        expect(studyColor(both, STUDIES.sma.lines[0])).toBe('warn');
    });

    it('carries per-line styles through storage, dropping what it cannot draw', () => {
        const stored = (studies: unknown) => ({ v: 1, studies });
        const [kept] = parseStudies(stored([{ id: 'bb', params: {}, lines: { upper: { color: 'up', dash: 'dotted' }, middle: { color: 'pink', dash: 'wavy' } } }]));
        // The unusable middle entry leaves nothing behind, so it is not stored at all.
        expect(kept.lines).toEqual({ upper: { color: 'up', dash: 'dotted' } });
        const [unknown] = parseStudies(stored([{ id: 'bb', params: {}, lines: { nonsense: { color: 'up' } } }]));
        expect(unknown.lines).toBeUndefined();
        const [empty] = parseStudies(stored([{ id: 'bb', params: {}, lines: { upper: {} } }]));
        expect(empty.lines).toBeUndefined();
    });
});

describe('style', () => {
    it('defaults to a hairline in the line\'s own colour', () => {
        const sma = defaultStudy('sma');
        expect(studyWidth(sma)).toBe(1);
        expect(studyColor(sma, STUDIES.sma.lines[0])).toBe('brand');
    });

    it('lets a single-line study change colour', () => {
        const sma = { ...defaultStudy('sma'), color: 'down' as const };
        expect(studyColor(sma, STUDIES.sma.lines[0])).toBe('down');
    });

    it('keeps the definition palette on a multi-line study', () => {
        // The three Bollinger lines mean upper / middle / lower: a single override would erase that.
        const bb = { ...defaultStudy('bb'), color: 'down' as const };
        expect(studyColor(bb, STUDIES.bb.lines[0])).toBe('faint');
        expect(studyColor(bb, STUDIES.bb.lines[1])).toBe('warn');
    });

    it('reads any width it is given as one of the three steps', () => {
        expect(studyWidth({ ...defaultStudy('sma'), width: 3 })).toBe(3);
        expect(studyWidth({ ...defaultStudy('sma'), width: 2 })).toBe(2);
        expect(studyWidth({ ...defaultStudy('sma'), width: 7 as 3 })).toBe(1);
        expect(studyWidth({ ...defaultStudy('sma'), width: -1 as 1 })).toBe(1);
    });

    it('carries the style through storage, dropping what it cannot draw', () => {
        const stored = (studies: unknown) => ({ v: 1, studies });
        const [sma] = parseStudies(stored([{ id: 'sma', params: {}, color: 'up', width: 3 }]));
        expect(sma).toMatchObject({ id: 'sma', color: 'up', width: 3 });

        const [unknown] = parseStudies(stored([{ id: 'sma', params: {}, color: 'pink', width: 3 }]));
        expect(unknown.color).toBeUndefined();

        const [wide] = parseStudies(stored([{ id: 'sma', params: {}, width: 99 }]));
        expect(wide.width).toBeUndefined();

        // A colour stored against a multi-line study is meaningless, so it is not carried.
        const [bb] = parseStudies(stored([{ id: 'bb', params: {}, color: 'up', width: 2 }]));
        expect(bb.color).toBeUndefined();
        expect(bb.width).toBe(2);
    });
});

describe('source', () => {
    it('defaults to the close and rejects a value it does not offer', () => {
        expect(studiesChoice(defaultStudy('sma'), 'source')).toBe('close');
        expect(studiesChoice({ ...defaultStudy('sma'), params: { period: 20, source: 'high' } }, 'source')).toBe('high');
        expect(studiesChoice({ ...defaultStudy('sma'), params: { source: 'magic' } }, 'source')).toBe('close');
        expect(studiesChoice(defaultStudy('sma'), 'period')).toBe('');
    });

    it('changes what the study computes', () => {
        const highs = { ...defaultStudy('sma'), params: { period: 2, source: 'high' } };
        const closes = { ...defaultStudy('sma'), params: { period: 2, source: 'close' } };
        const def = STUDIES.sma;
        const highLine = def.compute(candles, highs.params).value as (number | null)[];
        const closeLine = def.compute(candles, closes.params).value as (number | null)[];
        expect(highLine[1]).toBeCloseTo((candles[0].high + candles[1].high) / 2);
        expect(closeLine[1]).toBeCloseTo((candles[0].close + candles[1].close) / 2);
        expect(highLine[1]).not.toBeCloseTo(closeLine[1] as number);
    });

    it('is carried through storage and repaired when it is not a choice', () => {
        const stored = (studies: unknown) => ({ v: 1, studies });
        const [kept] = parseStudies(stored([{ id: 'sma', params: { period: 20, source: 'hl2' } }]));
        expect(kept.params.source).toBe('hl2');
        const [fixed] = parseStudies(stored([{ id: 'sma', params: { period: 20, source: 'magic' } }]));
        expect(fixed.params.source).toBe('close');
        const [missing] = parseStudies(stored([{ id: 'sma', params: {} }]));
        expect(missing.params.source).toBe('close');
    });

    it('is not offered on a study that does not read one', () => {
        expect(STUDIES.atr.params.some((param) => param.key === 'source')).toBe(false);
        expect(STUDIES.donchian.params.some((param) => param.key === 'source')).toBe(false);
    });

    it('opens a pane only where one is asked for', () => {
        // By definition: the oscillators.
        expect(studyWantsPane('rsi', {})).toBe(true);
        expect(studyWantsPane('macd', {})).toBe(true);
        // A formula chooses, because the same language writes both kinds of study. A distance from
        // an average belongs in its own pane; an average of the price belongs on the price.
        expect(studyWantsPane('formula', {})).toBe(true);
        expect(studyWantsPane('formula', { placement: 'pane' })).toBe(true);
        expect(studyWantsPane('formula', { placement: 'price' })).toBe(false);
        // Overlays never take a pane whatever else is stored.
        expect(studyWantsPane('sma', { placement: 'pane' })).toBe(false);
        expect(studyWantsPane('sma', {})).toBe(false);
    });

    it('starts a formula in its own pane, so a first try does not flatten the candles', () => {
        expect(defaultStudy('formula').params.placement).toBe('pane');
        expect(studiesChoice(defaultStudy('formula'), 'placement')).toBe('pane');
    });
});

describe('the formula study draws what its text plots', () => {
    const formula = (expression: string) => ({ id: 'formula' as const, params: { expression, placement: 'pane' } });

    it('declares one line per plot, with distinct colours', () => {
        const lines = studyLines(formula('plot(close); plot(sma(close, 5)); plot(low)'));
        expect(lines.map((line) => line.key)).toEqual(['p1', 'p2', 'p3']);
        expect(new Set(lines.map((line) => line.color)).size).toBe(3);
    });

    it('keeps the single value line for a formula without plots', () => {
        const lines = studyLines(formula('close - sma(close, 20)'));
        expect(lines.map((line) => line.key)).toEqual(['value']);
    });

    it('computes a series for every declared line, and nothing for a broken one', () => {
        const plots = STUDIES.formula.compute(candles, formula('plot(close); plot(open)').params);
        expect(Object.keys(plots).sort()).toEqual(['p1', 'p2']);
        expect(plots.p1[0]).toBe(candles[0].close);
        expect(plots.p2[0]).toBe(candles[0].open);

        const broken = STUDIES.formula.compute(candles, formula('plot(').params);
        expect(Object.values(broken).every((series) => series.every((value) => value == null))).toBe(true);
    });

    it('washes a warm-up bar to a gap rather than a zero', () => {
        const plots = STUDIES.formula.compute(candles, formula('plot(sma(close, 20))').params);
        expect(plots.p1[0]).toBeNull();
        expect(typeof plots.p1[30]).toBe('number');
    });
});

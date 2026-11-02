// The chart's indicator library. One registry decides, for every study, what it is called, which
// parameters it takes, which lines it draws and how those lines are computed — so the menu, the
// chart host, the legend and the stored settings all read the same definition.

import {
    adx,
    atr,
    bollinger,
    cci,
    ema,
    macd,
    obv,
    rsi,
    sma,
    stochastic,
    vwap,
    williamsR,
    type Series,
} from '@/lib/indicators';
import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import type { Candle } from '@/lib/yahoo-candles';

/** The list is capped at the pane budget: every oscillator study opens its own pane. */
export const MAX_STUDIES = 12;

export type StudyId =
    | 'sma'
    | 'ema'
    | 'bb'
    | 'vwap'
    | 'rsi'
    | 'macd'
    | 'atr'
    | 'stoch'
    | 'adx'
    | 'wr'
    | 'cci'
    | 'obv';

/** Theme tokens a study may paint with; the host resolves them, the legend maps them to classes. */
export type ColorToken = 'brand' | 'warn' | 'up' | 'down' | 'faint' | 'muted';

export type StudyParam = {
    key: string;
    label: StringKey;
    min: number;
    max: number;
    step: number;
    default: number;
};

export type StudyLine = {
    key: string;
    /** A Latin short code, like O/H/L/C. Hidden when the study has a single line. */
    short: string;
    name: StringKey;
    color: ColorToken;
    kind: 'line' | 'histogram';
};

export type StudyConfig = { id: StudyId; params: Record<string, number> };

export type StudyDef = {
    id: StudyId;
    label: StringKey;
    group: 'overlay' | 'oscillator';
    params: StudyParam[];
    lines: StudyLine[];
    compute: (candles: readonly Candle[], params: Record<string, number>) => Record<string, Series>;
};

const period = (min: number, max: number, value: number): StudyParam => ({
    key: 'period',
    label: 'study.param.period',
    min,
    max,
    step: 1,
    default: value,
});

const valueLine = (color: ColorToken): StudyLine => ({
    key: 'value',
    short: 'V',
    name: 'study.line.value',
    color,
    kind: 'line',
});

/** The author-facing shape: parameters arrive through a reader, so defaults live in one place. */
type Def = Omit<StudyDef, 'compute'> & {
    compute: (candles: readonly Candle[], param: (key: string) => number) => Record<string, Series>;
};

const define = (def: Def): StudyDef => ({
    ...def,
    compute: (candles, params) =>
        def.compute(candles, (key) => {
            const spec = def.params.find((param) => param.key === key);
            if (!spec) return 0;
            const value = params[key];
            return typeof value === 'number' && Number.isFinite(value) ? value : spec.default;
        }),
});

const closes = (candles: readonly Candle[]) => candles.map((candle) => candle.close);

const DEFINITIONS: StudyDef[] = [
    define({
        id: 'sma',
        label: 'study.sma',
        group: 'overlay',
        params: [period(1, 500, 20)],
        lines: [valueLine('brand')],
        compute: (candles, param) => ({ value: sma(closes(candles), param('period')) }),
    }),
    define({
        id: 'ema',
        label: 'study.ema',
        group: 'overlay',
        params: [period(1, 500, 50)],
        lines: [valueLine('muted')],
        compute: (candles, param) => ({ value: ema(closes(candles), param('period')) }),
    }),
    define({
        id: 'bb',
        label: 'study.bb',
        group: 'overlay',
        params: [
            period(2, 200, 20),
            { key: 'stdDev', label: 'study.param.stdDev', min: 0.1, max: 5, step: 0.1, default: 2 },
        ],
        lines: [
            { key: 'upper', short: 'U', name: 'study.line.upper', color: 'faint', kind: 'line' },
            { key: 'middle', short: 'M', name: 'study.line.middle', color: 'warn', kind: 'line' },
            { key: 'lower', short: 'L', name: 'study.line.lower', color: 'faint', kind: 'line' },
        ],
        compute: (candles, param) => bollinger(closes(candles), param('period'), param('stdDev')),
    }),
    define({
        id: 'vwap',
        label: 'study.vwap',
        group: 'overlay',
        params: [],
        lines: [valueLine('warn')],
        compute: (candles) => ({ value: vwap(candles) }),
    }),
    define({
        id: 'rsi',
        label: 'study.rsi',
        group: 'oscillator',
        params: [period(2, 100, 14)],
        lines: [valueLine('brand')],
        compute: (candles, param) => ({ value: rsi(closes(candles), param('period')) }),
    }),
    define({
        id: 'macd',
        label: 'study.macd',
        group: 'oscillator',
        params: [
            { key: 'fast', label: 'study.param.fast', min: 1, max: 100, step: 1, default: 12 },
            { key: 'slow', label: 'study.param.slow', min: 2, max: 200, step: 1, default: 26 },
            { key: 'signal', label: 'study.param.signal', min: 1, max: 100, step: 1, default: 9 },
        ],
        lines: [
            { key: 'histogram', short: 'H', name: 'study.line.histogram', color: 'muted', kind: 'histogram' },
            { key: 'macd', short: 'M', name: 'study.line.macd', color: 'brand', kind: 'line' },
            { key: 'signal', short: 'S', name: 'study.line.signal', color: 'muted', kind: 'line' },
        ],
        compute: (candles, param) =>
            macd(closes(candles), param('fast'), param('slow'), param('signal')),
    }),
    define({
        id: 'atr',
        label: 'study.atr',
        group: 'oscillator',
        params: [period(1, 200, 14)],
        lines: [valueLine('warn')],
        compute: (candles, param) => ({ value: atr(candles, param('period')) }),
    }),
    define({
        id: 'stoch',
        label: 'study.stoch',
        group: 'oscillator',
        params: [
            { key: 'kPeriod', label: 'study.param.kPeriod', min: 1, max: 100, step: 1, default: 14 },
            { key: 'smooth', label: 'study.param.smooth', min: 1, max: 50, step: 1, default: 3 },
            { key: 'dPeriod', label: 'study.param.dPeriod', min: 1, max: 50, step: 1, default: 3 },
        ],
        lines: [
            { key: 'k', short: 'K', name: 'study.line.k', color: 'brand', kind: 'line' },
            { key: 'd', short: 'D', name: 'study.line.d', color: 'warn', kind: 'line' },
        ],
        compute: (candles, param) => stochastic(candles, param('kPeriod'), param('smooth'), param('dPeriod')),
    }),
    define({
        id: 'adx',
        label: 'study.adx',
        group: 'oscillator',
        params: [period(1, 200, 14)],
        lines: [
            { key: 'adx', short: 'ADX', name: 'study.line.adx', color: 'brand', kind: 'line' },
            { key: 'plusDi', short: '+DI', name: 'study.line.plusDi', color: 'up', kind: 'line' },
            { key: 'minusDi', short: '−DI', name: 'study.line.minusDi', color: 'down', kind: 'line' },
        ],
        compute: (candles, param) => adx(candles, param('period')),
    }),
    define({
        id: 'wr',
        label: 'study.wr',
        group: 'oscillator',
        params: [period(1, 200, 14)],
        lines: [valueLine('muted')],
        compute: (candles, param) => ({ value: williamsR(candles, param('period')) }),
    }),
    define({
        id: 'cci',
        label: 'study.cci',
        group: 'oscillator',
        params: [period(2, 200, 20)],
        lines: [valueLine('warn')],
        compute: (candles, param) => ({ value: cci(candles, param('period')) }),
    }),
    define({
        id: 'obv',
        label: 'study.obv',
        group: 'oscillator',
        params: [],
        lines: [valueLine('brand')],
        compute: (candles) => ({ value: obv(candles) }),
    }),
];

export const STUDIES = Object.fromEntries(DEFINITIONS.map((def) => [def.id, def])) as Record<
    StudyId,
    StudyDef
>;

export const STUDY_IDS: StudyId[] = DEFINITIONS.map((def) => def.id);

/** A fresh config for one study, with a copy of the defaults the caller may edit. */
export function defaultStudy(id: StudyId): StudyConfig {
    const def = STUDIES[id];
    return {
        id,
        params: Object.fromEntries(def.params.map((param) => [param.key, param.default])),
    };
}

const clamp = (value: number, param: StudyParam) => Number(Math.min(param.max, Math.max(param.min, value)).toFixed(2));

/** The value actually used by a computation: the stored one, or the default when it is unusable. */
export function studiesParam(study: StudyConfig, key: string): number {
    const def = STUDIES[study.id];
    const param = def?.params.find((entry) => entry.key === key);
    if (!param) return 0;
    const value = study.params[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : param.default;
}

const shortNumber = (value: number) => String(Number(value.toFixed(2)));

/** `SMA 20`, `BB 20 · 2`, `MACD 12 · 26 · 9` — the name plus its parameters, in declared order. */
export function describeStudy(study: StudyConfig, lang: Lang): string {
    const def = STUDIES[study.id];
    if (!def) return '';
    const values = def.params.map((param) => arDigits(shortNumber(studiesParam(study, param.key)), lang));
    const name = tx(lang, def.label);
    return values.length === 0 ? name : `${name} ${values.join(' · ')}`;
}

/**
 * Reads the stored list: unknown studies dropped, parameters clamped and filled from the defaults,
 * order and duplicates kept, the whole list capped. Anything that is not a v1 payload is empty —
 * a chart opening clean is better than one half-configured by a stale shape.
 */
export function parseStudies(value: unknown): StudyConfig[] {
    if (!value || typeof value !== 'object') return [];
    const payload = value as { v?: unknown; studies?: unknown };
    if (payload.v !== 1 || !Array.isArray(payload.studies)) return [];

    const out: StudyConfig[] = [];
    for (const entry of payload.studies) {
        if (out.length >= MAX_STUDIES) break;
        if (!entry || typeof entry !== 'object') continue;
        const candidate = entry as { id?: unknown; params?: unknown };
        if (typeof candidate.id !== 'string' || !(candidate.id in STUDIES)) continue;
        const def = STUDIES[candidate.id as StudyId];
        const stored = candidate.params && typeof candidate.params === 'object' ? (candidate.params as Record<string, unknown>) : {};
        const params: Record<string, number> = {};
        for (const param of def.params) {
            const raw = stored[param.key];
            const number = typeof raw === 'number' && Number.isFinite(raw) ? raw : param.default;
            params[param.key] = clamp(number, param);
        }
        out.push({ id: def.id, params });
    }
    return out;
}

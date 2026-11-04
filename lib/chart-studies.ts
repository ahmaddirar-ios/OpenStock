// The chart's indicator library. One registry decides, for every study, what it is called, which
// parameters it takes, which lines it draws and how those lines are computed — so the menu, the
// chart host, the legend and the stored settings all read the same definition.

import {
    adx,
    atr,
    bollinger,
    cci,
    donchian,
    ema,
    hma,
    ichimoku,
    keltner,
    macd,
    mfi,
    momentum,
    obv,
    parabolicSar,
    roc,
    aroon,
    trix,
    pivots,
    priceSeries,
    rsi,
    sma,
    stochastic,
    supertrend,
    vwap,
    vwma,
    williamsR,
    wma,
    type Series,
} from '@/lib/indicators';
import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import type { Candle } from '@/lib/yahoo-candles';
import { evaluateFormula } from '@/lib/formula';

/** Whether this study wants a pane of its own: by definition, or because its maker said so. */
export function studyWantsPane(id: StudyId, params: StudyParams | undefined): boolean {
    const def = STUDIES[id];
    if (!def) return false;
    if (def.group === 'oscillator') return true;
    // Only a study that declares the choice can be moved, and a study written before the choice
    // existed has nothing stored: it takes the default, the pane rather than a formula that
    // flattens the candles.
    const declared = def.params.find((param) => param.key === 'placement');
    if (!declared) return false;
    return (params?.placement ?? declared.default) === 'pane';
}

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
    | 'obv'
    | 'ichimoku'
    | 'supertrend'
    | 'donchian'
    | 'keltner'
    | 'sar'
    | 'pivots'
    | 'wma'
    | 'hma'
    | 'vwma'
    | 'momentum'
    | 'roc'
    | 'aroon'
    | 'trix'
    | 'mfi'
    | 'formula';

/** Theme tokens a study may paint with; the host resolves them, the legend maps them to classes. */
export type ColorToken = 'brand' | 'warn' | 'up' | 'down' | 'faint' | 'muted';

/** The CSS variable and the pre-resolution fallback behind each token. */
export const STUDY_COLOR_SOURCES: Record<ColorToken, { token: string; fallback: string }> = {
    brand: { token: '--brand', fallback: '#34d399' },
    warn: { token: '--warn', fallback: '#f6c76b' },
    up: { token: '--up', fallback: '#4ade80' },
    down: { token: '--down', fallback: '#f87171' },
    faint: { token: '--faint', fallback: '#7d8a84' },
    muted: { token: '--muted-foreground', fallback: '#94a3b8' },
};

export const STUDY_COLOR_TOKENS = Object.keys(STUDY_COLOR_SOURCES) as ColorToken[];

/** Three strokes: a hairline, a normal line, and a deliberately heavier one. */
export const STUDY_WIDTHS = [1, 2, 3] as const;
export type StudyWidth = (typeof STUDY_WIDTHS)[number];

export type StudyParams = Record<string, number | string>;

export type NumberParam = {
    kind?: 'number';
    key: string;
    label: StringKey;
    min: number;
    max: number;
    step: number;
    default: number;
};

/** A pick-one parameter: a source, a mode, anything whose values are names rather than amounts. */
export type ChoiceParam = {
    kind: 'choice';
    key: string;
    label: StringKey;
    default: string;
    choices: { value: string; label: StringKey }[];
};

/** Free text: a formula, and nothing else so far. */
export type TextParam = {
    kind: 'text';
    key: string;
    label: StringKey;
    default: string;
    /** Shown under the box, so the writer does not have to guess the vocabulary. */
    hint?: StringKey;
};

export type StudyParam = NumberParam | ChoiceParam | TextParam;

const isChoice = (param: StudyParam): param is ChoiceParam => param.kind === 'choice';
const isText = (param: StudyParam): param is TextParam => param.kind === 'text';

export type StudyLine = {
    key: string;
    /** A Latin short code, like O/H/L/C. Hidden when the study has a single line. */
    short: string;
    name: StringKey;
    color: ColorToken;
    kind: 'line' | 'histogram';
};

/**
 * One configured study. `color` is only honoured on a single-line study: the multi-line ones use
 * colour to tell their lines apart, so their palette belongs to the definition. `width` is shared by
 * every line of the study.
 */
/** A plot's own look: both fields optional, and the definition's colour is the fallback. */
export type StudyLineStyle = { color?: ColorToken; dash?: StudyLineDash };

export type StudyLineDash = 'solid' | 'dashed' | 'dotted';
export const STUDY_LINE_DASHES: readonly StudyLineDash[] = ['solid', 'dashed', 'dotted'];

export type StudyConfig = {
    id: StudyId;
    params: StudyParams;
    /** Legacy shortcut for a single-line study; a per-line style is the general form. */
    color?: ColorToken;
    width?: StudyWidth;
    /** Per-plot overrides, keyed by the line key the definition declares. */
    lines?: Record<string, StudyLineStyle>;
};

export type StudyDef = {
    id: StudyId;
    label: StringKey;
    group: 'overlay' | 'oscillator';
    params: StudyParam[];
    lines: StudyLine[];
    compute: (candles: readonly Candle[], params: StudyParams) => Record<string, Series>;
};

const period = (min: number, max: number, value: number): StudyParam => ({
    key: 'period',
    label: 'study.param.period',
    min,
    max,
    step: 1,
    default: value,
});

/** The source choices every price-averaging study offers, in TradingView's order. */
const SOURCE_CHOICES: ChoiceParam['choices'] = [
    { value: 'close', label: 'study.source.close' },
    { value: 'open', label: 'study.source.open' },
    { value: 'high', label: 'study.source.high' },
    { value: 'low', label: 'study.source.low' },
    { value: 'hl2', label: 'study.source.hl2' },
    { value: 'hlc3', label: 'study.source.hlc3' },
    { value: 'ohlc4', label: 'study.source.ohlc4' },
];

const source = (): ChoiceParam => ({
    kind: 'choice',
    key: 'source',
    label: 'study.param.source',
    default: 'close',
    choices: SOURCE_CHOICES,
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
    compute: (
        candles: readonly Candle[],
        param: (key: string) => number,
        pick: (key: string) => string,
    ) => Record<string, Series>;
};

const define = (def: Def): StudyDef => ({
    ...def,
    compute: (candles, params) =>
        def.compute(
            candles,
            (key) => {
                const spec = def.params.find((param) => param.key === key);
                // Only a number parameter has a number to give; a name or a formula reads through pick().
                if (!spec || isChoice(spec) || isText(spec)) return 0;
                const value = params[key];
                return typeof value === 'number' && Number.isFinite(value) ? value : spec.default;
            },
            (key) => {
                const spec = def.params.find((param) => param.key === key);
                if (!spec) return '';
                // Text parameters come back as they were typed; a choice only if it is still on offer.
                if (isText(spec)) {
                    const value = params[key];
                    return typeof value === 'string' && value.trim() ? value : spec.default;
                }
                if (!isChoice(spec)) return '';
                const value = params[key];
                return typeof value === 'string' && spec.choices.some((choice) => choice.value === value)
                    ? value
                    : spec.default;
            },
        ),
});

const DEFINITIONS: StudyDef[] = [
    define({
        id: 'sma',
        label: 'study.sma',
        group: 'overlay',
        params: [period(1, 500, 20), source()],
        lines: [valueLine('brand')],
        compute: (candles, param, pick) => ({ value: sma(priceSeries(candles, pick('source')), param('period')) }),
    }),
    define({
        id: 'ema',
        label: 'study.ema',
        group: 'overlay',
        params: [period(1, 500, 50), source()],
        lines: [valueLine('muted')],
        compute: (candles, param, pick) => ({ value: ema(priceSeries(candles, pick('source')), param('period')) }),
    }),
    define({
        id: 'bb',
        label: 'study.bb',
        group: 'overlay',
        params: [
            period(2, 200, 20),
            { key: 'stdDev', label: 'study.param.stdDev', min: 0.1, max: 5, step: 0.1, default: 2 },
            source(),
        ],
        lines: [
            { key: 'upper', short: 'U', name: 'study.line.upper', color: 'faint', kind: 'line' },
            { key: 'middle', short: 'M', name: 'study.line.middle', color: 'warn', kind: 'line' },
            { key: 'lower', short: 'L', name: 'study.line.lower', color: 'faint', kind: 'line' },
        ],
        compute: (candles, param, pick) =>
            bollinger(priceSeries(candles, pick('source')), param('period'), param('stdDev')),
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
        params: [period(2, 100, 14), source()],
        lines: [valueLine('brand')],
        compute: (candles, param, pick) => ({ value: rsi(priceSeries(candles, pick('source')), param('period')) }),
    }),
    define({
        id: 'macd',
        label: 'study.macd',
        group: 'oscillator',
        params: [
            { key: 'fast', label: 'study.param.fast', min: 1, max: 100, step: 1, default: 12 },
            { key: 'slow', label: 'study.param.slow', min: 2, max: 200, step: 1, default: 26 },
            { key: 'signal', label: 'study.param.signal', min: 1, max: 100, step: 1, default: 9 },
            source(),
        ],
        lines: [
            { key: 'histogram', short: 'H', name: 'study.line.histogram', color: 'muted', kind: 'histogram' },
            { key: 'macd', short: 'M', name: 'study.line.macd', color: 'brand', kind: 'line' },
            { key: 'signal', short: 'S', name: 'study.line.signal', color: 'muted', kind: 'line' },
        ],
        compute: (candles, param, pick) =>
            macd(priceSeries(candles, pick('source')), param('fast'), param('slow'), param('signal')),
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
    define({
        id: 'ichimoku',
        label: 'study.ichimoku',
        group: 'overlay',
        params: [
            { key: 'conversion', label: 'study.param.conversion', min: 1, max: 200, step: 1, default: 9 },
            { key: 'base', label: 'study.param.base', min: 1, max: 400, step: 1, default: 26 },
            { key: 'spanB', label: 'study.param.spanB', min: 1, max: 400, step: 1, default: 52 },
            { key: 'shift', label: 'study.param.shift', min: 0, max: 200, step: 1, default: 26 },
        ],
        lines: [
            { key: 'tenkan', short: 'T', name: 'study.line.tenkan', color: 'brand', kind: 'line' },
            { key: 'kijun', short: 'K', name: 'study.line.kijun', color: 'warn', kind: 'line' },
            { key: 'senkouA', short: 'A', name: 'study.line.senkouA', color: 'up', kind: 'line' },
            { key: 'senkouB', short: 'B', name: 'study.line.senkouB', color: 'down', kind: 'line' },
            { key: 'chikou', short: 'C', name: 'study.line.chikou', color: 'muted', kind: 'line' },
        ],
        compute: (candles, param) =>
            ichimoku(candles, param('conversion'), param('base'), param('spanB'), param('shift')),
    }),
    define({
        id: 'supertrend',
        label: 'study.supertrend',
        group: 'overlay',
        params: [
            period(1, 200, 10),
            { key: 'multiplier', label: 'study.param.multiplier', min: 0.1, max: 10, step: 0.1, default: 3 },
        ],
        lines: [{ key: 'value', short: 'ST', name: 'study.line.supertrend', color: 'brand', kind: 'line' }],
        compute: (candles, param) => ({ value: supertrend(candles, param('period'), param('multiplier')) }),
    }),
    define({
        id: 'donchian',
        label: 'study.donchian',
        group: 'overlay',
        params: [period(1, 500, 20)],
        lines: [
            { key: 'upper', short: 'U', name: 'study.line.upper', color: 'faint', kind: 'line' },
            { key: 'middle', short: 'M', name: 'study.line.middle', color: 'warn', kind: 'line' },
            { key: 'lower', short: 'L', name: 'study.line.lower', color: 'faint', kind: 'line' },
        ],
        compute: (candles, param) => donchian(candles, param('period')),
    }),
    define({
        id: 'keltner',
        label: 'study.keltner',
        group: 'overlay',
        params: [
            period(1, 200, 20),
            { key: 'multiplier', label: 'study.param.multiplier', min: 0.1, max: 10, step: 0.1, default: 2 },
            source(),
        ],
        lines: [
            { key: 'upper', short: 'U', name: 'study.line.upper', color: 'faint', kind: 'line' },
            { key: 'middle', short: 'M', name: 'study.line.middle', color: 'brand', kind: 'line' },
            { key: 'lower', short: 'L', name: 'study.line.lower', color: 'faint', kind: 'line' },
        ],
        compute: (candles, param, pick) =>
            keltner(candles, param('period'), param('multiplier'), priceSeries(candles, pick('source'))),
    }),
    define({
        id: 'sar',
        label: 'study.sar',
        group: 'overlay',
        params: [
            { key: 'step', label: 'study.param.step', min: 0.001, max: 0.2, step: 0.001, default: 0.02 },
            { key: 'max', label: 'study.param.max', min: 0.01, max: 1, step: 0.01, default: 0.2 },
        ],
        lines: [{ key: 'value', short: 'SAR', name: 'study.line.sar', color: 'warn', kind: 'line' }],
        compute: (candles, param) => ({ value: parabolicSar(candles, param('step'), param('max')) }),
    }),
    define({
        id: 'wma',
        label: 'study.wma',
        group: 'overlay',
        params: [period(1, 500, 20), source()],
        lines: [valueLine('brand')],
        compute: (candles, param, pick) => ({ value: wma(priceSeries(candles, pick('source')), param('period')) }),
    }),
    define({
        id: 'hma',
        label: 'study.hma',
        group: 'overlay',
        params: [period(2, 500, 9), source()],
        lines: [valueLine('warn')],
        compute: (candles, param, pick) => ({ value: hma(priceSeries(candles, pick('source')), param('period')) }),
    }),
    define({
        id: 'vwma',
        label: 'study.vwma',
        group: 'overlay',
        params: [period(1, 500, 20), source()],
        lines: [valueLine('muted')],
        compute: (candles, param, pick) => ({
            value: vwma(candles, param('period'), priceSeries(candles, pick('source'))),
        }),
    }),
    define({
        id: 'momentum',
        label: 'study.momentum',
        group: 'oscillator',
        params: [period(1, 500, 10), source()],
        lines: [valueLine('brand')],
        compute: (candles, param, pick) => ({
            value: momentum(priceSeries(candles, pick('source')), param('period')),
        }),
    }),
    define({
        id: 'roc',
        label: 'study.roc',
        group: 'oscillator',
        params: [period(1, 500, 9), source()],
        lines: [valueLine('warn')],
        compute: (candles, param, pick) => ({
            value: roc(priceSeries(candles, pick('source')), param('period')),
        }),
    }),
    define({
        id: 'aroon',
        label: 'study.aroon',
        group: 'oscillator',
        params: [period(2, 500, 14)],
        lines: [
            { key: 'up', short: 'U', name: 'study.line.aroonUp', color: 'up', kind: 'line' },
            { key: 'down', short: 'D', name: 'study.line.aroonDown', color: 'down', kind: 'line' },
        ],
        compute: (candles, param) => aroon(candles, param('period')),
    }),
    define({
        id: 'trix',
        label: 'study.trix',
        group: 'oscillator',
        params: [period(1, 200, 15), source()],
        lines: [valueLine('muted')],
        compute: (candles, param, pick) => ({
            value: trix(priceSeries(candles, pick('source')), param('period')),
        }),
    }),
    define({
        id: 'mfi',
        label: 'study.mfi',
        group: 'oscillator',
        params: [period(2, 200, 14)],
        lines: [valueLine('brand')],
        compute: (candles, param) => ({ value: mfi(candles, param('period')) }),
    }),
    define({
        id: 'pivots',
        label: 'study.pivots',
        group: 'overlay',
        params: [],
        lines: [
            { key: 'pivot', short: 'P', name: 'study.line.pivot', color: 'brand', kind: 'line' },
            { key: 'r1', short: 'R1', name: 'study.line.r1', color: 'down', kind: 'line' },
            { key: 'r2', short: 'R2', name: 'study.line.r2', color: 'down', kind: 'line' },
            { key: 'r3', short: 'R3', name: 'study.line.r3', color: 'down', kind: 'line' },
            { key: 's1', short: 'S1', name: 'study.line.s1', color: 'up', kind: 'line' },
            { key: 's2', short: 'S2', name: 'study.line.s2', color: 'up', kind: 'line' },
            { key: 's3', short: 'S3', name: 'study.line.s3', color: 'up', kind: 'line' },
        ],
        compute: (candles) => pivots(candles),
    }),
    define({
        id: 'formula',
        label: 'study.formula',
        // The language writes both kinds of study: `sma(close, 20)` belongs on the price, and
        // `close - sma(close, 20)` measures a distance that would flatten the candles if it shared
        // their scale. Which one it is cannot be read off the text, so the trader says it.
        group: 'overlay',
        params: [
            { kind: 'text', key: 'expression', label: 'study.param.expression', default: 'close - sma(close, 20)', hint: 'study.param.expressionHint' },
            {
                kind: 'choice',
                key: 'placement',
                label: 'study.param.placement',
                default: 'pane',
                choices: [
                    { value: 'pane', label: 'study.placement.pane' },
                    { value: 'price', label: 'study.placement.price' },
                ],
            },
        ],
        lines: [valueLine('brand')],
        compute: (candles, _param, pick) => {
            const result = evaluateFormula(pick('expression'), candles);
            // A formula that does not run draws nothing rather than breaking the chart: the menu
            // already prints the reason while it is being typed. A warm-up bar (an average of 20 has
            // nothing to say in bar 3) is a gap, which the series type spells null.
            return {
                value: result.ok
                    ? result.values.map((value) => (Number.isFinite(value) ? value : null))
                    : candles.map(() => null),
            };
        },
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
        params: Object.fromEntries(def.params.map((param) => [param.key, param.default])) as StudyParams,
    };
}

const clamp = (value: number, param: NumberParam) =>
    Number(Math.min(param.max, Math.max(param.min, value)).toFixed(2));

const isColorToken = (value: unknown): value is ColorToken =>
    typeof value === 'string' && (STUDY_COLOR_TOKENS as string[]).includes(value);

const isWidth = (value: unknown): value is StudyWidth =>
    typeof value === 'number' && (STUDY_WIDTHS as readonly number[]).includes(value);

/** The stroke to draw the study with, defaulting to a hairline. */
export function studyWidth(study: StudyConfig): StudyWidth {
    return isWidth(study.width) ? study.width : 1;
}

const isDash = (value: unknown): value is StudyLineDash =>
    typeof value === 'string' && (STUDY_LINE_DASHES as readonly string[]).includes(value);

/**
 * The style a line is drawn with. A per-line override wins; on a single-line study the legacy
 * `color` still means that one line, so payloads written before per-line styles keep working.
 */
export function studyLineStyle(study: StudyConfig, line: StudyLine): { color: ColorToken; dash: StudyLineDash } {
    const def = STUDIES[study.id];
    const own = study.lines?.[line.key];
    const legacy = def && def.lines.length === 1 && isColorToken(study.color) ? study.color : undefined;
    const color = isColorToken(own?.color) ? own.color : legacy ?? line.color;
    return { color, dash: isDash(own?.dash) ? own.dash : 'solid' };
}

/** The colour a line is drawn with; kept for callers that only need the colour. */
export function studyColor(study: StudyConfig, line: StudyLine): ColorToken {
    return studyLineStyle(study, line).color;
}

/** The numeric value actually used by a computation: the stored one, or the default. */
export function studiesParam(study: StudyConfig, key: string): number {
    const def = STUDIES[study.id];
    const param = def?.params.find((entry) => entry.key === key);
    if (!param || isChoice(param) || isText(param)) return 0;
    const value = study.params[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : param.default;
}

/** The chosen name for a choice parameter: the stored one when it is offered, else the default. */
export function studiesChoice(study: StudyConfig, key: string): string {
    const def = STUDIES[study.id];
    const param = def?.params.find((entry) => entry.key === key);
    if (!param || !isChoice(param)) return '';
    const value = study.params[key];
    if (typeof value === 'string' && param.choices.some((choice) => choice.value === value)) return value;
    return param.default;
}

/** How long a formula may get: long enough for a real expression, short enough for a settings row. */
export const MAX_FORMULA_LENGTH = 400;

/** The string value a text parameter ended up with. */
export function studiesText(study: StudyConfig, key: string): string {
    const def = STUDIES[study.id];
    const param = def?.params.find((entry) => entry.key === key);
    if (!param || !isText(param)) return '';
    const value = study.params[key];
    return typeof value === 'string' && value.trim() ? value : param.default;
}

const shortNumber = (value: number) => String(Number(value.toFixed(2)));

/** `SMA 20`, `BB 20 · 2`, `MACD 12 · 26 · 9` — the name plus its parameters, in declared order. */
export function describeStudy(study: StudyConfig, lang: Lang): string {
    const def = STUDIES[study.id];
    if (!def) return '';
    const values = def.params.map((param) => {
        if (isText(param)) return studiesText(study, param.key);
        if (isChoice(param)) {
            const chosen = param.choices.find((choice) => choice.value === studiesChoice(study, param.key));
            return chosen ? tx(lang, chosen.label) : '';
        }
        return arDigits(shortNumber(studiesParam(study, param.key)), lang);
    });
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
        const candidate = entry as {
            id?: unknown;
            params?: unknown;
            color?: unknown;
            width?: unknown;
            lines?: unknown;
        };
        if (typeof candidate.id !== 'string' || !(candidate.id in STUDIES)) continue;
        const def = STUDIES[candidate.id as StudyId];
        const stored = candidate.params && typeof candidate.params === 'object' ? (candidate.params as Record<string, unknown>) : {};
        const params: StudyParams = {};
        for (const param of def.params) {
            const raw = stored[param.key];
            if (isText(param)) {
                const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_FORMULA_LENGTH) : '';
                params[param.key] = text || param.default;
                continue;
            }
            if (isChoice(param)) {
                params[param.key] =
                    typeof raw === 'string' && param.choices.some((choice) => choice.value === raw)
                        ? raw
                        : param.default;
                continue;
            }
            const number = typeof raw === 'number' && Number.isFinite(raw) ? raw : param.default;
            params[param.key] = clamp(number, param);
        }
        const entryOut: StudyConfig = { id: def.id, params };
        const storedLines = candidate.lines && typeof candidate.lines === 'object' && !Array.isArray(candidate.lines)
            ? (candidate.lines as Record<string, unknown>)
            : {};
        const lines: Record<string, StudyLineStyle> = {};
        for (const spec of def.lines) {
            const raw = storedLines[spec.key];
            if (!raw || typeof raw !== 'object') continue;
            const style = raw as { color?: unknown; dash?: unknown };
            const entry: StudyLineStyle = {};
            if (isColorToken(style.color)) entry.color = style.color;
            if (isDash(style.dash)) entry.dash = style.dash;
            if (entry.color || entry.dash) lines[spec.key] = entry;
        }
        if (Object.keys(lines).length > 0) entryOut.lines = lines;
        if (isColorToken(candidate.color) && def.lines.length === 1) entryOut.color = candidate.color;
        if (isWidth(candidate.width)) entryOut.width = candidate.width;
        out.push(entryOut);
    }
    return out;
}

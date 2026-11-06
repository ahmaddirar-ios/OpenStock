// Alert rules, their price source and their arithmetic: pure functions only, no IO.
// The on-visit checker and the Inngest cron both run this file, so the demo and Cloud can
// never disagree about whether an alert fired.

import { hasFinnhubQuotes } from '@/lib/markets';
import { normalizeYahooSymbol } from '@/lib/yahoo';
import { atr, rsi, sma } from '@/lib/indicators';
import { checkFormula, evaluateFormula } from '@/lib/formula';
import { customSignals, parseCustomStrategy, type CustomStrategy } from '@/lib/custom-strategy';
import type { Candle } from '@/lib/yahoo-candles';
import {
    DRAWING_BAND,
    DRAWING_CONDITIONS,
    anchorGap,
    clampBand,
    evaluateDrawingRule,
    isDrawingCondition,
    type DrawingAnchor,
} from '@/lib/drawing-alert';

/** A formula alert is a sentence, not a program: long enough for a real rule, short enough to store. */
export const MAX_ALERT_FORMULA = 400;

/** The most rules one alert may combine. Beyond this a rule set stops reading as a sentence. */
export const MAX_ALERT_RULES = 5;

/** The alert log keeps this many firings per user, newest first. */
export const MAX_ALERT_EVENTS = 200;

export type AlertCondition =
    | 'ABOVE'
    | 'BELOW'
    | 'CROSS_UP'
    | 'CROSS_DOWN'
    | 'CHANGE_UP'
    | 'CHANGE_DOWN'
    | 'RSI_BELOW'
    | 'RSI_ABOVE'
    | 'PRICE_CROSS_UP_SMA'
    | 'PRICE_CROSS_DOWN_SMA'
    | 'VOLUME_SPIKE'
    | 'ATR_ABOVE'
    | 'CROSS_52W_HIGH'
    | 'CROSS_52W_LOW'
    // Attached to a drawing: the price breaks above or below a snapshotted line, or touches it.
    | 'DRAWING_CROSS_UP'
    | 'DRAWING_CROSS_DOWN'
    | 'DRAWING_TOUCH'
    // A formula or a saved strategy, read on the newest bar: the same language the chart draws.
    | 'FORMULA'
    | 'STRATEGY';

export const ALERT_CONDITIONS: readonly AlertCondition[] = [
    'ABOVE',
    'BELOW',
    'CROSS_UP',
    'CROSS_DOWN',
    'CHANGE_UP',
    'CHANGE_DOWN',
    'RSI_BELOW',
    'RSI_ABOVE',
    'PRICE_CROSS_UP_SMA',
    'PRICE_CROSS_DOWN_SMA',
    'VOLUME_SPIKE',
    'ATR_ABOVE',
    'CROSS_52W_HIGH',
    'CROSS_52W_LOW',
    ...DRAWING_CONDITIONS,
    'FORMULA',
    'STRATEGY',
];

export const isAlertCondition = (value: unknown): value is AlertCondition =>
    typeof value === 'string' && (ALERT_CONDITIONS as readonly string[]).includes(value);

/** `CHANGE_*` targets are percentages; every other target is a price. */
export const isPercentCondition = (condition: AlertCondition): boolean =>
    condition === 'CHANGE_UP' || condition === 'CHANGE_DOWN';

/** The second number some rules carry; the first is always `targetPrice`. */
/** The second number some rules carry; the first is always `targetPrice`. `band` is a touch's width. */
export type AlertParams = {
    period?: number;
    window?: number;
    band?: number;
    /** A FORMULA rule's text, in the chart's own language. */
    expression?: string;
    /** A STRATEGY rule's saved system; its entry rule is what the alert watches. */
    strategy?: CustomStrategy;
};

/**
 * Every range a rule's numbers may take, in one place: the validators, the defaults and the
 * create form all read it, so the form cannot offer a number the server would refuse.
 */
export const PARAM_BOUNDS = {
    /** `targetPrice` for RSI_BELOW / RSI_ABOVE. */
    rsiLevel: { min: 1, max: 99 },
    /** `params.period` for the RSI rules. */
    rsiPeriod: { min: 2, max: 50, default: 14 },
    /** `targetPrice` for the SMA cross rules, where the number *is* the period. */
    smaPeriod: { min: 5, max: 400, default: 50 },
    /** `targetPrice` for VOLUME_SPIKE. */
    volumeMultiple: { min: 1, max: 20 },
    /** `params.window` for VOLUME_SPIKE. */
    volumeWindow: { min: 5, max: 100, default: 20 },
    /** `targetPrice` for ATR_ABOVE: the ATR as a percentage of the close. */
    atrPercent: { min: 0.1, max: 50 },
    /** `params.period` for ATR_ABOVE. */
    atrPeriod: { min: 2, max: 50, default: 14 },
    /** `targetPrice` for the 52-week rules: how many bars the high or low looks back over. */
    breakoutLookback: { min: 20, max: 400, default: 252 },
} as const;

/** The rules that read a series instead of a quote: the checker's one routing rule. */
const SERIES_CONDITIONS: readonly AlertCondition[] = [
    'FORMULA',
    'STRATEGY',
    'RSI_BELOW',
    'RSI_ABOVE',
    'PRICE_CROSS_UP_SMA',
    'PRICE_CROSS_DOWN_SMA',
    'VOLUME_SPIKE',
    'ATR_ABOVE',
    'CROSS_52W_HIGH',
    'CROSS_52W_LOW',
];

export const needsCandles = (condition: AlertCondition): boolean => SERIES_CONDITIONS.includes(condition);

/** The rules whose form asks for a second number on top of the target. */
export const hasSecondNumber = (condition: AlertCondition): boolean =>
    condition === 'RSI_BELOW' || condition === 'RSI_ABOVE' || condition === 'VOLUME_SPIKE' || condition === 'ATR_ABOVE';

const within = (value: number, range: { min: number; max: number }): boolean =>
    Number.isFinite(value) && value >= range.min && value <= range.max;

/** Fills the second number a rule needs, so a stored rule is never half-specified. */
export function normalizeAlertParams(condition: AlertCondition, params?: AlertParams): AlertParams {
    if (condition === 'FORMULA') {
        return { expression: typeof params?.expression === 'string' ? params.expression.trim().slice(0, MAX_ALERT_FORMULA) : '' };
    }
    if (condition === 'STRATEGY') {
        const strategy = parseCustomStrategy(params?.strategy);
        return strategy ? { strategy } : {};
    }
    if (condition === 'RSI_BELOW' || condition === 'RSI_ABOVE') {
        return { period: Math.round(Number(params?.period ?? PARAM_BOUNDS.rsiPeriod.default)) };
    }
    if (condition === 'VOLUME_SPIKE') {
        return { window: Math.round(Number(params?.window ?? PARAM_BOUNDS.volumeWindow.default)) };
    }
    if (condition === 'ATR_ABOVE') {
        return { period: Math.round(Number(params?.period ?? PARAM_BOUNDS.atrPeriod.default)) };
    }
    if (condition === 'DRAWING_TOUCH') {
        // The band a touch counts within, in percent of the line's price.
        return { band: clampBand(params?.band) };
    }
    return {};
}

/** Whether the second number is inside its range. Absent is fine: the default applies. */
export function validateAlertParams(condition: AlertCondition, params?: AlertParams): boolean {
    if (condition === 'FORMULA') {
        const text = typeof params?.expression === 'string' ? params.expression.trim() : '';
        return text.length > 0 && text.length <= MAX_ALERT_FORMULA && checkFormula(text).ok;
    }
    if (condition === 'STRATEGY') {
        return parseCustomStrategy(params?.strategy) !== null;
    }
    if (condition === 'RSI_BELOW' || condition === 'RSI_ABOVE') {
        return params?.period == null || within(Number(params.period), PARAM_BOUNDS.rsiPeriod);
    }
    if (condition === 'VOLUME_SPIKE') {
        return params?.window == null || within(Number(params.window), PARAM_BOUNDS.volumeWindow);
    }
    if (condition === 'ATR_ABOVE') {
        return params?.period == null || within(Number(params.period), PARAM_BOUNDS.atrPeriod);
    }
    if (condition === 'DRAWING_TOUCH') {
        return params?.band == null || (Number.isFinite(Number(params.band)) && Number(params.band) >= DRAWING_BAND.min && Number(params.band) <= DRAWING_BAND.max);
    }
    return params?.period == null && params?.window == null;
}

/** Where a symbol's quote comes from, or null when the app cannot price it at all. */
export type AlertSource = 'yahoo' | 'finnhub';

/** The same shape the alert action already accepted: a ticker, or a Binance pair. */
const FINNHUB_SYMBOL = /^(BINANCE:[A-Z0-9]{2,20}|[A-Z0-9][A-Z0-9.-]{0,14})$/;

/**
 * Tadawul listings are four digits. A bare `2222` is a Saudi ticker, not a US one —
 * Finnhub would happily accept the string and then answer 403, which is the trap this
 * helper exists to avoid.
 */
function tadawulSymbol(symbol: string): string | null {
    const upper = String(symbol ?? '').trim().toUpperCase();
    const direct = normalizeYahooSymbol(upper);
    if (direct) return direct.startsWith('^') ? null : direct;
    return /^\d{4}$/.test(upper) ? normalizeYahooSymbol(`TADAWUL:${upper}`) : null;
}

export function alertSource(symbol: string): AlertSource | null {
    const upper = String(symbol ?? '').trim().toUpperCase();
    if (!upper || upper.startsWith('^')) return null;
    if (tadawulSymbol(upper)) return 'yahoo';
    if (FINNHUB_SYMBOL.test(upper) && hasFinnhubQuotes(upper)) return 'finnhub';
    return null;
}

/** The Yahoo symbol to ask for, so `2222` and `TADAWUL:2222` become `2222.SR`. */
export function alertYahooSymbol(symbol: string): string | null {
    return tadawulSymbol(symbol);
}

/** The symbol we store: the Yahoo listing form for Saudi, the ticker as typed otherwise. */
export function alertStoredSymbol(symbol: string): string | null {
    const upper = String(symbol ?? '').trim().toUpperCase();
    if (alertSource(upper) === 'yahoo') return alertYahooSymbol(upper);
    return alertSource(upper) === 'finnhub' ? upper : null;
}

export type AlertSnapshot = { price: number; changePercent: number };

export type AlertRule = {
    condition: AlertCondition;
    targetPrice: number;
    params?: AlertParams;
    /** The price at the previous check, used only by the price cross conditions. */
    lastPrice?: number | null;
    /** The drawing this rule was made on, snapshotted when it was made. */
    anchor?: DrawingAnchor | null;
    /** The signed gap to that drawing at the previous check; the cross conditions compare against it. */
    lastGap?: number | null;
    /** When the check runs, so a line can be read at that moment. */
    at?: number;
};

/**
 * Whether the rule fires on this snapshot.
 *
 * `ABOVE`/`BELOW` fire whenever the price is past the level — the same semantics the
 * existing alerts already had. `CROSS_*` need a previous price, so the first check after
 * creating or re-arming only records one; that is why they cannot fire on thin data.
 */
export function evaluateAlert(rule: AlertRule, snapshot: AlertSnapshot): boolean {
    const price = Number(snapshot.price);
    if (!Number.isFinite(price) || price <= 0) return false;

    // A drawing rule reads its own geometry; `targetPrice` is only the line's price when it was made.
    if (isDrawingCondition(rule.condition)) {
        if (!rule.anchor) return false;
        return evaluateDrawingRule({
            condition: rule.condition,
            anchor: rule.anchor,
            price,
            time: rule.at ?? Math.floor(Date.now() / 1000),
            lastGap: rule.lastGap ?? null,
            band: rule.params?.band,
        });
    }

    const target = Number(rule.targetPrice);
    if (!Number.isFinite(target) || price <= 0) return false;
    const last = rule.lastPrice == null ? null : Number(rule.lastPrice);

    switch (rule.condition) {
        case 'ABOVE':
            return price >= target;
        case 'BELOW':
            return price <= target;
        case 'CROSS_UP':
            return last != null && Number.isFinite(last) && last < target && price >= target;
        case 'CROSS_DOWN':
            return last != null && Number.isFinite(last) && last > target && price <= target;
        case 'CHANGE_UP':
            return Number(snapshot.changePercent) >= target;
        case 'CHANGE_DOWN':
            return Number(snapshot.changePercent) <= -target;
        default:
            return false;
    }
}

/** What the next check compares against: today's price, whatever happened this time. */
export const nextLastPrice = (snapshot: AlertSnapshot): number => snapshot.price;

/** A target the rule can actually use: positive, and inside the range its own rule allows. */
export function validateAlertTarget(condition: AlertCondition, target: number): boolean {
    // A formula or a strategy is its own condition: there is no number to type.
    if (condition === 'FORMULA' || condition === 'STRATEGY') return true;
    if (!Number.isFinite(target) || target <= 0) return false;
    if (isPercentCondition(condition)) return target <= 100;
    if (condition === 'RSI_BELOW' || condition === 'RSI_ABOVE') return within(target, PARAM_BOUNDS.rsiLevel);
    if (condition === 'VOLUME_SPIKE') return within(target, PARAM_BOUNDS.volumeMultiple);
    if (condition === 'PRICE_CROSS_UP_SMA' || condition === 'PRICE_CROSS_DOWN_SMA') return within(target, PARAM_BOUNDS.smaPeriod);
    if (condition === 'ATR_ABOVE') return within(target, PARAM_BOUNDS.atrPercent);
    if (condition === 'CROSS_52W_HIGH' || condition === 'CROSS_52W_LOW') return within(target, PARAM_BOUNDS.breakoutLookback);
    return true;
}

/** One stored rule, as a checker sees it: an id, its symbol and what the last check saw. */
export type CheckRuleRow = {
    id: string;
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
    params?: AlertParams;
    lastPrice?: number | null;
    /** A drawing rule's snapshotted line, and where the price sat relative to it last time. */
    anchor?: DrawingAnchor | null;
    lastGap?: number | null;
};

/**
 * What a series rule measured on the most recent bar, plus the value of the bar before it for
 * the cross rules. `value` is what the rule compares, `display` is what a trader reads.
 */
export type Measure = {
    value: number;
    previous: number | null;
    display: number;
};

/**
 * Measures one rule on the candles Yahoo served, most recent bar included: RSI, the gap between
 * the close and its average (so a cross is a sign change), or the bar's volume over the average
 * of the `window` bars before it. `null` when the series is shorter than the rule needs — a short
 * series is "not checked", never a zero.
 */
export function measureRule(rule: AlertRule, candles?: Candle[] | null): Measure | null {
    const bars = candles ?? [];
    const last = bars.length - 1;
    if (last < 0) return null;

    switch (rule.condition) {
        case 'FORMULA': {
            const text = typeof rule.params?.expression === 'string' ? rule.params.expression.trim() : '';
            if (!text) return null;
            const result = evaluateFormula(text, bars);
            if (!result.ok) return null;
            const value = result.values[last];
            if (value == null || !Number.isFinite(value)) return null;
            return { value, previous: null, display: value };
        }
        case 'STRATEGY': {
            const strategy = parseCustomStrategy(rule.params?.strategy);
            if (!strategy) return null;
            const signals = customSignals(bars, strategy);
            const value = signals.entries[last] ? 1 : 0;
            return { value, previous: null, display: value };
        }
        case 'RSI_BELOW':
        case 'RSI_ABOVE': {
            const period = Math.round(Number(rule.params?.period ?? PARAM_BOUNDS.rsiPeriod.default));
            const line = rsi(bars.map((bar) => bar.close), period);
            const value = line[last];
            // A level rule needs no previous value, so it is not computed.
            return value == null ? null : { value, previous: null, display: value };
        }
        case 'PRICE_CROSS_UP_SMA':
        case 'PRICE_CROSS_DOWN_SMA': {
            const period = Math.round(Number(rule.targetPrice));
            const closes = bars.map((bar) => bar.close);
            const average = sma(closes, period);
            const value = average[last];
            if (value == null) return null;
            const previousAverage = last >= 1 ? average[last - 1] : null;
            return {
                value: closes[last] - value,
                previous: previousAverage == null ? null : closes[last - 1] - previousAverage,
                display: closes[last],
            };
        }
        case 'VOLUME_SPIKE': {
            const window = Math.round(Number(rule.params?.window ?? PARAM_BOUNDS.volumeWindow.default));
            if (last < window) return null; // the bar before it must exist for every bar in the window
            const before = bars.slice(last - window, last);
            const average = before.reduce((sum, bar) => sum + bar.volume, 0) / window;
            // A flat-zero stretch has no average to be a multiple of.
            if (!Number.isFinite(average) || average <= 0) return null;
            const multiple = bars[last].volume / average;
            if (!Number.isFinite(multiple)) return null;
            return { value: multiple, previous: null, display: multiple };
        }
        case 'ATR_ABOVE': {
            const period = Math.round(Number(rule.params?.period ?? PARAM_BOUNDS.atrPeriod.default));
            const close = Number(bars[last].close);
            // ATR over a zero close has no percentage to compare.
            if (!Number.isFinite(close) || close <= 0) return null;
            const value = atr(bars, period)[last];
            if (value == null || !Number.isFinite(value)) return null;
            const percent = (value / close) * 100;
            return { value: percent, previous: null, display: percent };
        }
        case 'CROSS_52W_HIGH':
        case 'CROSS_52W_LOW': {
            const lookback = Math.round(Number(rule.targetPrice));
            // The window is the bars *before* the one being judged, and a cross needs the bar before it too.
            if (last < lookback + 1) return null;
            const window = (index: number) => bars.slice(index - lookback, index).map((bar) => Number(bar.close));
            const current = window(last);
            const previousWindow = window(last - 1);
            if (current.some((c) => !Number.isFinite(c)) || previousWindow.some((c) => !Number.isFinite(c))) return null;
            const level = rule.condition === 'CROSS_52W_HIGH' ? Math.max(...current) : Math.min(...current);
            const previousLevel = rule.condition === 'CROSS_52W_HIGH' ? Math.max(...previousWindow) : Math.min(...previousWindow);
            return {
                value: Number(bars[last].close) - level,
                previous: Number(bars[last - 1].close) - previousLevel,
                display: Number(bars[last].close),
            };
        }
        default:
            return null;
    }
}

/** Whether the measure trips the rule. Level rules compare a value; cross rules need the turn. */
export function evaluateMeasure(rule: AlertRule, measure: Measure): boolean {
    const value = Number(measure.value);
    const target = Number(rule.targetPrice);
    if (!Number.isFinite(value)) return false;

    switch (rule.condition) {
        // A formula or a strategy is true when its newest value is a non-zero number.
        case 'FORMULA':
        case 'STRATEGY':
            return value !== 0;
        case 'RSI_BELOW':
            return Number.isFinite(target) && value <= target;
        case 'RSI_ABOVE':
        case 'VOLUME_SPIKE':
            return Number.isFinite(target) && value >= target;
        case 'PRICE_CROSS_UP_SMA': {
            const previous = measure.previous == null ? null : Number(measure.previous);
            return previous != null && Number.isFinite(previous) && previous < 0 && value >= 0;
        }
        case 'PRICE_CROSS_DOWN_SMA': {
            const previous = measure.previous == null ? null : Number(measure.previous);
            return previous != null && Number.isFinite(previous) && previous > 0 && value <= 0;
        }
        case 'ATR_ABOVE':
            return Number.isFinite(target) && value >= target;
        // A breakout means the close has gone *past* the old high or low, so merely touching it is not one.
        case 'CROSS_52W_HIGH': {
            const previous = measure.previous == null ? null : Number(measure.previous);
            return previous != null && Number.isFinite(previous) && previous <= 0 && value > 0;
        }
        case 'CROSS_52W_LOW': {
            const previous = measure.previous == null ? null : Number(measure.previous);
            return previous != null && Number.isFinite(previous) && previous >= 0 && value < 0;
        }
        default:
            return false;
    }
}

export type CheckPlan = {
    /** Rules that could be priced and evaluated. */
    checked: number;
    /** Rules whose quote or series never came back: skipped, and left exactly as they were. */
    skipped: number;
    /** Rules that fired, with the value the rule measured. */
    fires: {
        id: string;
        symbol: string;
        condition: AlertCondition;
        targetPrice: number;
        value: number;
        price?: number;
        changePercent?: number;
        /** Present for a drawing rule: the gap the next check would compare against. */
        gap?: number | null;
    }[];
    /** Rules that did not fire, with the value the next check must compare against. */
    misses: { id: string; value: number; gap?: number | null }[];
};

/** What one rule says on this check: it fired, it did not, or there was no data to judge it. */
type RuleOutcome =
    | { state: 'skip' }
    | { state: 'fire'; value: number; price?: number; changePercent?: number; gap?: number | null }
    | { state: 'miss'; value: number; gap?: number | null };

/**
 * One rule against the data this check fetched. A missing quote or a series too short to measure is
 * `skip`, never a zero: an alert must not fire, or reset, because a feed was late.
 */
function evaluateRuleRow(
    rule: CheckRuleRow,
    quotes: Record<string, AlertSnapshot>,
    series: Record<string, Candle[]>,
    at: number,
): RuleOutcome {
    if (needsCandles(rule.condition)) {
        const measure = measureRule(rule, series[rule.symbol]);
        if (!measure) return { state: 'skip' };
        return evaluateMeasure(rule, measure)
            ? { state: 'fire', value: measure.display }
            : { state: 'miss', value: measure.display };
    }

    const snapshot = quotes[rule.symbol];
    if (!snapshot || !Number.isFinite(snapshot.price) || snapshot.price <= 0) {
        return { state: 'skip' }; // no usable quote: the rule keeps its state and gets another day
    }

    const drawing = isDrawingCondition(rule.condition) && rule.anchor ? anchorGap(rule.anchor, snapshot.price, at) : undefined;
    const hit = evaluateAlert(
        {
            condition: rule.condition,
            targetPrice: rule.targetPrice,
            params: rule.params,
            lastPrice: rule.lastPrice ?? null,
            anchor: rule.anchor ?? null,
            lastGap: rule.lastGap ?? null,
            at,
        },
        snapshot,
    );
    if (hit) {
        return {
            state: 'fire',
            value: snapshot.price,
            price: snapshot.price,
            changePercent: snapshot.changePercent,
            ...(drawing === undefined ? {} : { gap: drawing }),
        };
    }
    return {
        state: 'miss',
        value: nextLastPrice(snapshot),
        ...(drawing === undefined ? {} : { gap: drawing }),
    };
}

/**
 * Decides what a check does, and nothing else: no IO, no dates, no database.
 *
 * Both checkers (the on-visit action and the Inngest cron) run this, so they cannot
 * disagree about which rule fired, which rule was skipped for want of a quote or a series,
 * or what the next cross compares against. Persisting the answer is each caller's own business.
 */
export function planCheck(
    rules: CheckRuleRow[],
    quotes: Record<string, AlertSnapshot>,
    series: Record<string, Candle[]> = {},
    at: number = Math.floor(Date.now() / 1000),
): CheckPlan {
    const plan: CheckPlan = { checked: 0, skipped: 0, fires: [], misses: [] };

    for (const rule of rules) {
        const outcome = evaluateRuleRow(rule, quotes, series, at);
        if (outcome.state === 'skip') {
            plan.skipped += 1;
            continue;
        }
        plan.checked += 1;
        if (outcome.state === 'fire') {
            plan.fires.push({
                id: rule.id,
                symbol: rule.symbol,
                condition: rule.condition,
                targetPrice: rule.targetPrice,
                value: outcome.value,
                ...(outcome.price === undefined ? {} : { price: outcome.price }),
                ...(outcome.changePercent === undefined ? {} : { changePercent: outcome.changePercent }),
                ...(outcome.gap === undefined ? {} : { gap: outcome.gap }),
            });
        } else {
            plan.misses.push({
                id: rule.id,
                value: outcome.value,
                ...(outcome.gap === undefined ? {} : { gap: outcome.gap }),
            });
        }
    }

    return plan;
}

// --- groups -----------------------------------------------------------------

export type GroupJoin = 'and' | 'or';

/** One rule as a group sees it: which alert it belongs to, and how its group is joined. */
export type GroupedRuleRow = CheckRuleRow & { groupId: string; join: GroupJoin };

export type GroupFire = {
    /** The alert that fired, not the rule: a group is one alert with one claim. */
    groupId: string;
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
    /** What the deciding rule measured. */
    value: number;
    price?: number;
    changePercent?: number;
    join: GroupJoin;
};

export type GroupPlan = {
    /** Alerts whose every rule could be judged. */
    checked: number;
    /** Alerts left alone because at least one rule had no data and the answer was still open. */
    skipped: number;
    /** Alerts that fired. */
    fires: GroupFire[];
    /** What the next check compares against, per rule (a fired group still keeps its rules' state). */
    updates: { id: string; value: number; gap?: number | null }[];
};

/**
 * A group of rules joined by AND or OR, evaluated the way a trader reads it:
 *
 * - AND is false as soon as one rule is false, and only skipped when every rule it could read was
 *   true but one had no data — the answer is still open, so nothing changes and it is retried.
 * - OR is true as soon as one rule is true, and only skipped when nothing was true and something
 *   could not be read.
 *
 * A skipped group is neither a fire nor a reset: its remembered values are left exactly as they are.
 */
export function planGroups(
    rows: GroupedRuleRow[],
    quotes: Record<string, AlertSnapshot>,
    series: Record<string, Candle[]> = {},
    at: number = Math.floor(Date.now() / 1000),
): GroupPlan {
    const plan: GroupPlan = { checked: 0, skipped: 0, fires: [], updates: [] };
    const groups = new Map<string, GroupedRuleRow[]>();
    for (const row of rows) {
        const list = groups.get(row.groupId);
        if (list) list.push(row);
        else groups.set(row.groupId, [row]);
    }

    for (const [groupId, list] of groups) {
        const outcomes = list.map((row) => ({ row, outcome: evaluateRuleRow(row, quotes, series, at) }));
        const join = list[0].join ?? 'and';
        const fired = outcomes.filter((entry) => entry.outcome.state === 'fire');
        const missed = outcomes.filter((entry) => entry.outcome.state === 'miss');
        const unreadable = outcomes.filter((entry) => entry.outcome.state === 'skip');

        // AND is false the moment one rule is false; only an unanswered rule can keep it open.
        // OR is true the moment one rule is true; only an unanswered rule with nothing true is open.
        const isFire = join === 'and' ? missed.length === 0 && unreadable.length === 0 : fired.length > 0;
        const isSkip = join === 'and'
            ? missed.length === 0 && unreadable.length > 0
            : fired.length === 0 && unreadable.length > 0;

        for (const entry of outcomes) {
            if (entry.outcome.state === 'skip') continue;
            plan.updates.push({
                id: entry.row.id,
                value: entry.outcome.value,
                ...(entry.outcome.gap === undefined ? {} : { gap: entry.outcome.gap }),
            });
        }

        if (isFire) {
            plan.checked += 1;
            const deciding = (join === 'or' ? fired[0] : fired[fired.length - 1]).outcome as Extract<RuleOutcome, { state: 'fire' }>;
            const row = (join === 'or' ? fired[0] : fired[fired.length - 1]).row;
            plan.fires.push({
                groupId,
                symbol: row.symbol,
                condition: row.condition,
                targetPrice: row.targetPrice,
                value: deciding.value,
                ...(deciding.price === undefined ? {} : { price: deciding.price }),
                ...(deciding.changePercent === undefined ? {} : { changePercent: deciding.changePercent }),
                join,
            });
            continue;
        }

        if (isSkip) {
            plan.skipped += 1;
            continue;
        }

        plan.checked += 1;
    }

    return plan;
}

// --- stored alerts -> rows ---------------------------------------------------

/** One rule as stored inside an alert document. */
export type StoredAlertRule = {
    condition: AlertCondition;
    targetPrice: number;
    params?: AlertParams;
    /** What this rule saw last time. The first rule mirrors the document's `lastPrice`. */
    lastValue?: number | null;
    lastGap?: number | null;
};

/** The fields both the alert document and the cron row carry. */
export type StoredAlertLike = {
    id: string;
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
    params?: AlertParams;
    lastPrice?: number | null;
    anchor?: DrawingAnchor | null;
    lastGap?: number | null;
    rules?: StoredAlertRule[];
    join?: GroupJoin;
};

export type GroupedRows = {
    rows: GroupedRuleRow[];
    /** Where each row came from, so a remembered value can be written back to the right slot. */
    owners: Map<string, { alertId: string; index: number }>;
};

/**
 * Turns stored alerts into the rows `planGroups` reads. An alert written before groups existed has
 * no `rules`, so its condition, target and remembered value become a group of one — the same
 * behaviour it had, with no migration.
 */
export function groupedRowsFromAlerts(alerts: StoredAlertLike[]): GroupedRows {
    const rows: GroupedRuleRow[] = [];
    const owners = new Map<string, { alertId: string; index: number }>();
    for (const alert of alerts) {
        const specs: StoredAlertRule[] = alert.rules?.length
            ? alert.rules
            : [{ condition: alert.condition, targetPrice: alert.targetPrice, params: alert.params, lastValue: alert.lastPrice }];
        const join: GroupJoin = alert.join === 'or' ? 'or' : 'and';
        specs.forEach((spec, index) => {
            const id = `${alert.id}:${index}`;
            owners.set(id, { alertId: alert.id, index });
            rows.push({
                id,
                groupId: alert.id,
                join,
                symbol: alert.symbol,
                condition: spec.condition,
                targetPrice: spec.targetPrice,
                params: spec.params ?? {},
                lastPrice: spec.lastValue ?? (index === 0 ? alert.lastPrice ?? null : null),
                // A drawing belongs to the alert's first rule: that is the one an anchor was made for.
                anchor: index === 0 ? alert.anchor ?? null : null,
                lastGap: spec.lastGap ?? (index === 0 ? alert.lastGap ?? null : null),
            });
        });
    }
    return { rows, owners };
}

/**
 * Where one rule's remembered value is written back. The first rule also mirrors the document's
 * own `lastPrice`/`lastGap`, so an older reader (and the cross rules' own top-level fields) still
 * sees the value it expects.
 */
export function rememberUpdate(owner: { alertId: string; index: number }, value: number, gap?: number | null): Record<string, unknown> {
    const set: Record<string, unknown> = { [`rules.${owner.index}.lastValue`]: value };
    if (gap !== undefined) set[`rules.${owner.index}.lastGap`] = gap;
    if (owner.index === 0) {
        set.lastPrice = value;
        if (gap !== undefined) set.lastGap = gap;
    }
    return set;
}

/** How many rules an alert carries (an alert written before groups has exactly one). */
export const groupedRuleCount = (alert: { rules?: unknown[] }): number =>
    Array.isArray(alert.rules) && alert.rules.length > 0 ? alert.rules.length : 1;

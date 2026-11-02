// Alert rules, their price source and their arithmetic: pure functions only, no IO.
// The on-visit checker and the Inngest cron both run this file, so the demo and Cloud can
// never disagree about whether an alert fired.

import { hasFinnhubQuotes } from '@/lib/markets';
import { normalizeYahooSymbol } from '@/lib/yahoo';
import { rsi, sma } from '@/lib/indicators';
import type { Candle } from '@/lib/yahoo-candles';

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
    | 'VOLUME_SPIKE';

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
];

export const isAlertCondition = (value: unknown): value is AlertCondition =>
    typeof value === 'string' && (ALERT_CONDITIONS as readonly string[]).includes(value);

/** `CHANGE_*` targets are percentages; every other target is a price. */
export const isPercentCondition = (condition: AlertCondition): boolean =>
    condition === 'CHANGE_UP' || condition === 'CHANGE_DOWN';

/** The second number some rules carry; the first is always `targetPrice`. */
export type AlertParams = { period?: number; window?: number };

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
} as const;

/** The rules that read a series instead of a quote: the checker's one routing rule. */
const SERIES_CONDITIONS: readonly AlertCondition[] = [
    'RSI_BELOW',
    'RSI_ABOVE',
    'PRICE_CROSS_UP_SMA',
    'PRICE_CROSS_DOWN_SMA',
    'VOLUME_SPIKE',
];

export const needsCandles = (condition: AlertCondition): boolean => SERIES_CONDITIONS.includes(condition);

const within = (value: number, range: { min: number; max: number }): boolean =>
    Number.isFinite(value) && value >= range.min && value <= range.max;

/** Fills the second number a rule needs, so a stored rule is never half-specified. */
export function normalizeAlertParams(condition: AlertCondition, params?: AlertParams): AlertParams {
    if (condition === 'RSI_BELOW' || condition === 'RSI_ABOVE') {
        return { period: Math.round(Number(params?.period ?? PARAM_BOUNDS.rsiPeriod.default)) };
    }
    if (condition === 'VOLUME_SPIKE') {
        return { window: Math.round(Number(params?.window ?? PARAM_BOUNDS.volumeWindow.default)) };
    }
    return {};
}

/** Whether the second number is inside its range. Absent is fine: the default applies. */
export function validateAlertParams(condition: AlertCondition, params?: AlertParams): boolean {
    if (condition === 'RSI_BELOW' || condition === 'RSI_ABOVE') {
        return params?.period == null || within(Number(params.period), PARAM_BOUNDS.rsiPeriod);
    }
    if (condition === 'VOLUME_SPIKE') {
        return params?.window == null || within(Number(params.window), PARAM_BOUNDS.volumeWindow);
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
    /** The price at the previous check, used only by the cross conditions. */
    lastPrice?: number | null;
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
    const target = Number(rule.targetPrice);
    if (!Number.isFinite(price) || !Number.isFinite(target) || price <= 0) return false;
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
    if (!Number.isFinite(target) || target <= 0) return false;
    if (isPercentCondition(condition)) return target <= 100;
    if (condition === 'RSI_BELOW' || condition === 'RSI_ABOVE') return within(target, PARAM_BOUNDS.rsiLevel);
    if (condition === 'VOLUME_SPIKE') return within(target, PARAM_BOUNDS.volumeMultiple);
    if (condition === 'PRICE_CROSS_UP_SMA' || condition === 'PRICE_CROSS_DOWN_SMA') return within(target, PARAM_BOUNDS.smaPeriod);
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
    fires: { id: string; symbol: string; condition: AlertCondition; targetPrice: number; value: number; price?: number; changePercent?: number }[];
    /** Rules that did not fire, with the value the next check must compare against. */
    misses: { id: string; value: number }[];
};

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
): CheckPlan {
    const plan: CheckPlan = { checked: 0, skipped: 0, fires: [], misses: [] };

    for (const rule of rules) {
        if (needsCandles(rule.condition)) {
            const measure = measureRule(rule, series[rule.symbol]);
            if (!measure) {
                plan.skipped += 1;
                continue;
            }
            plan.checked += 1;
            if (evaluateMeasure(rule, measure)) {
                plan.fires.push({
                    id: rule.id,
                    symbol: rule.symbol,
                    condition: rule.condition,
                    targetPrice: rule.targetPrice,
                    value: measure.display,
                });
            } else {
                plan.misses.push({ id: rule.id, value: measure.display });
            }
            continue;
        }

        const snapshot = quotes[rule.symbol];
        if (!snapshot || !Number.isFinite(snapshot.price) || snapshot.price <= 0) {
            plan.skipped += 1; // no usable quote: the rule keeps its state and gets another day
            continue;
        }
        plan.checked += 1;

        const hit = evaluateAlert(
            { condition: rule.condition, targetPrice: rule.targetPrice, lastPrice: rule.lastPrice ?? null },
            snapshot,
        );
        if (hit) {
            plan.fires.push({
                id: rule.id,
                symbol: rule.symbol,
                condition: rule.condition,
                targetPrice: rule.targetPrice,
                value: snapshot.price,
                price: snapshot.price,
                changePercent: snapshot.changePercent,
            });
        } else {
            plan.misses.push({ id: rule.id, value: nextLastPrice(snapshot) });
        }
    }

    return plan;
}

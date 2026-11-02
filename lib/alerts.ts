// Alert rules, their price source and their arithmetic: pure functions only, no IO.
// The on-visit checker and the Inngest cron both run this file, so the demo and Cloud can
// never disagree about whether an alert fired.

import { hasFinnhubQuotes } from '@/lib/markets';
import { normalizeYahooSymbol } from '@/lib/yahoo';

export type AlertCondition = 'ABOVE' | 'BELOW' | 'CROSS_UP' | 'CROSS_DOWN' | 'CHANGE_UP' | 'CHANGE_DOWN';

export const ALERT_CONDITIONS: readonly AlertCondition[] = [
    'ABOVE',
    'BELOW',
    'CROSS_UP',
    'CROSS_DOWN',
    'CHANGE_UP',
    'CHANGE_DOWN',
];

export const isAlertCondition = (value: unknown): value is AlertCondition =>
    typeof value === 'string' && (ALERT_CONDITIONS as readonly string[]).includes(value);

/** `CHANGE_*` targets are percentages; every other target is a price. */
export const isPercentCondition = (condition: AlertCondition): boolean =>
    condition === 'CHANGE_UP' || condition === 'CHANGE_DOWN';

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

/** The target a rule can actually use: positive, and a sane percent for the change rules. */
export function validateAlertTarget(condition: AlertCondition, target: number): boolean {
    if (!Number.isFinite(target) || target <= 0) return false;
    if (isPercentCondition(condition)) return target <= 100;
    return true;
}

/** One stored rule, as a checker sees it: an id, its symbol and what the last check saw. */
export type CheckRuleRow = {
    id: string;
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
    lastPrice?: number | null;
};

export type CheckPlan = {
    /** Rules that could be priced and evaluated. */
    checked: number;
    /** Rules whose quote never came back: skipped, and left exactly as they were. */
    skipped: number;
    /** Rules that fired, with the price that fired them. */
    fires: { id: string; symbol: string; condition: AlertCondition; targetPrice: number; price: number; changePercent: number }[];
    /** Rules that did not fire, with the price the next check must compare against. */
    misses: { id: string; lastPrice: number }[];
};

/**
 * Decides what a check does, and nothing else: no IO, no dates, no database.
 *
 * Both checkers (the on-visit action and the Inngest cron) run this, so they cannot
 * disagree about which rule fired, which rule was skipped for want of a quote, or what
 * the next cross compares against. Persisting the answer is each caller's own business.
 */
export function planCheck(rules: CheckRuleRow[], quotes: Record<string, AlertSnapshot>): CheckPlan {
    const plan: CheckPlan = { checked: 0, skipped: 0, fires: [], misses: [] };

    for (const rule of rules) {
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
                price: snapshot.price,
                changePercent: snapshot.changePercent,
            });
        } else {
            plan.misses.push({ id: rule.id, lastPrice: nextLastPrice(snapshot) });
        }
    }

    return plan;
}

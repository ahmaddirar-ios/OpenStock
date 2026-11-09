'use server';

import { connectToDatabase } from '@/database/mongoose';
import { anchorPriceAt, isDrawingCondition, parseAnchor } from '@/lib/chart/drawing-alert';
import { Alert } from '@/database/models/alert.model';
import { AlertEvent } from '@/database/models/alert-event.model';
import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/lib/better-auth/auth';
import { getLiveQuotes } from '@/lib/actions/finnhub.actions';
import { getYahooDailyQuotes } from '@/lib/actions/yahoo.actions';
import { getAlertCandles } from '@/lib/actions/yahoo-candles.actions';
import { compareYahooSymbol } from '@/lib/compare';
import type { Candle } from '@/lib/market/yahoo-candles';
import {
    alertSource,
    alertStoredSymbol,
    alertYahooSymbol,
    isAlertCondition,
    groupedRowsFromAlerts,
    needsCandles,
    normalizeAlertParams,
    planGroups,
    groupedRuleCount,
    rememberUpdate,
    validateAlertParams,
    validateAlertTarget,
    type AlertCondition,
    type AlertParams,
    MAX_ALERT_RULES,
    MAX_ALERT_EVENTS,
    type AlertSnapshot,
    type GroupJoin,
    type StoredAlertRule,
} from '@/lib/alerts';

// The checker re-prices every active alert's symbol on each visit and every five minutes in Cloud.
const MAX_ACTIVE_ALERTS = 50;


/** One rule in an alert's set, as the caller supplies it. */
export type AlertRuleInput = {
    condition: AlertCondition;
    targetPrice: number;
    params?: AlertParams;
};

export type AlertInput = {
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
    /** The second number a rule needs: an RSI period or a volume window. */
    params?: AlertParams;
    /**
     * A drawing the rule is attached to. Its geometry is snapshotted here rather than referenced
     * later, so editing the drawing afterwards does not silently change what was promised.
     */
    anchor?: unknown;
    /** Extra rules the first one is combined with. Empty means a group of one. */
    rules?: AlertRuleInput[];
    /** How the rules combine: all of them (default) or any of them. */
    join?: GroupJoin;
};

export type FiredAlert = {
    id: string;
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
    /** What the rule measured: a price, an RSI, a close, or a volume multiple. */
    value: number;
    price?: number;
    changePercent?: number;
    /** How the alert's rules were joined (a single rule is `and`). */
    join?: GroupJoin;
    /** How many rules the alert had. */
    rules?: number;
    /** The rules that were joined, so a toast can name the one that tripped. */
    ruleList?: { condition: AlertCondition; targetPrice: number; value: number }[];
};

export type CheckResult = {
    /** Rules the checker could evaluate (a symbol whose quote failed is not counted). */
    checked: number;
    /** Rules it could not price at all; they kept their state and must be reported, not hidden. */
    skipped: number;
    /** Rules that fired on this check. */
    fired: FiredAlert[];
    /** Price per symbol, so the centre can show what it just saw. */
    quotes: Record<string, AlertSnapshot>;
};

/** A user-visible reason, thrown as the message so the caller can translate it. */
function fail(code: string): never {
    throw new Error(code);
}

/** Checks one rule and returns exactly what gets stored. Throws codes the UI already translates. */
function normalizeRule(input: AlertRuleInput, options: { allowDrawing: boolean }): StoredAlertRule {
    const condition = input.condition;
    if (!isAlertCondition(condition)) fail('invalidCondition');
    // A drawing is the alert's own first rule: it carries an anchor the other rules have no slot for.
    if (!options.allowDrawing && isDrawingCondition(condition)) fail('invalidAnchor');

    const params = normalizeAlertParams(condition, input.params);
    if (!validateAlertParams(condition, params)) fail('invalidTarget');

    // A formula or a strategy has no number to type, so it stores a zero rather than a NaN.
    const targetPrice = condition === 'FORMULA' || condition === 'STRATEGY' ? 0 : Number(input.targetPrice);
    if (!validateAlertTarget(condition, targetPrice)) fail('invalidTarget');

    return { condition, targetPrice, params };
}

/**
 * Creates an alert. On the public demo alerts are checked when the centre is opened; in
 * Cloud the same rows are also checked by the five-minute cron and mailed out.
 *
 * An alert is one or more rules joined by AND/OR. The first rule mirrors the document's own
 * `condition`/`targetPrice`/`params`, so a single-rule alert stays exactly what it was before
 * groups existed.
 */
export async function createAlert(params: AlertInput) {
    const userId = await requireUserId();

    const symbol = alertStoredSymbol(params.symbol);
    if (!symbol || !alertSource(symbol)) fail('unsupportedSymbol');

    const condition = params.condition;
    if (!isAlertCondition(condition)) fail('invalidCondition');

    // A drawing rule carries the line's own price as its target: the trader does not type one.
    const anchor = isDrawingCondition(condition) ? parseAnchor(params.anchor) : null;
    if (isDrawingCondition(condition) && !anchor) fail('invalidAnchor');
    const lineNow = anchor ? anchorPriceAt(anchor, Math.floor(Date.now() / 1000)) : null;
    const baseTarget = lineNow != null && Number.isFinite(lineNow) ? lineNow : Number(params.targetPrice);

    const extras = Array.isArray(params.rules) ? params.rules : [];
    if (extras.length > MAX_ALERT_RULES - 1) fail('tooManyRules');

    const rules = [
        normalizeRule({ condition, targetPrice: baseTarget, params: params.params }, { allowDrawing: true }),
        ...extras.map((rule) => normalizeRule(rule, { allowDrawing: false })),
    ];

    // Every series rule needs a candle source as well as a quote source: every US ticker and
    // Tadawul listing has one, a Binance pair does not.
    if (rules.some((rule) => needsCandles(rule.condition)) && !compareYahooSymbol(symbol)) fail('unsupportedSymbol');

    const join: GroupJoin = params.join === 'or' ? 'or' : 'and';

    await connectToDatabase();
    if ((await Alert.countDocuments({ userId, active: true })) >= MAX_ACTIVE_ALERTS) fail('limit');

    try {
        // lastPrice starts empty: a cross rule cannot fire until two checks have been seen.
        const alert = await Alert.create({
            userId,
            symbol,
            targetPrice: rules[0].targetPrice,
            condition: rules[0].condition,
            params: rules[0].params,
            rules,
            join,
            active: true,
            ...(anchor ? { anchor } : {}),
        });
        revalidatePath('/alerts');
        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(alert));
    } catch (error) {
        console.error('Error creating alert:', error);
        fail('failed');
    }
}

/** Edits a rule. Changing what it watches clears the remembered value, so a stale cross cannot fire. */
export async function updateAlert(
    alertId: string,
    patch: { targetPrice?: number; condition?: AlertCondition; active?: boolean; params?: AlertParams },
) {
    const userId = await requireUserId();
    await connectToDatabase();

    const existing = await Alert.findOne({ _id: alertId, userId });
    if (!existing) throw new Error('notFound');

    const condition = patch.condition ?? (existing.condition as AlertCondition);
    if (!isAlertCondition(condition)) fail('invalidCondition');

    const targetPrice = patch.targetPrice == null ? existing.targetPrice : Number(patch.targetPrice);
    if (!validateAlertTarget(condition, targetPrice)) fail('invalidTarget');

    const ruleParams = patch.params == null
        ? normalizeAlertParams(condition, (existing.params ?? {}) as AlertParams)
        : normalizeAlertParams(condition, patch.params);
    if (!validateAlertParams(condition, ruleParams)) fail('invalidTarget');

    const update: Record<string, unknown> = { condition, targetPrice, params: ruleParams };
    if (typeof patch.active === 'boolean') update.active = patch.active;

    // Changing what the rule watches invalidates the remembered value; pausing and resuming must
    // not, or a cross rule would need two more checks after every pause.
    const ruleChanged = condition !== existing.condition
        || ruleParams.period !== ((existing.params ?? {}) as AlertParams).period
        || ruleParams.window !== ((existing.params ?? {}) as AlertParams).window;
    if (ruleChanged) update.lastPrice = null;

    // Reactivating a fired rule means "watch again", so clear the firing exactly as the
    // re-arm button does (the same rule reachable from an API caller).
    if (patch.active === true && existing.triggered) {
        update.triggered = false;
        update.triggeredAt = null;
        update.triggeredPrice = null;
        update.seen = false;
        update.lastPrice = null;
    }

    const saved = await Alert.findOneAndUpdate({ _id: alertId, userId }, update, { new: true });
    revalidatePath('/alerts');
    revalidatePath('/watchlist');
    return JSON.parse(JSON.stringify(saved));
}

/** Puts a fired rule back to watching, from the next check onwards. */
export async function rearmAlert(alertId: string) {
    const userId = await requireUserId();
    await connectToDatabase();
    const saved = await Alert.findOneAndUpdate(
        { _id: alertId, userId },
        { triggered: false, triggeredAt: null, triggeredPrice: null, seen: false, lastPrice: null, active: true },
        { new: true },
    );
    if (!saved) throw new Error('notFound');
    revalidatePath('/alerts');
    return JSON.parse(JSON.stringify(saved));
}

export async function deleteAlert(alertId: string) {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        await Alert.findOneAndDelete({ _id: alertId, userId });
        revalidatePath('/alerts');
        revalidatePath('/watchlist');
        return { success: true };
    } catch (error) {
        console.error('Error deleting alert:', error);
        fail('failed');
    }
}

/** Marks every fired alert the user has not seen as seen. */
export async function markAlertsSeen() {
    const userId = await requireUserId();
    await connectToDatabase();
    await Alert.updateMany({ userId, seen: false, triggered: true }, { seen: true });
    revalidatePath('/alerts');
    return { success: true };
}

export async function getUserAlerts() {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        const alerts = await Alert.find({ userId }).sort({ createdAt: -1 }).lean();
        return JSON.parse(JSON.stringify(alerts));
    } catch (error) {
        console.error('Error fetching alerts:', error);
        return [];
    }
}

/** Prices a symbol through the source `alertSource()` chose for it. */
async function priceSymbols(symbols: string[]): Promise<Record<string, AlertSnapshot>> {
    const yahoo = symbols.filter((symbol) => alertSource(symbol) === 'yahoo');
    const finnhub = symbols.filter((symbol) => alertSource(symbol) === 'finnhub');

    const [yahooQuotes, finnhubQuotes] = await Promise.all([
        yahoo.length > 0
            ? getYahooDailyQuotes(yahoo.map((symbol) => alertYahooSymbol(symbol) ?? symbol))
            : Promise.resolve({} as Record<string, { price: number; changePercent: number }>),
        finnhub.length > 0 ? getLiveQuotes(finnhub) : Promise.resolve({} as Record<string, { c?: number; dp?: number } | null>),
    ]);

    const snapshots: Record<string, AlertSnapshot> = {};
    for (const symbol of yahoo) {
        // The Yahoo action keys its answer by the symbol it was handed, which is the `.SR` form.
        const quote = yahooQuotes[alertYahooSymbol(symbol) ?? symbol];
        if (quote && Number.isFinite(quote.price)) snapshots[symbol] = { price: quote.price, changePercent: quote.changePercent };
    }
    for (const symbol of finnhub) {
        const quote = finnhubQuotes[symbol];
        if (quote && Number.isFinite(quote.c)) snapshots[symbol] = { price: quote.c as number, changePercent: Number(quote.dp ?? 0) };
    }
    return snapshots;
}

/** The daily series for every symbol whose rules measure one, one call per symbol. */
async function candleSeries(symbols: string[]): Promise<Record<string, Candle[]>> {
    const sets = await Promise.all(
        symbols.map(async (symbol) => {
            const set = await getAlertCandles(symbol);
            return set?.candles?.length ? ([symbol, set.candles] as const) : null;
        }),
    );
    return Object.fromEntries(sets.filter((entry): entry is readonly [string, Candle[]] => entry !== null));
}

/**
 * The on-visit check. Every live rule is priced once and handed to `planGroups`, the same
 * decision the Inngest cron runs; the groups it says fired are claimed atomically so two
 * tabs cannot both report one. Quotes that fail to load are skipped, never read as zero.
 */
export async function checkAlerts(): Promise<CheckResult> {
    const userId = await requireUserId();
    await connectToDatabase();

    const now = new Date();
    const alerts = await Alert.find({ userId, active: true, triggered: false, expiresAt: { $gt: now } }).lean();
    if (alerts.length === 0) return { checked: 0, skipped: 0, fired: [], quotes: {} };

    // Pay only for what the live rules read: a quote for the price rules, a daily series for the
    // indicator rules. One call per symbol either way.
    const { rows, owners } = groupedRowsFromAlerts(
        alerts.map((alert) => ({
            id: String(alert._id),
            symbol: alert.symbol,
            condition: alert.condition as AlertCondition,
            targetPrice: alert.targetPrice,
            params: (alert.params ?? {}) as AlertParams,
            lastPrice: alert.lastPrice ?? null,
            anchor: parseAnchor(alert.anchor),
            lastGap: alert.lastGap ?? null,
            rules: (alert.rules ?? []) as StoredAlertRule[],
            join: alert.join as GroupJoin,
        })),
    );
    const quoted = [...new Set(rows.filter((rule) => !needsCandles(rule.condition)).map((rule) => rule.symbol))];
    const measured = [...new Set(rows.filter((rule) => needsCandles(rule.condition)).map((rule) => rule.symbol))];

    const [quotes, series] = await Promise.all([priceSymbols(quoted), candleSeries(measured)]);
    const plan = planGroups(rows, quotes, series);

    // Remember what each rule saw on this check, so a cross has a previous value next time.
    await Promise.all(
        plan.updates.map(({ id, value, gap }) => {
            const owner = owners.get(id);
            if (!owner) return Promise.resolve(null);
            return Alert.updateOne({ _id: owner.alertId, triggered: false }, { $set: rememberUpdate(owner, value, gap) });
        }),
    );

    const counts = new Map(alerts.map((alert) => [String(alert._id), groupedRuleCount(alert)]));
    const fired: FiredAlert[] = [];
    await Promise.all(
        plan.fires.map(async (fire) => {
            const claimed = await Alert.findOneAndUpdate(
                { _id: fire.groupId, triggered: false, active: true },
                {
                    $set: {
                        triggered: true,
                        // A fired rule is finished watching, exactly as the cron leaves it:
                        // it stops counting toward the active-alert cap until it is re-armed.
                        active: false,
                        triggeredAt: new Date(),
                        triggeredPrice: fire.value,
                        lastPrice: fire.price ?? fire.value,
                        seen: false,
                    },
                },
                { new: true },
            );
            if (!claimed) return;

            const rules = counts.get(fire.groupId) ?? 1;
            fired.push({
                id: fire.groupId,
                symbol: fire.symbol,
                condition: fire.condition,
                targetPrice: fire.targetPrice,
                value: fire.value,
                price: fire.price,
                changePercent: fire.changePercent,
                join: fire.join,
                rules,
                ruleList: fire.rules.length > 0 ? fire.rules : undefined,
            });

            // The log outlives the alert: it is the record of what happened, not of what is watched.
            try {
                await AlertEvent.create({
                    userId,
                    alertId: fire.groupId,
                    symbol: fire.symbol,
                    condition: fire.condition,
                    targetPrice: fire.targetPrice,
                    value: fire.value,
                    price: fire.price ?? null,
                    changePercent: fire.changePercent ?? null,
                    join: fire.join,
                    rules,
                });
            } catch (error) {
                console.error('Error writing alert event:', error);
            }
        }),
    );

    revalidatePath('/alerts');
    return { checked: plan.checked, skipped: plan.skipped, fired, quotes };
}

/** The alert log for one user, newest first, trimmed to the newest `MAX_ALERT_EVENTS`. */
export async function getAlertLog(limit = 50) {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        const take = Math.min(Math.max(1, Math.floor(limit)), MAX_ALERT_EVENTS);
        const events = await AlertEvent.find({ userId }).sort({ at: -1 }).limit(take).lean();
        return JSON.parse(JSON.stringify(events));
    } catch (error) {
        console.error('Error fetching alert log:', error);
        return [];
    }
}

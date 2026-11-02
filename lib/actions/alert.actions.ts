'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Alert } from '@/database/models/alert.model';
import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/lib/better-auth/auth';
import { getLiveQuotes } from '@/lib/actions/finnhub.actions';
import { getYahooDailyQuotes } from '@/lib/actions/yahoo.actions';
import {
    alertSource,
    alertStoredSymbol,
    alertYahooSymbol,
    evaluateAlert,
    isAlertCondition,
    nextLastPrice,
    validateAlertTarget,
    type AlertCondition,
    type AlertSnapshot,
} from '@/lib/alerts';

// The checker re-prices every active alert's symbol on each visit and every five minutes in Cloud.
const MAX_ACTIVE_ALERTS = 50;

export type AlertInput = {
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
};

export type FiredAlert = {
    id: string;
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
    price: number;
    changePercent: number;
};

export type CheckResult = {
    /** Rules the checker could evaluate (a symbol whose quote failed is not counted). */
    checked: number;
    /** Rules that fired on this check. */
    fired: FiredAlert[];
    /** Price per symbol, so the centre can show what it just saw. */
    quotes: Record<string, AlertSnapshot>;
};

/** A user-visible reason, thrown as the message so the caller can translate it. */
const fail = (code: string): never => {
    throw new Error(code);
};

/**
 * Creates an alert. On the public demo alerts are checked when the centre is opened; in
 * Cloud the same rows are also checked by the five-minute cron and mailed out.
 */
export async function createAlert(params: AlertInput) {
    const userId = await requireUserId();

    const symbol = alertStoredSymbol(params.symbol);
    if (!symbol || !alertSource(symbol)) fail('unsupportedSymbol');

    const condition = params.condition;
    if (!isAlertCondition(condition)) fail('invalidCondition');

    const targetPrice = Number(params.targetPrice);
    if (!validateAlertTarget(condition, targetPrice)) fail('invalidTarget');

    await connectToDatabase();
    if ((await Alert.countDocuments({ userId, active: true })) >= MAX_ACTIVE_ALERTS) fail('limit');

    try {
        // lastPrice starts empty: a cross rule cannot fire until two checks have been seen.
        const alert = await Alert.create({ userId, symbol, targetPrice, condition, active: true });
        revalidatePath('/alerts');
        revalidatePath('/watchlist');
        return JSON.parse(JSON.stringify(alert));
    } catch (error) {
        console.error('Error creating alert:', error);
        fail('failed');
    }
}

/** Edits a rule. Changing the condition clears the remembered price, so a stale cross cannot fire. */
export async function updateAlert(
    alertId: string,
    patch: { targetPrice?: number; condition?: AlertCondition; active?: boolean },
) {
    const userId = await requireUserId();
    await connectToDatabase();

    const existing = await Alert.findOne({ _id: alertId, userId });
    if (!existing) throw new Error('notFound');

    const condition = patch.condition ?? (existing.condition as AlertCondition);
    if (!isAlertCondition(condition)) fail('invalidCondition');

    const targetPrice = patch.targetPrice == null ? existing.targetPrice : Number(patch.targetPrice);
    if (!validateAlertTarget(condition, targetPrice)) fail('invalidTarget');

    const reset = condition !== existing.condition || patch.active === true;
    const update: Record<string, unknown> = { condition, targetPrice };
    if (typeof patch.active === 'boolean') update.active = patch.active;
    if (reset) {
        update.lastPrice = null;
        // Re-activating a fired rule re-arms it; the trader asked for it to watch again.
        if (patch.active === true && existing.triggered) {
            update.triggered = false;
            update.triggeredAt = null;
            update.triggeredPrice = null;
            update.seen = false;
        }
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

/**
 * The on-visit check. Every live rule is priced once, evaluated with the same engine the
 * cron uses, and the ones that fire are claimed atomically so two tabs cannot both report
 * the same firing. Quotes that fail to load are skipped, never read as zero.
 */
export async function checkAlerts(): Promise<CheckResult> {
    const userId = await requireUserId();
    await connectToDatabase();

    const now = new Date();
    const alerts = await Alert.find({ userId, active: true, triggered: false, expiresAt: { $gt: now } }).lean();
    if (alerts.length === 0) return { checked: 0, fired: [], quotes: {} };

    const symbols = [...new Set(alerts.map((alert) => alert.symbol))];
    const quotes = await priceSymbols(symbols);

    const fired: FiredAlert[] = [];
    let checked = 0;

    await Promise.all(
        alerts.map(async (alert) => {
            const snapshot = quotes[alert.symbol];
            if (!snapshot) return; // no quote: skip, leave the rule exactly as it was
            checked += 1;

            const rule = {
                condition: alert.condition as AlertCondition,
                targetPrice: alert.targetPrice,
                lastPrice: alert.lastPrice ?? null,
            };
            const hit = evaluateAlert(rule, snapshot);

            if (hit) {
                const claimed = await Alert.findOneAndUpdate(
                    { _id: alert._id, triggered: false, active: true },
                    {
                        $set: {
                            triggered: true,
                            triggeredAt: new Date(),
                            triggeredPrice: snapshot.price,
                            lastPrice: snapshot.price,
                            seen: false,
                        },
                    },
                    { new: true },
                );
                if (claimed) {
                    fired.push({
                        id: String(alert._id),
                        symbol: alert.symbol,
                        condition: rule.condition,
                        targetPrice: alert.targetPrice,
                        price: snapshot.price,
                        changePercent: snapshot.changePercent,
                    });
                }
                return;
            }

            await Alert.updateOne(
                { _id: alert._id, triggered: false },
                { $set: { lastPrice: nextLastPrice(snapshot) } },
            );
        }),
    );

    revalidatePath('/alerts');
    return { checked: Number(checked), fired, quotes };
}

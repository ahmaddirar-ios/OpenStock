// Portfolio arithmetic. Pure and IO-free: the page, the table and the server actions all
// feed this the same shape, so a number the user sees is a number that was tested here.

export type PositionMetrics = {
    /** What the position cost: quantity × average cost. */
    costBasis: number;
    /** What it is worth now; 0 when the price is unknown. */
    marketValue: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
    /** Today's move over the held quantity, not the whole share. */
    dayChangeValue: number;
    /** False when no usable price arrived, so the UI shows a dash instead of a fake loss. */
    priced: boolean;
};

export type PortfolioTotals = {
    costBasis: number;
    marketValue: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
    dayChangeValue: number;
    /** Every row, priced or not. */
    positions: number;
    /** Rows that carried a price and therefore counted towards the totals. */
    priced: number;
};

/** Rounding to cents keeps floating-point noise out of the totals. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

export function computePositionMetrics(input: {
    quantity: number;
    averageCost: number;
    price: number;
    change?: number;
}): PositionMetrics {
    const quantity = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 0;
    const averageCost = Number.isFinite(input.averageCost) && input.averageCost > 0 ? input.averageCost : 0;
    const price = Number.isFinite(input.price) && input.price > 0 ? input.price : 0;
    const change = Number.isFinite(input.change) ? (input.change as number) : 0;

    const costBasis = round2(quantity * averageCost);
    const priced = price > 0 && quantity > 0;
    const marketValue = priced ? round2(quantity * price) : 0;
    const unrealizedPnl = priced ? round2(marketValue - costBasis) : 0;
    // A zero cost basis has no meaningful percentage; report 0 rather than divide by zero.
    const unrealizedPnlPercent = priced && costBasis > 0 ? round2((unrealizedPnl / costBasis) * 100) : 0;
    const dayChangeValue = priced ? round2(quantity * change) : 0;

    return { costBasis, marketValue, unrealizedPnl, unrealizedPnlPercent, dayChangeValue, priced };
}

export function summarizePortfolio(metrics: PositionMetrics[]): PortfolioTotals {
    let costBasis = 0;
    let marketValue = 0;
    let unrealizedPnl = 0;
    let dayChangeValue = 0;
    let priced = 0;

    for (const m of metrics) {
        costBasis += m.costBasis;
        if (!m.priced) continue;
        priced += 1;
        marketValue += m.marketValue;
        unrealizedPnl += m.unrealizedPnl;
        dayChangeValue += m.dayChangeValue;
    }

    return {
        costBasis: round2(costBasis),
        marketValue: round2(marketValue),
        unrealizedPnl: round2(unrealizedPnl),
        unrealizedPnlPercent: costBasis > 0 ? round2((unrealizedPnl / costBasis) * 100) : 0,
        dayChangeValue: round2(dayChangeValue),
        positions: metrics.length,
        priced,
    };
}

/** Every currency the app can quote. Anything else is treated as dollars rather than as a new bucket. */
const CURRENCY_PATTERN = /^[A-Z]{3,5}$/;

/**
 * The currency a quote is really in. A missing or malformed code is dollars, which is what the
 * quote sources return when they omit it — inventing a bucket called `` would break every total.
 */
export function normalizeCurrency(value: unknown): string {
    const upper = String(value ?? '').trim().toUpperCase();
    return CURRENCY_PATTERN.test(upper) ? upper : 'USD';
}

export type CurrencyGroup = {
    currency: string;
    totals: PortfolioTotals;
};

export type CurrencySplit = {
    groups: CurrencyGroup[];
    /** The currency the headline may speak for: the one carrying the most value. */
    dominant: string;
    /** True when the account holds more than one currency and no rate was applied. */
    mixed: boolean;
};

/**
 * Totals per quote currency, largest first. Currencies are never added together: a riyal total and
 * a dollar total are different money, and converting them needs an FX rate this app does not keep.
 * The caller decides what to show; this only refuses to produce a single misleading number.
 */
export function groupByCurrency<T>(
    rows: readonly T[],
    currencyOf: (row: T) => unknown,
    metricsOf: (row: T) => PositionMetrics
): CurrencySplit {
    const buckets = new Map<string, PositionMetrics[]>();
    for (const row of rows) {
        const currency = normalizeCurrency(currencyOf(row));
        const bucket = buckets.get(currency);
        if (bucket) bucket.push(metricsOf(row));
        else buckets.set(currency, [metricsOf(row)]);
    }

    const groups = [...buckets.entries()]
        .map(([currency, metrics]) => ({ currency, totals: summarizePortfolio(metrics) }))
        .sort((a, b) => {
            // Value first; cost basis breaks a tie when nothing is priced yet; then the name.
            if (b.totals.marketValue !== a.totals.marketValue) return b.totals.marketValue - a.totals.marketValue;
            if (b.totals.costBasis !== a.totals.costBasis) return b.totals.costBasis - a.totals.costBasis;
            return a.currency.localeCompare(b.currency);
        });

    return { groups, dominant: groups[0]?.currency ?? 'USD', mixed: groups.length > 1 };
}

/**
 * Sums money that is not a position — realised profit, fees — per currency. Same rule as the
 * position totals: one number per currency, never a cross-currency sum.
 */
export function sumByCurrency<T>(
    items: readonly T[],
    currencyOf: (item: T) => unknown,
    valueOf: (item: T) => number
): { currency: string; value: number }[] {
    const sums = new Map<string, number>();
    for (const item of items) {
        const currency = normalizeCurrency(currencyOf(item));
        const value = valueOf(item);
        if (!Number.isFinite(value)) continue;
        sums.set(currency, (sums.get(currency) ?? 0) + value);
    }
    return [...sums.entries()]
        .map(([currency, value]) => ({ currency, value: round2(value) }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.currency.localeCompare(b.currency));
}

/** A cash balance may be zero (an empty account) but never negative or absurdly large. */
export const MAX_CASH = 1_000_000_000_000;

/**
 * Reads a cash balance typed by the user. Returns null when either the currency is not a real code
 * or the amount is not a number in range, so the action can reject instead of storing garbage.
 */
export function parseCashBalance(input: { currency: unknown; amount: unknown }): { currency: string; amount: number } | null {
    const currency = String(input.currency ?? '').trim().toUpperCase();
    if (!CURRENCY_PATTERN.test(currency)) return null;
    const amount = parseAmount(input.amount, { allowZero: true });
    if (amount === null || amount > MAX_CASH) return null;
    return { currency, amount: round2(amount) };
}

/** A position's share of the portfolio, 0..1, for the allocation bar. */
export function positionWeight(marketValue: number, totalMarketValue: number): number {
    if (!Number.isFinite(marketValue) || !Number.isFinite(totalMarketValue) || totalMarketValue <= 0) return 0;
    return marketValue / totalMarketValue;
}

/**
 * Reads a number typed or posted by a user. Rejects blanks, prose, negatives and
 * non-finite values; zero is rejected unless `allowZero` (an average cost may be 0).
 */
export function parseAmount(value: unknown, options: { allowZero?: boolean } = {}): number | null {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        if (value < 0) return null;
        if (value === 0 && !options.allowZero) return null;
        return value;
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    if (parsed < 0) return null;
    if (parsed === 0 && !options.allowZero) return null;
    return parsed;
}

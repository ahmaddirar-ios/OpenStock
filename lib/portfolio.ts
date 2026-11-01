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

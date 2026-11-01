import { describe, expect, it } from 'vitest';
import { computePositionMetrics, parseAmount, positionWeight, summarizePortfolio } from '@/lib/portfolio';

describe('computePositionMetrics', () => {
    it('measures a gain against the cost basis', () => {
        const m = computePositionMetrics({ quantity: 10, averageCost: 100, price: 120 });
        expect(m.costBasis).toBe(1000);
        expect(m.marketValue).toBe(1200);
        expect(m.unrealizedPnl).toBe(200);
        expect(m.unrealizedPnlPercent).toBeCloseTo(20);
        expect(m.priced).toBe(true);
    });

    it('measures a loss as a negative number', () => {
        const m = computePositionMetrics({ quantity: 4, averageCost: 50, price: 40 });
        expect(m.unrealizedPnl).toBe(-40);
        expect(m.unrealizedPnlPercent).toBeCloseTo(-20);
    });

    it('handles fractional quantities (crypto)', () => {
        const m = computePositionMetrics({ quantity: 0.5, averageCost: 20000, price: 30000 });
        expect(m.costBasis).toBe(10000);
        expect(m.marketValue).toBe(15000);
        expect(m.unrealizedPnl).toBe(5000);
    });

    it('never invents a loss when the price is missing', () => {
        const m = computePositionMetrics({ quantity: 10, averageCost: 100, price: 0 });
        expect(m.priced).toBe(false);
        expect(m.marketValue).toBe(0);
        expect(m.unrealizedPnl).toBe(0);
        expect(m.unrealizedPnlPercent).toBe(0);
        expect(m.costBasis).toBe(1000);
    });

    it('values the day change over the held quantity', () => {
        const m = computePositionMetrics({ quantity: 10, averageCost: 100, price: 120, change: 1.5 });
        expect(m.dayChangeValue).toBe(15);
    });

    it('treats a zero cost basis as an unknown percentage, not a division by zero', () => {
        const m = computePositionMetrics({ quantity: 10, averageCost: 0, price: 12 });
        expect(m.costBasis).toBe(0);
        expect(m.unrealizedPnlPercent).toBe(0);
        expect(m.unrealizedPnl).toBe(120);
    });
});

describe('summarizePortfolio', () => {
    it('totals the priced positions and derives the overall percentage', () => {
        const totals = summarizePortfolio([
            computePositionMetrics({ quantity: 10, averageCost: 100, price: 120, change: 1 }),
            computePositionMetrics({ quantity: 5, averageCost: 100, price: 80, change: -2 }),
        ]);
        expect(totals.costBasis).toBe(1500);
        expect(totals.marketValue).toBe(1600);
        expect(totals.unrealizedPnl).toBe(100);
        expect(totals.unrealizedPnlPercent).toBeCloseTo(100 / 1500 * 100);
        expect(totals.dayChangeValue).toBe(0);
        expect(totals.positions).toBe(2);
        expect(totals.priced).toBe(2);
    });

    it('excludes unpriced positions from the totals', () => {
        const totals = summarizePortfolio([
            computePositionMetrics({ quantity: 10, averageCost: 100, price: 120 }),
            computePositionMetrics({ quantity: 10, averageCost: 100, price: 0 }),
        ]);
        expect(totals.marketValue).toBe(1200);
        expect(totals.priced).toBe(1);
        expect(totals.positions).toBe(2);
    });

    it('returns zeroed totals for an empty portfolio', () => {
        const totals = summarizePortfolio([]);
        expect(totals).toMatchObject({ costBasis: 0, marketValue: 0, unrealizedPnl: 0, unrealizedPnlPercent: 0, positions: 0, priced: 0 });
    });
});

describe('positionWeight', () => {
    it('is the share of the portfolio', () => {
        expect(positionWeight(250, 1000)).toBeCloseTo(0.25);
    });

    it('is zero when there is nothing to divide by', () => {
        expect(positionWeight(250, 0)).toBe(0);
    });
});

describe('parseAmount', () => {
    it('reads plain and padded numbers', () => {
        expect(parseAmount('10')).toBe(10);
        expect(parseAmount(' 1.5 ')).toBe(1.5);
        expect(parseAmount(42)).toBe(42);
    });

    it('rejects blanks, prose, negatives and non-finite values', () => {
        expect(parseAmount('')).toBeNull();
        expect(parseAmount('   ')).toBeNull();
        expect(parseAmount('abc')).toBeNull();
        expect(parseAmount('-3')).toBeNull();
        expect(parseAmount('Infinity')).toBeNull();
        expect(parseAmount(null)).toBeNull();
        expect(parseAmount(undefined)).toBeNull();
    });

    it('rejects zero unless it is allowed', () => {
        expect(parseAmount('0')).toBeNull();
        expect(parseAmount('0', { allowZero: true })).toBe(0);
    });
});

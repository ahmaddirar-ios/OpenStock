import { describe, expect, it } from 'vitest';
import { computePositionMetrics, groupByCurrency, normalizeCurrency, parseAmount, positionWeight, sumByCurrency, summarizePortfolio } from '@/lib/portfolio';

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

describe('normalizeCurrency', () => {
    it('keeps a real ISO code and uppercases it', () => {
        expect(normalizeCurrency('usd')).toBe('USD');
        expect(normalizeCurrency(' SAR ')).toBe('SAR');
    });

    it('treats a missing or malformed code as dollars instead of a new bucket', () => {
        expect(normalizeCurrency(undefined)).toBe('USD');
        expect(normalizeCurrency(null)).toBe('USD');
        expect(normalizeCurrency('')).toBe('USD');
        expect(normalizeCurrency('$')).toBe('USD');
        expect(normalizeCurrency('1234')).toBe('USD');
    });
});

describe('groupByCurrency', () => {
    const row = (currency: string, quantity: number, averageCost: number, price: number) => ({
        currency,
        quantity,
        averageCost,
        price,
    });
    const metrics = (r: ReturnType<typeof row>) => computePositionMetrics(r);

    it('never adds two currencies together', () => {
        const split = groupByCurrency(
            [row('USD', 10, 100, 120), row('SAR', 10, 100, 90)],
            (r) => r.currency,
            metrics
        );
        expect(split.mixed).toBe(true);
        expect(split.groups).toHaveLength(2);
        expect(split.groups.find((g) => g.currency === 'USD')?.totals.marketValue).toBe(1200);
        expect(split.groups.find((g) => g.currency === 'SAR')?.totals.marketValue).toBe(900);
    });

    it('names the currency carrying the most value as dominant', () => {
        const split = groupByCurrency(
            [row('USD', 1, 100, 100), row('SAR', 100, 100, 110)],
            (r) => r.currency,
            metrics
        );
        expect(split.dominant).toBe('SAR');
    });

    it('falls back to cost basis when nothing is priced yet', () => {
        const split = groupByCurrency(
            [row('USD', 1, 500, 0), row('SAR', 1, 100, 0)],
            (r) => r.currency,
            metrics
        );
        expect(split.dominant).toBe('USD');
        expect(split.mixed).toBe(true);
    });

    it('is not mixed for a single currency, including a missing code', () => {
        expect(groupByCurrency([row('', 1, 10, 20)], (r) => r.currency, metrics)).toMatchObject({ dominant: 'USD', mixed: false });
        expect(groupByCurrency([], (r: { currency: string }) => r.currency, metrics).groups).toEqual([]);
    });
});

describe('sumByCurrency', () => {
    it('sums each currency on its own and rounds', () => {
        const sales = [
            { symbol: 'AAPL', pnl: 10.005 },
            { symbol: '2222.SR', pnl: 5 },
            { symbol: 'MSFT', pnl: 2.005 },
        ];
        const currencies: Record<string, string> = { AAPL: 'USD', '2222.SR': 'SAR', MSFT: 'USD' };
        const sums = sumByCurrency(sales, (s) => currencies[s.symbol], (s) => s.pnl);
        expect(sums.find((s) => s.currency === 'USD')?.value).toBe(12.01);
        expect(sums.find((s) => s.currency === 'SAR')?.value).toBe(5);
    });

    it('drops non-finite values and sorts by absolute size', () => {
        const sums = sumByCurrency(
            [{ c: 'USD', v: 5 }, { c: 'SAR', v: -20 }, { c: 'USD', v: Number.NaN }],
            (s) => s.c,
            (s) => s.v
        );
        expect(sums.map((s) => s.currency)).toEqual(['SAR', 'USD']);
        expect(sums[1].value).toBe(5);
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

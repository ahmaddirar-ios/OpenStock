import { describe, expect, it } from 'vitest';
import {
    buildEquityCurve,
    buildLedger,
    isUsableTrade,
    mergePositions,
    parseTradeDate,
    parseTradesCsv,
    realizedBySymbol,
    totalReturnPercent,
    tradesToCsv,
    type Trade,
} from '@/lib/portfolio-ledger';

const trade = (over: Partial<Trade>): Trade => ({
    symbol: '2222.SR',
    side: 'buy',
    quantity: 10,
    price: 30,
    tradedAt: '2026-01-02T10:00:00.000Z',
    ...over,
});

describe('buildLedger', () => {
    it('turns a single buy into an open position', () => {
        const ledger = buildLedger([trade({})]);
        expect(ledger.positions).toHaveLength(1);
        expect(ledger.positions[0]).toMatchObject({ symbol: '2222.SR', quantity: 10, averageCost: 30, costBasis: 300 });
        expect(ledger.totalRealized).toBe(0);
    });

    it('spreads the buy fee over the shares', () => {
        const ledger = buildLedger([trade({ quantity: 10, price: 30, fee: 5 })]);
        expect(ledger.positions[0].averageCost).toBe(30.5);
        expect(ledger.positions[0].costBasis).toBe(305);
    });

    it('sells the oldest lot first (FIFO)', () => {
        const ledger = buildLedger([
            trade({ quantity: 10, price: 20, tradedAt: '2026-01-01T10:00:00.000Z' }),
            trade({ quantity: 10, price: 40, tradedAt: '2026-01-02T10:00:00.000Z' }),
            trade({ side: 'sell', quantity: 10, price: 50, tradedAt: '2026-01-03T10:00:00.000Z' }),
        ]);
        expect(ledger.sales).toHaveLength(1);
        // Sold the 20-cost lot, not the 40-cost one.
        expect(ledger.sales[0].cost).toBe(200);
        expect(ledger.sales[0].pnl).toBe(300);
        expect(ledger.positions[0].quantity).toBe(10);
        expect(ledger.positions[0].averageCost).toBe(40);
    });

    it('splits a sell across two lots', () => {
        const ledger = buildLedger([
            trade({ quantity: 5, price: 10, tradedAt: '2026-01-01T10:00:00.000Z' }),
            trade({ quantity: 5, price: 20, tradedAt: '2026-01-02T10:00:00.000Z' }),
            trade({ side: 'sell', quantity: 8, price: 30, tradedAt: '2026-01-03T10:00:00.000Z' }),
        ]);
        expect(ledger.sales[0].cost).toBe(5 * 10 + 3 * 20);
        expect(ledger.sales[0].pnl).toBe(8 * 30 - 110);
        expect(ledger.positions[0].quantity).toBe(2);
        expect(ledger.positions[0].averageCost).toBe(20);
    });

    it('subtracts the sell fee from proceeds', () => {
        const ledger = buildLedger([
            trade({ quantity: 10, price: 10, tradedAt: '2026-01-01T10:00:00.000Z' }),
            trade({ side: 'sell', quantity: 10, price: 20, fee: 5, tradedAt: '2026-01-02T10:00:00.000Z' }),
        ]);
        expect(ledger.sales[0].proceeds).toBe(195);
        expect(ledger.sales[0].pnl).toBe(95);
    });

    it('warns instead of going short when a sell exceeds the holding', () => {
        const ledger = buildLedger([
            trade({ quantity: 5, price: 10 }),
            trade({ side: 'sell', quantity: 8, price: 20, tradedAt: '2026-01-03T10:00:00.000Z' }),
        ]);
        expect(ledger.positions).toHaveLength(0);
        expect(ledger.warnings[0]).toContain('2222.SR');
        expect(ledger.sales[0].quantity).toBe(5);
    });

    it('ignores unusable rows', () => {
        const ledger = buildLedger([
            trade({ quantity: 0 }),
            trade({ price: -1 }),
            trade({ tradedAt: 'not a date' }),
            trade({ quantity: 2 }),
        ]);
        expect(ledger.positions[0].quantity).toBe(2);
    });

    it('orders trades by time, not by array order', () => {
        const ledger = buildLedger([
            trade({ side: 'sell', quantity: 10, price: 50, tradedAt: '2026-01-03T10:00:00.000Z' }),
            trade({ quantity: 10, price: 20, tradedAt: '2026-01-01T10:00:00.000Z' }),
        ]);
        expect(ledger.sales[0].pnl).toBe(300);
    });

    it('keeps symbols apart', () => {
        const ledger = buildLedger([
            trade({ symbol: '2222.SR', quantity: 10, price: 30 }),
            trade({ symbol: 'AAPL', quantity: 2, price: 200 }),
        ]);
        expect(ledger.positions.map((p) => p.symbol).sort()).toEqual(['2222.SR', 'AAPL']);
    });

    it('reports realised profit per symbol', () => {
        const ledger = buildLedger([
            trade({ quantity: 10, price: 10, tradedAt: '2026-01-01T10:00:00.000Z' }),
            trade({ side: 'sell', quantity: 5, price: 20, tradedAt: '2026-01-02T10:00:00.000Z' }),
            trade({ side: 'sell', quantity: 5, price: 5, tradedAt: '2026-01-03T10:00:00.000Z' }),
        ]);
        const bySymbol = realizedBySymbol(ledger.sales);
        expect(bySymbol).toHaveLength(1);
        expect(bySymbol[0].pnl).toBe(50 - 25);
        expect(bySymbol[0].count).toBe(2);
    });
});

describe('isUsableTrade', () => {
    it('accepts a well-formed trade', () => {
        expect(isUsableTrade(trade({}))).toBe(true);
    });
    it('rejects a blank symbol', () => {
        expect(isUsableTrade(trade({ symbol: '  ' }))).toBe(false);
    });
});

describe('parseTradeDate', () => {
    it('reads ISO dates', () => {
        expect(parseTradeDate('2026-03-04')).toBe('2026-03-04T00:00:00.000Z');
    });
    it('reads day-first dates', () => {
        expect(parseTradeDate('04/03/2026')).toBe('2026-03-04T12:00:00.000Z');
    });
    it('rejects prose', () => {
        expect(parseTradeDate('yesterday')).toBeNull();
    });
});

describe('parseTradesCsv', () => {
    it('parses a canonical file with a header', () => {
        const csv = [
            'Symbol,Side,Quantity,Price,Fee,Date,Company,Note',
            '2222.SR,buy,10,30,1.5,2026-01-02,Aramco,first',
            '2222.SR,sell,4,40,0,2026-01-05,Aramco,trim',
        ].join('\n');
        const { trades, errors } = parseTradesCsv(csv);
        expect(errors).toHaveLength(0);
        expect(trades).toHaveLength(2);
        expect(trades[0]).toMatchObject({ symbol: '2222.SR', side: 'buy', quantity: 10, price: 30, fee: 1.5, company: 'Aramco' });
        expect(trades[1].side).toBe('sell');
    });

    it('accepts aliases and Arabic sides', () => {
        const csv = ['ticker,action,qty,cost,date', 'AAPL,شراء,3,150,2026-02-01', 'AAPL,بيع,1,170,2026-02-02'].join('\n');
        const { trades, errors } = parseTradesCsv(csv);
        expect(errors).toHaveLength(0);
        expect(trades.map((t) => t.side)).toEqual(['buy', 'sell']);
    });

    it('parses a headerless file in canonical order', () => {
        const { trades } = parseTradesCsv('AAPL,buy,2,100,0,2026-01-01,Apple,');
        expect(trades[0]).toMatchObject({ symbol: 'AAPL', quantity: 2, price: 100 });
    });

    it('reports bad rows by line and keeps the good ones', () => {
        const csv = ['Symbol,Side,Quantity,Price,Date', 'AAPL,buy,2,100,2026-01-01', 'AAPL,hold,2,100,2026-01-01', 'AAPL,buy,0,100,2026-01-01'].join('\n');
        const { trades, errors } = parseTradesCsv(csv);
        expect(trades).toHaveLength(1);
        expect(errors.map((e) => e.message)).toEqual(['badSide', 'badQuantity']);
        expect(errors[0].line).toBe(3);
    });

    it('refuses a file without the required columns', () => {
        const { errors } = parseTradesCsv('foo,bar\n1,2');
        expect(errors[0].message).toBe('missingColumns');
    });

    it('handles quoted cells with commas', () => {
        const csv = ['Symbol,Side,Quantity,Price,Date,Note', 'AAPL,buy,2,100,2026-01-01,"bought, then waited"'].join('\n');
        const { trades } = parseTradesCsv(csv);
        expect(trades[0].note).toBe('bought, then waited');
    });

    it('round-trips through tradesToCsv', () => {
        const original = [trade({ company: 'Aramco', note: 'hello, world', fee: 2 })];
        const { trades } = parseTradesCsv(tradesToCsv(original));
        expect(trades[0]).toMatchObject({ symbol: '2222.SR', side: 'buy', quantity: 10, price: 30, fee: 2, note: 'hello, world' });
    });
});

describe('mergePositions', () => {
    it('lets the ledger win for a symbol it knows', () => {
        const merged = mergePositions(
            [{ symbol: '2222.SR', company: 'Aramco', quantity: 99, averageCost: 1 }],
            [{ symbol: '2222.SR', company: 'Aramco', quantity: 10, averageCost: 30, costBasis: 300, realizedPnl: 5, trades: 2 }]
        );
        expect(merged).toHaveLength(1);
        expect(merged[0]).toMatchObject({ quantity: 10, averageCost: 30, source: 'ledger', realizedPnl: 5 });
    });

    it('keeps a manual position the ledger never touched', () => {
        const merged = mergePositions(
            [{ symbol: 'AAPL', company: 'Apple', quantity: 3, averageCost: 200 }],
            []
        );
        expect(merged[0]).toMatchObject({ symbol: 'AAPL', source: 'manual' });
    });
});

describe('totalReturnPercent', () => {
    it('counts open and closed capital once', () => {
        const pct = totalReturnPercent({ unrealizedPnl: 100, realizedPnl: 50, openCostBasis: 1000, realizedCostBasis: 500 });
        expect(pct).toBeCloseTo(10);
    });
    it('returns zero without capital', () => {
        expect(totalReturnPercent({ unrealizedPnl: 10, realizedPnl: 10, openCostBasis: 0, realizedCostBasis: 0 })).toBe(0);
    });
});

describe('buildEquityCurve', () => {
    const bars = (prices: number[]) =>
        prices.map((close, index) => ({ time: Date.UTC(2026, 0, 2 + index) / 1000, close }));

    it('values the holding on each trading day', () => {
        const curve = buildEquityCurve(
            [trade({ quantity: 10, price: 30, tradedAt: '2026-01-02T10:00:00.000Z' })],
            { '2222.SR': bars([30, 33, 36]) }
        );
        expect(curve).toHaveLength(3);
        expect(curve[0].value).toBe(300);
        expect(curve[1].value).toBe(330);
        expect(curve[2].value).toBe(360);
        expect(curve[2].costBasis).toBe(300);
    });

    it('starts at the first trade, not at the first bar', () => {
        const curve = buildEquityCurve(
            [trade({ quantity: 10, price: 30, tradedAt: '2026-01-03T10:00:00.000Z' })],
            { '2222.SR': bars([30, 33, 36]) }
        );
        expect(curve).toHaveLength(2);
        expect(curve[0].value).toBe(330);
    });

    it('drops a sold position out of the value and banks the profit', () => {
        const curve = buildEquityCurve(
            [
                trade({ quantity: 10, price: 30, tradedAt: '2026-01-02T10:00:00.000Z' }),
                trade({ side: 'sell', quantity: 10, price: 40, tradedAt: '2026-01-03T10:00:00.000Z' }),
            ],
            { '2222.SR': bars([30, 40, 50]) }
        );
        expect(curve[1].value).toBe(0);
        expect(curve[1].realized).toBe(100);
        expect(curve[2].value).toBe(0);
        expect(curve[2].realized).toBe(100);
    });

    it('carries a position at cost until its first price prints', () => {
        const curve = buildEquityCurve(
            [trade({ quantity: 10, price: 30, tradedAt: '2026-01-02T10:00:00.000Z' })],
            { '2222.SR': [{ time: Date.UTC(2026, 0, 4) / 1000, close: 36 }] }
        );
        // The only bar is on the 4th, so the curve has one point, valued at that close.
        expect(curve).toHaveLength(1);
        expect(curve[0].value).toBe(360);
    });

    it('returns nothing without trades', () => {
        expect(buildEquityCurve([], { '2222.SR': bars([30]) })).toEqual([]);
    });
});

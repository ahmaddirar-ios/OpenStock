import { describe, expect, it } from 'vitest';
import {
    MIN_WARMUP_BARS,
    buy,
    clampCursor,
    cursorForTime,
    fillPrice,
    minStartIndex,
    openAccount,
    parseQuantity,
    parseSession,
    randomCursor,
    resumeIndex,
    sell,
    serializeSession,
    sessionKey,
    stepCursor,
    summarize,
    toCsv,
    visibleCandles,
    type Fill,
} from '@/lib/replay';
import type { Candle } from '@/lib/yahoo-candles';

const candle = (time: number, close: number): Candle => ({
    time,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
});

/** 120 daily bars, close = 100 + index, so a bar's identity is visible in its price. */
const SERIES: Candle[] = Array.from({ length: 120 }, (_, i) => candle(1_600_000_000 + i * 86_400, 100 + i));

describe('visibleCandles', () => {
    it('includes the cursor bar and nothing after it', () => {
        const shown = visibleCandles(SERIES, 10);
        expect(shown).toHaveLength(11);
        expect(shown[shown.length - 1].time).toBe(SERIES[10].time);
    });

    it('never leaks a later bar, whatever the cursor is', () => {
        for (const cursor of [-50, 0, 1, 59, 119, 500]) {
            const shown = visibleCandles(SERIES, cursor);
            const limit = SERIES[clampCursor(cursor, SERIES.length)].time;
            expect(shown.every((bar) => bar.time <= limit)).toBe(true);
        }
    });

    it('returns nothing for an empty series', () => {
        expect(visibleCandles([], 5)).toEqual([]);
    });
});

describe('cursor arithmetic', () => {
    it('clamps to the series', () => {
        expect(clampCursor(-1, 10)).toBe(0);
        expect(clampCursor(4.7, 10)).toBe(4);
        expect(clampCursor(99, 10)).toBe(9);
        expect(clampCursor(3, 0)).toBe(0);
    });

    it('offers a start with warm-up behind it', () => {
        expect(minStartIndex(500)).toBe(MIN_WARMUP_BARS);
        expect(minStartIndex(10)).toBe(8);
        expect(minStartIndex(1)).toBe(0);
        expect(minStartIndex(0)).toBe(0);
    });

    it('finds the last bar at or before a time', () => {
        expect(cursorForTime(SERIES, SERIES[0].time - 1)).toBe(-1);
        expect(cursorForTime(SERIES, SERIES[0].time)).toBe(0);
        expect(cursorForTime(SERIES, SERIES[57].time + 10)).toBe(57);
        expect(cursorForTime(SERIES, SERIES[119].time + 10_000)).toBe(119);
        expect(cursorForTime([], SERIES[0].time)).toBe(-1);
    });

    it('resumes on a coarser series at the same time or earlier, never later', () => {
        const weekly = SERIES.filter((_, i) => i % 5 === 0);
        const resumed = resumeIndex(weekly, SERIES[62].time);
        expect(weekly[resumed].time).toBeLessThanOrEqual(SERIES[62].time);
        expect(resumed).toBeGreaterThanOrEqual(0);
        expect(resumed).toBeLessThan(weekly.length);
    });

    it('resumes at the warm-up bar when the stored time is older than the series', () => {
        expect(resumeIndex(SERIES, SERIES[0].time - 1)).toBe(minStartIndex(SERIES.length));
    });

    it('steps one bar at a time without leaving the series', () => {
        expect(stepCursor(5, 1, 120)).toBe(6);
        expect(stepCursor(5, -1, 120)).toBe(4);
        expect(stepCursor(0, -1, 120)).toBe(0);
        expect(stepCursor(119, 3, 120)).toBe(119);
    });

    it('picks a random start inside the playable range', () => {
        expect(randomCursor(120, () => 0)).toBe(minStartIndex(120));
        expect(randomCursor(120, () => 0.999999)).toBe(119);
        expect(randomCursor(120, () => 0.5)).toBeGreaterThanOrEqual(minStartIndex(120));
        expect(randomCursor(0, () => 0.5)).toBe(0);
    });
});

describe('paper account', () => {
    it('applies costs on both sides of the book', () => {
        const buyAt = fillPrice(100, 'buy');
        const sellAt = fillPrice(100, 'sell');
        expect(buyAt).toBeGreaterThan(100);
        expect(sellAt).toBeLessThan(100);
        const opened = buy(openAccount(), { price: 100, quantity: 10, time: 1 });
        if (!opened.ok) throw new Error('buy failed');
        expect(opened.account.cash).toBeLessThan(99_000);
    });

    it('buys into cash and records the average cost', () => {
        const result = buy(openAccount(1_000), { price: 10, quantity: 50, time: 1 }, { commissionBps: 0, slippageBps: 0 });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.account.cash).toBe(500);
        expect(result.account.position).toEqual({ quantity: 50, averageCost: 10 });
        expect(result.account.fills).toHaveLength(1);
        expect(result.account.fills[0].realized).toBe(0);
    });

    it('averages a second buy into the first', () => {
        const first = buy(openAccount(10_000), { price: 10, quantity: 100, time: 1 }, { commissionBps: 0, slippageBps: 0 });
        if (!first.ok) throw new Error('first buy failed');
        const second = buy(first.account, { price: 20, quantity: 100, time: 2 }, { commissionBps: 0, slippageBps: 0 });
        if (!second.ok) throw new Error('second buy failed');
        expect(second.account.position).toEqual({ quantity: 200, averageCost: 15 });
        expect(second.account.cash).toBe(7_000);
    });

    it('refuses a buy the cash cannot cover, costs included', () => {
        const result = buy(openAccount(100), { price: 100, quantity: 1, time: 1 });
        expect(result).toEqual({ ok: false, reason: 'insufficientFunds' });
    });

    it('refuses a bad quantity or price', () => {
        expect(buy(openAccount(), { price: 0, quantity: 1, time: 1 })).toEqual({ ok: false, reason: 'badPrice' });
        expect(buy(openAccount(), { price: 10, quantity: 0, time: 1 })).toEqual({ ok: false, reason: 'badQuantity' });
        expect(buy(openAccount(), { price: 10, quantity: Number.NaN, time: 1 })).toEqual({ ok: false, reason: 'badQuantity' });
    });

    it('sells part of a position and books the realised P&L', () => {
        const opened = buy(openAccount(10_000), { price: 10, quantity: 100, time: 1 }, { commissionBps: 0, slippageBps: 0 });
        if (!opened.ok) throw new Error('buy failed');
        const closed = sell(opened.account, { price: 12, quantity: 40, time: 2 }, { commissionBps: 0, slippageBps: 0 });
        if (!closed.ok) throw new Error('sell failed');
        expect(closed.account.position).toEqual({ quantity: 60, averageCost: 10 });
        expect(closed.account.fills[1].realized).toBe(80);
        expect(closed.account.cash).toBe(10_000 - 1_000 + 480);
    });

    it('closes the position when everything is sold', () => {
        const opened = buy(openAccount(1_000), { price: 10, quantity: 100, time: 1 }, { commissionBps: 0, slippageBps: 0 });
        if (!opened.ok) throw new Error('buy failed');
        const closed = sell(opened.account, { price: 10, quantity: 100, time: 2 }, { commissionBps: 0, slippageBps: 0 });
        if (!closed.ok) throw new Error('sell failed');
        expect(closed.account.position).toBeNull();
        expect(closed.account.cash).toBe(1_000);
    });

    it('refuses to oversell or to short', () => {
        const opened = buy(openAccount(10_000), { price: 10, quantity: 10, time: 1 });
        if (!opened.ok) throw new Error('buy failed');
        expect(sell(opened.account, { price: 11, quantity: 11, time: 2 })).toEqual({ ok: false, reason: 'notEnoughShares' });
        expect(sell(openAccount(), { price: 11, quantity: 1, time: 2 })).toEqual({ ok: false, reason: 'noPosition' });
    });

    it('summarises equity, realised and unrealised at the cursor price', () => {
        const opened = buy(openAccount(1_000), { price: 10, quantity: 50, time: 1 }, { commissionBps: 0, slippageBps: 0 });
        if (!opened.ok) throw new Error('buy failed');
        const summary = summarize(opened.account, 12);
        expect(summary.cash).toBe(500);
        expect(summary.positionValue).toBe(600);
        expect(summary.equity).toBe(1_100);
        expect(summary.unrealized).toBe(100);
        expect(summary.realized).toBe(0);
        expect(summary.returnPct).toBeCloseTo(0.1, 10);
    });

    it('marks an unpriced position at zero rather than inventing a price', () => {
        const opened = buy(openAccount(1_000), { price: 10, quantity: 50, time: 1 }, { commissionBps: 0, slippageBps: 0 });
        if (!opened.ok) throw new Error('buy failed');
        const summary = summarize(opened.account, null);
        expect(summary.positionValue).toBe(0);
        expect(summary.equity).toBe(500);
        expect(summary.unrealized).toBe(0);
    });

    it('parses quantities people actually type', () => {
        expect(parseQuantity('1,000.5')).toBe(1000.5);
        expect(parseQuantity(' 4 ')).toBe(4);
        expect(parseQuantity(0.1 + 0.2)).toBe(0.3);
        expect(parseQuantity('0')).toBeNull();
        expect(parseQuantity('-3')).toBeNull();
        expect(parseQuantity('abc')).toBeNull();
        expect(parseQuantity(null)).toBeNull();
    });
});

describe('trade log', () => {
    const fills: Fill[] = [
        { id: 'a', time: 1_600_000_000, side: 'buy', quantity: 10, price: 100.5, realized: 0 },
        { id: 'b', time: 1_600_086_400, side: 'sell', quantity: 10, price: 110.25, realized: 97.5 },
    ];

    it('writes a BOM and an English header', () => {
        const csv = toCsv(fills, 'en');
        expect(csv.startsWith('\uFEFF')).toBe(true);
        expect(csv.split('\n')[0]).toBe('\uFEFFDate,Side,Quantity,Price,Realized P&L');
        expect(csv.split('\n')[1]).toContain('buy,10,100.5000,0.00');
    });

    it('writes Arabic headers a spreadsheet keeps', () => {
        const csv = toCsv(fills, 'ar');
        expect(csv.split('\n')[0]).toContain('التاريخ,العملية');
        expect(csv).toContain('بيع,10');
        expect(csv).toContain('97.50');
    });
});

describe('remembered session', () => {
    const opened = buy(openAccount(5_000), { price: 10, quantity: 10, time: SERIES[70].time });
    if (!opened.ok) throw new Error('fixture buy failed');
    const session = { cursorTime: SERIES[70].time, account: opened.account };

    it('round-trips the cursor and the account', () => {
        const parsed = parseSession(serializeSession(session));
        expect(parsed).not.toBeNull();
        expect(parsed?.cursorTime).toBe(session.cursorTime);
        expect(parsed?.account.cash).toBeCloseTo(session.account.cash, 6);
        expect(parsed?.account.fills).toHaveLength(1);
    });

    it('treats junk as a fresh start', () => {
        expect(parseSession(null)).toBeNull();
        expect(parseSession('not json')).toBeNull();
        expect(parseSession('{"cursorTime": "soon"}')).toBeNull();
        expect(parseSession('{"cursorTime": 1, "account": {"cash": -5}}')).toBeNull();
        expect(parseSession('{"cursorTime": 1, "account": {"startingCash": 0, "cash": 0, "position": null, "fills": []}}')).toBeNull();
    });

    it('keys the session by symbol, case-insensitively', () => {
        expect(sessionKey(' 2222.sr ')).toBe('openstock:replay:2222.SR');
        expect(sessionKey('aapl')).toBe(sessionKey('AAPL'));
    });
});

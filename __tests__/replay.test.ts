import { describe, expect, it } from 'vitest';
import {
    DEFAULT_STARTING_CASH,
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
    settleBar,
    stepCursor,
    summarize,
    toCsv,
    validateBracket,
    validateBracketOrder,
    validateOrder,
    visibleCandles,
    type Fill,
    type PendingOrder,
    type ReplayIntent,
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
        { id: 'a', time: 1_600_000_000, side: 'buy', quantity: 10, price: 100.5, realized: 0, reason: 'market' },
        { id: 'b', time: 1_600_086_400, side: 'sell', quantity: 10, price: 110.25, realized: 97.5, reason: 'target' },
    ];

    it('writes a BOM and an English header', () => {
        const csv = toCsv(fills, 'en');
        expect(csv.startsWith('\uFEFF')).toBe(true);
        expect(csv.split('\n')[0]).toBe('\uFEFFDate,Side,Quantity,Price,Realized P&L,Reason');
        expect(csv.split('\n')[1]).toContain('buy,10,100.5000,0.00,market');
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

// --- order types and brackets ---------------------------------------------------------------

const bar = (time: number, open: number, high: number, low: number, close: number): Candle => ({
    time,
    open,
    high,
    low,
    close,
    volume: 1_000,
});

const order = (over: Partial<PendingOrder> = {}): PendingOrder => ({
    id: 'o1',
    type: 'limit',
    side: 'buy',
    price: 95,
    quantity: 10,
    placedAt: 1_000,
    ...over,
});

const held = (price = 100, quantity = 10) => {
    const opened = buy(openAccount(), { price, quantity, time: 900 });
    if (!opened.ok) throw new Error('fixture failed');
    return opened.account;
};

describe('validateOrder', () => {
    const mark = 100;

    it('accepts a market order and a limit on the right side of the mark', () => {
        expect(validateOrder('market', 0, 10, mark)).toBeNull();
        expect(validateOrder('limit', 95, 10, mark)).toBeNull();
        expect(validateOrder('stop', 105, 10, mark)).toBeNull();
    });

    it('refuses an order the market would fill instantly', () => {
        expect(validateOrder('limit', 101, 10, mark)).toBe('wrongSideOfMarket');
        expect(validateOrder('limit', 100, 10, mark)).toBe('wrongSideOfMarket');
        expect(validateOrder('stop', 99, 10, mark)).toBe('wrongSideOfMarket');
        expect(validateOrder('stop', 100, 10, mark)).toBe('wrongSideOfMarket');
    });

    it('refuses a price or a quantity that is not a price or a quantity', () => {
        expect(validateOrder('limit', 0, 10, mark)).toBe('badPrice');
        expect(validateOrder('limit', Number.NaN, 10, mark)).toBe('badPrice');
        expect(validateOrder('limit', 95, 0, mark)).toBe('badQuantity');
    });
});

describe('validateBracket', () => {
    const mark = 100;

    it('wants a stop below the mark and a target above it', () => {
        expect(validateBracket({ stopLoss: 95, takeProfit: 110 }, mark)).toBeNull();
        expect(validateBracket({ stopLoss: 95 }, mark)).toBeNull();
        expect(validateBracket({ takeProfit: 110 }, mark)).toBeNull();
    });

    it('refuses an empty bracket, a silly price, and the wrong side', () => {
        expect(validateBracket({}, mark)).toBe('badPrice');
        expect(validateBracket({ stopLoss: 0 }, mark)).toBe('badPrice');
        expect(validateBracket({ takeProfit: Number.NaN }, mark)).toBe('badPrice');
        expect(validateBracket({ stopLoss: 100 }, mark)).toBe('wrongSideOfMarket');
        expect(validateBracket({ takeProfit: 100 }, mark)).toBe('wrongSideOfMarket');
    });
});

describe('validateBracketOrder', () => {
    it('only refuses levels the current mark has already passed', () => {
        // A stop deep under the mark is fine even when a distant limit will fill above it: the
        // real cross-check happens when the bracket arms on the fill bar.
        expect(validateBracketOrder(100, { stopLoss: 50, takeProfit: 400 })).toBeNull();
        expect(validateBracketOrder(100, { stopLoss: 100 })).toBe('wrongSideOfMarket');
        expect(validateBracketOrder(100, { stopLoss: 120 })).toBe('wrongSideOfMarket');
        expect(validateBracketOrder(100, { takeProfit: 100 })).toBe('wrongSideOfMarket');
        expect(validateBracketOrder(100, { takeProfit: 90 })).toBe('wrongSideOfMarket');
    });

    it('refuses a bracket with no level or no mark', () => {
        expect(validateBracketOrder(100, {})).toBe('badPrice');
        expect(validateBracketOrder(0, { stopLoss: 95 })).toBe('badPrice');
        expect(validateBracketOrder(100, { stopLoss: -1 })).toBe('badPrice');
    });
});

describe('settleBar — a pending order', () => {
    it('waits while the bar misses it and fills at the level when the bar reaches it', () => {
        const missed = settleBar({ account: openAccount(), intent: { order: order() }, bar: bar(2_000, 100, 101, 96, 100) });
        expect(missed.account.position).toBeNull();
        expect(missed.intent.order?.id).toBe('o1'); // still armed
        expect(missed.fills).toHaveLength(0);

        const hit = settleBar({ account: openAccount(), intent: { order: order() }, bar: bar(3_000, 100, 101, 95, 99) });
        expect(hit.account.position).toMatchObject({ quantity: 10 });
        expect(hit.account.fills).toHaveLength(1);
        expect(hit.account.fills[0]).toMatchObject({ side: 'buy', reason: 'limit', quantity: 10 });
        expect(hit.account.fills[0].price).toBeCloseTo(fillPrice(95, 'buy'), 6);
        expect(hit.intent.order).toBeNull(); // spent
    });

    it('fills at the open when the bar gapped through the level', () => {
        const gapped = settleBar({ account: openAccount(), intent: { order: order({ price: 95 }) }, bar: bar(3_000, 90, 92, 88, 91) });
        expect(gapped.account.fills[0].price).toBeCloseTo(fillPrice(90, 'buy'), 6);
        expect(gapped.account.fills[0].reason).toBe('limit');
    });

    it('triggers a stop when the bar trades up to it', () => {
        const pending = order({ type: 'stop', price: 105 });
        const missed = settleBar({ account: openAccount(), intent: { order: pending }, bar: bar(2_000, 100, 104, 99, 103) });
        expect(missed.intent.order).not.toBeNull();
        const hit = settleBar({ account: openAccount(), intent: { order: pending }, bar: bar(3_000, 100, 105, 99, 104) });
        expect(hit.account.fills[0]).toMatchObject({ reason: 'stop' });
        expect(hit.account.fills[0].price).toBeCloseTo(fillPrice(105, 'buy'), 6);
    });

    it('ignores a bar at or before the bar the order was placed on', () => {
        const same = settleBar({ account: openAccount(), intent: { order: order({ placedAt: 2_000 }) }, bar: bar(2_000, 100, 101, 90, 95) });
        expect(same.account.position).toBeNull();
        expect(same.intent.order).not.toBeNull();
    });

    it('cannot be placed twice: a bar only fills it once', () => {
        const first = settleBar({ account: openAccount(), intent: { order: order() }, bar: bar(3_000, 100, 101, 90, 95) });
        const second = settleBar({ account: first.account, intent: first.intent, bar: bar(4_000, 100, 101, 90, 95) });
        expect(second.account.fills).toHaveLength(1);
        expect(second.fills).toHaveLength(0);
    });

    it('clears an order it cannot afford, with a reason, instead of firing it forever', () => {
        const poor = { ...openAccount(500), cash: 100 };
        const result = settleBar({ account: poor, intent: { order: order({ quantity: 10 }) }, bar: bar(3_000, 100, 101, 90, 95) });
        expect(result.account.position).toBeNull();
        expect(result.intent.order).toBeNull();
        expect(result.rejected).toBe('insufficientFunds');
        expect(result.fills).toHaveLength(0);
    });
});

describe('settleBar — a bracket order (entry, stop and target as one order)', () => {
    const entry = (over: Partial<PendingOrder> = {}): PendingOrder =>
        order({ price: 95, bracket: { stopLoss: 90, takeProfit: 110 }, ...over });

    it('arms the carried bracket on the bar that fills the entry', () => {
        const filled = settleBar({ account: openAccount(), intent: { order: entry() }, bar: bar(3_000, 100, 101, 95, 99) });
        expect(filled.account.position).toMatchObject({ quantity: 10 });
        expect(filled.intent.order).toBeNull();
        expect(filled.intent.bracket).toMatchObject({ stopLoss: 90, takeProfit: 110, placedAt: 3_000 });
    });

    it('cannot take the new position out on the bar that opened it', () => {
        // The fill bar's low is under the stop and its high over the target; neither may fire.
        const filled = settleBar({ account: openAccount(), intent: { order: entry() }, bar: bar(3_000, 100, 115, 80, 99) });
        expect(filled.account.position).toMatchObject({ quantity: 10 });
        expect(filled.fills.filter((fill) => fill.side === 'sell')).toHaveLength(0);
    });

    it('lets a later bar close the position at the stop', () => {
        const filled = settleBar({ account: openAccount(), intent: { order: entry() }, bar: bar(3_000, 100, 101, 95, 99) });
        const next = settleBar({ account: filled.account, intent: filled.intent, bar: bar(4_000, 100, 101, 88, 89) });
        expect(next.account.position).toBeNull();
        expect(next.fills[0]).toMatchObject({ side: 'sell', reason: 'stop' });
        expect(next.intent.bracket).toBeNull();
    });

    it('lets a later bar take the target too', () => {
        const filled = settleBar({ account: openAccount(), intent: { order: entry() }, bar: bar(3_000, 100, 101, 95, 99) });
        const next = settleBar({ account: filled.account, intent: filled.intent, bar: bar(4_000, 100, 112, 99, 111) });
        expect(next.fills[0]).toMatchObject({ side: 'sell', reason: 'target' });
    });

    it('keeps the whole order armed while the entry has not been reached', () => {
        const missed = settleBar({ account: openAccount(), intent: { order: entry() }, bar: bar(2_000, 100, 101, 96, 100) });
        expect(missed.account.position).toBeNull();
        expect(missed.intent.order?.bracket).toMatchObject({ stopLoss: 90, takeProfit: 110 });
    });

    it('drops the order and its bracket when the fill cannot be afforded', () => {
        const poor = { ...openAccount(500), cash: 100 };
        const result = settleBar({ account: poor, intent: { order: entry() }, bar: bar(3_000, 100, 101, 90, 95) });
        expect(result.intent.order).toBeNull();
        expect(result.intent.bracket ?? null).toBeNull();
        expect(result.rejected).toBe('insufficientFunds');
    });

    it('survives a stored session, bracket included', () => {
        const intent: ReplayIntent = { order: entry() };
        const parsed = parseSession(serializeSession({ cursorTime: 3_000, account: openAccount(), intent }));
        expect(parsed?.intent?.order?.bracket).toMatchObject({ stopLoss: 90, takeProfit: 110 });
        // A malformed bracket is dropped with the order rather than crashing the session.
        const broken = parseSession(JSON.stringify({
            cursorTime: 3_000,
            account: openAccount(),
            intent: { order: { ...entry(), bracket: { stopLoss: -1 } } },
        }));
        expect(broken?.intent?.order ?? null).toBeNull();
    });
});

describe('settleBar — a bracket on the open position', () => {
    const bracket = (stopLoss?: number, takeProfit?: number): ReplayIntent => ({ bracket: { stopLoss, takeProfit, placedAt: 1_000 } });

    it('does nothing while the bar stays between the stop and the target', () => {
        const result = settleBar({ account: held(), intent: bracket(95, 110), bar: bar(2_000, 100, 105, 97, 104) });
        expect(result.account.position).toMatchObject({ quantity: 10 });
        expect(result.fills).toHaveLength(0);
    });

    it('sells the whole position at the stop when the bar trades down to it', () => {
        const result = settleBar({ account: held(), intent: bracket(95, 110), bar: bar(2_000, 100, 101, 95, 96) });
        expect(result.account.position).toBeNull();
        expect(result.fills[0]).toMatchObject({ side: 'sell', reason: 'stop', quantity: 10 });
        expect(result.fills[0].price).toBeCloseTo(fillPrice(95, 'sell'), 6);
        expect(result.intent.bracket).toBeNull(); // spent with the position
    });

    it('sells at the target when the bar trades up to it', () => {
        const result = settleBar({ account: held(), intent: bracket(95, 110), bar: bar(2_000, 100, 110, 99, 109) });
        expect(result.account.position).toBeNull();
        expect(result.fills[0]).toMatchObject({ reason: 'target' });
        expect(result.fills[0].price).toBeCloseTo(fillPrice(110, 'sell'), 6);
    });

    it('reports the stop when one bar touches both, the way the strategy lab does', () => {
        const result = settleBar({ account: held(), intent: bracket(95, 110), bar: bar(2_000, 100, 112, 94, 105) });
        expect(result.fills[0].reason).toBe('stop');
    });

    it('fills at the open when the bar gapped past the stop', () => {
        const result = settleBar({ account: held(), intent: bracket(95, 110), bar: bar(2_000, 90, 92, 88, 91) });
        expect(result.fills[0].reason).toBe('stop');
        expect(result.fills[0].price).toBeCloseTo(fillPrice(90, 'sell'), 6);
    });

    it('ignores a bracket set on this very bar, and acts from the next one', () => {
        const same = settleBar({ account: held(), intent: bracket(95, 110), bar: bar(1_000, 100, 112, 94, 105) });
        expect(same.account.position).toMatchObject({ quantity: 10 });
        expect(same.intent.bracket).not.toBeNull();
    });

    it('does nothing at all while the account is flat', () => {
        const result = settleBar({ account: openAccount(), intent: bracket(95, 110), bar: bar(2_000, 100, 112, 94, 105) });
        expect(result.fills).toHaveLength(0);
        expect(result.account.cash).toBe(DEFAULT_STARTING_CASH);
    });
});

describe('the session carries the intent', () => {
    it('round-trips a pending order and a bracket', () => {
        const session = { cursorTime: 1_700_000_000, account: held(), intent: { order: order(), bracket: { stopLoss: 95, takeProfit: 110, placedAt: 1_000 } } };
        const parsed = parseSession(serializeSession(session));
        expect(parsed?.intent?.order).toMatchObject({ id: 'o1', type: 'limit', price: 95, quantity: 10 });
        expect(parsed?.intent?.bracket).toMatchObject({ stopLoss: 95, takeProfit: 110 });
    });

    it('still reads a session stored before orders existed', () => {
        const legacy = JSON.stringify({ cursorTime: 1_700_000_000, account: openAccount() });
        const parsed = parseSession(legacy);
        expect(parsed?.account.cash).toBe(DEFAULT_STARTING_CASH);
        expect(parsed?.intent?.order ?? null).toBeNull();
        expect(parsed?.intent?.bracket ?? null).toBeNull();
    });

    it('drops a malformed intent rather than the whole session', () => {
        const junk = JSON.stringify({
            cursorTime: 1_700_000_000,
            account: openAccount(),
            intent: { order: { type: 'sideways', price: 'free' }, bracket: { stopLoss: 'soon' } },
        });
        const parsed = parseSession(junk);
        expect(parsed?.account.cash).toBe(DEFAULT_STARTING_CASH);
        expect(parsed?.intent?.order ?? null).toBeNull();
        expect(parsed?.intent?.bracket ?? null).toBeNull();
    });
});

describe('the trade log says why', () => {
    it('carries the reason into the CSV in both languages', () => {
        const fills: Fill[] = [
            { id: 'f1', time: 1_700_000_000, side: 'buy', quantity: 10, price: 100, realized: 0, reason: 'limit' },
            { id: 'f2', time: 1_700_086_400, side: 'sell', quantity: 10, price: 95, realized: -50, reason: 'stop' },
        ];
        const [en, ar] = [toCsv(fills, 'en'), toCsv(fills, 'ar')];
        expect(en.split('\n')[0]).toContain('Reason');
        expect(ar.split('\n')[0]).toContain('السبب');
        expect(en).toContain('limit');
        expect(en).toContain('stop');
        expect(ar).toContain('وقف');
    });
});

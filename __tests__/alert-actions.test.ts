import { beforeEach, describe, expect, it, vi } from 'vitest';

// Server actions are public endpoints: these tests pin that alerts are always scoped to the
// signed-in user, never to an id sent by the client. Adapted from #93. The centre added the
// six-condition engine, the edit/re-arm/seen mutations and the on-visit checker; alerts are no
// longer a Cloud-only feature, so the old `alertsEnabled` gate and its tests are gone.

const requireUserId = vi.fn();
vi.mock('@/lib/better-auth/auth', () => ({ requireUserId: () => requireUserId() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/database/mongoose', () => ({ connectToDatabase: vi.fn().mockResolvedValue({}) }));

const find = vi.fn();
const findOne = vi.fn();
const findOneAndDelete = vi.fn();
const findOneAndUpdate = vi.fn();
const create = vi.fn();
const countDocuments = vi.fn().mockResolvedValue(0);
const updateOne = vi.fn();
const updateMany = vi.fn();
const lean = vi.fn();
vi.mock('@/database/models/alert.model', () => ({
    Alert: {
        find: (...args: unknown[]) => {
            find(...args);
            return { lean: (...leanArgs: unknown[]) => lean(...leanArgs) };
        },
        findOne: (...args: unknown[]) => findOne(...args),
        findOneAndDelete: (...args: unknown[]) => findOneAndDelete(...args),
        findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
        create: (...args: unknown[]) => create(...args),
        countDocuments: (...args: unknown[]) => countDocuments(...args),
        updateOne: (...args: unknown[]) => updateOne(...args),
        updateMany: (...args: unknown[]) => updateMany(...args),
    },
}));

// The two price sources the checker routes through; the routing itself is lib/alerts' business.
const getLiveQuotes = vi.fn();
vi.mock('@/lib/actions/finnhub.actions', () => ({ getLiveQuotes: (...args: unknown[]) => getLiveQuotes(...args) }));
const getYahooDailyQuotes = vi.fn();
vi.mock('@/lib/actions/yahoo.actions', () => ({ getYahooDailyQuotes: (...args: unknown[]) => getYahooDailyQuotes(...args) }));
const getAlertCandles = vi.fn();
vi.mock('@/lib/actions/yahoo-candles.actions', () => ({ getAlertCandles: (...args: unknown[]) => getAlertCandles(...args) }));
const alertEventCreate = vi.fn();
vi.mock('@/database/models/alert-event.model', () => ({
    AlertEvent: { create: (...args: unknown[]) => alertEventCreate(...args) },
}));

import {
    checkAlerts,
    createAlert,
    deleteAlert,
    markAlertsSeen,
    rearmAlert,
    updateAlert,
} from '@/lib/actions/alert.actions';

beforeEach(() => {
    vi.clearAllMocks();
    requireUserId.mockResolvedValue('user-123');
    create.mockImplementation(async (doc: unknown) => doc);
    countDocuments.mockResolvedValue(0);
    findOne.mockResolvedValue(null);
    findOneAndDelete.mockResolvedValue({ _id: 'alert-1', userId: 'user-123' });
    findOneAndUpdate.mockResolvedValue({ _id: 'alert-1', userId: 'user-123' });
    updateOne.mockResolvedValue({ matchedCount: 1 });
    updateMany.mockResolvedValue({ matchedCount: 1 });
    lean.mockResolvedValue([]);
    getLiveQuotes.mockResolvedValue({});
    getYahooDailyQuotes.mockResolvedValue({});
    getAlertCandles.mockResolvedValue(null);
    alertEventCreate.mockResolvedValue({});
});

describe('alert actions are scoped to the session user', () => {
    it('caps active alerts per user, counting only that user’s', async () => {
        countDocuments.mockResolvedValueOnce(50);
        await expect(createAlert({ symbol: 'AAPL', targetPrice: 200, condition: 'ABOVE' })).rejects.toThrow('limit');
        expect(countDocuments).toHaveBeenCalledWith({ userId: 'user-123', active: true });
        expect(create).not.toHaveBeenCalled();
    });

    it('deletes the user’s own alert', async () => {
        await expect(deleteAlert('alert-1')).resolves.toEqual({ success: true });
        expect(findOneAndDelete).toHaveBeenCalledWith({ _id: 'alert-1', userId: 'user-123' });
    });

    it('rejects signed-out calls before touching the database', async () => {
        requireUserId.mockRejectedValue(new Error('Unauthorized'));
        await expect(deleteAlert('alert-1')).rejects.toThrow('Unauthorized');
        expect(findOneAndDelete).not.toHaveBeenCalled();
    });

    it('cannot delete another user’s alert: the query always carries the session user', async () => {
        findOneAndDelete.mockResolvedValue(null); // someone else's alert matches nothing
        await deleteAlert('alert-of-someone-else');
        expect(findOneAndDelete).toHaveBeenCalledWith({ _id: 'alert-of-someone-else', userId: 'user-123' });
    });

    it('creates alerts for the session user, ignoring any userId sent by the client', async () => {
        await createAlert({ symbol: 'AAPL', targetPrice: 200, condition: 'ABOVE', userId: 'attacker' } as never);
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-123', symbol: 'AAPL' }));
    });

    it('edits and re-arms through the session user, never a client id', async () => {
        findOne.mockResolvedValue({
            _id: 'alert-1',
            userId: 'user-123',
            symbol: 'AAPL',
            condition: 'ABOVE',
            targetPrice: 200,
            active: true,
            triggered: false,
        });
        await updateAlert('alert-1', { targetPrice: 210 });
        expect(findOne).toHaveBeenCalledWith({ _id: 'alert-1', userId: 'user-123' });
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'alert-1', userId: 'user-123' },
            expect.objectContaining({ targetPrice: 210 }),
            { new: true },
        );

        await rearmAlert('alert-1');
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'alert-1', userId: 'user-123' },
            expect.objectContaining({ triggered: false, active: true }),
            { new: true },
        );
    });

    it('marks only the signed-in user’s fired alerts as seen', async () => {
        await markAlertsSeen();
        expect(updateMany).toHaveBeenCalledWith({ userId: 'user-123', seen: false, triggered: true }, { seen: true });
    });

    it('reads only the session user’s live rules when checking', async () => {
        await checkAlerts();
        expect(find).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'user-123', active: true, triggered: false }),
        );
    });
});

describe('alerts work without OpenStock Cloud', () => {
    it('creates a watchlist-only alert with no realtime flag involved', async () => {
        // The demo has no realtime mode, no cron and no mailer: creating must still succeed.
        await createAlert({ symbol: '2222', targetPrice: 30, condition: 'CROSS_UP' });
        expect(create).toHaveBeenCalledWith({
            userId: 'user-123',
            symbol: '2222.SR',
            targetPrice: 30,
            condition: 'CROSS_UP',
            params: {},
            rules: [{ condition: 'CROSS_UP', targetPrice: 30, params: {} }],
            join: 'and',
            active: true,
        });
    });

    it('prices the demo’s Tadawul rules through Yahoo', async () => {
        lean.mockResolvedValue([
            { _id: 'a1', userId: 'user-123', symbol: '2222.SR', condition: 'ABOVE', targetPrice: 25, lastPrice: null },
        ]);
        getYahooDailyQuotes.mockResolvedValue({ '2222.SR': { price: 26, changePercent: 1.2 } });

        const result = await checkAlerts();
        expect(getYahooDailyQuotes).toHaveBeenCalledWith(['2222.SR']);
        expect(result.checked).toBe(1);
        expect(result.fired).toHaveLength(1);
        expect(result.fired[0]).toMatchObject({ symbol: '2222.SR', price: 26 });
    });
});

describe('updateAlert can change what a rule watches', () => {
    const base = {
        _id: 'alert-1',
        userId: 'user-123',
        symbol: 'AAPL',
        condition: 'ABOVE' as const,
        targetPrice: 200,
        params: {},
        rules: [{ condition: 'ABOVE' as const, targetPrice: 200, params: {}, lastValue: 190 }],
        active: true,
        triggered: true,
        triggeredAt: new Date(),
        triggeredPrice: 201,
        seen: false,
    };

    it('moves the rule to another symbol and clears the stale cross and firing', async () => {
        findOne.mockResolvedValue({ ...base });
        await updateAlert('alert-1', { symbol: 'MSFT' });
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'alert-1', userId: 'user-123' },
            expect.objectContaining({
                symbol: 'MSFT',
                lastPrice: null,
                triggered: false,
                triggeredAt: null,
                triggeredPrice: null,
                seen: false,
                rules: [expect.objectContaining({ condition: 'ABOVE', targetPrice: 200, lastValue: null })],
            }),
            { new: true },
        );
    });

    it('normalises a lowercase symbol before storing it', async () => {
        findOne.mockResolvedValue({ ...base });
        await updateAlert('alert-1', { symbol: ' msft ' });
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'alert-1', userId: 'user-123' },
            expect.objectContaining({ symbol: 'MSFT' }),
            { new: true },
        );
    });

    it('keeps rules[0] in step with the document’s own fields', async () => {
        findOne.mockResolvedValue({ ...base });
        await updateAlert('alert-1', { condition: 'BELOW', targetPrice: 180 });
        const update = findOneAndUpdate.mock.calls.at(-1)?.[1] as { rules: unknown[] };
        expect(update.rules[0]).toMatchObject({ condition: 'BELOW', targetPrice: 180, lastValue: null });
    });

    it('refuses a symbol the app cannot price', async () => {
        findOne.mockResolvedValue({ ...base });
        await expect(updateAlert('alert-1', { symbol: 'RELIANCE.NS' })).rejects.toThrow('unsupportedSymbol');
        expect(findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('refuses to move a drawing alert, whose line belongs to one chart', async () => {
        findOne.mockResolvedValue({
            ...base,
            condition: 'DRAWING_CROSS_UP',
            targetPrice: 150,
            anchor: { price: 150, at: new Date() },
            rules: [{ condition: 'DRAWING_CROSS_UP', targetPrice: 150, params: {} }],
        });
        await expect(updateAlert('alert-1', { symbol: 'MSFT' })).rejects.toThrow('invalidAnchor');
        expect(findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('drops the anchor when a drawing rule becomes a price rule', async () => {
        findOne.mockResolvedValue({
            ...base,
            condition: 'DRAWING_CROSS_UP',
            targetPrice: 150,
            anchor: { price: 150, at: new Date() },
            rules: [{ condition: 'DRAWING_CROSS_UP', targetPrice: 150, params: {} }],
        });
        await updateAlert('alert-1', { condition: 'ABOVE', targetPrice: 160 });
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'alert-1', userId: 'user-123' },
            expect.objectContaining({ condition: 'ABOVE', anchor: null, lastGap: null }),
            { new: true },
        );
    });
});

describe('createAlert validates untrusted input', () => {
    it('refuses a symbol the app cannot price, markup included', async () => {
        await expect(createAlert({ symbol: '<img src=x>', targetPrice: 1, condition: 'ABOVE' })).rejects.toThrow('unsupportedSymbol');
        await expect(createAlert({ symbol: 'RELIANCE.NS', targetPrice: 1000, condition: 'ABOVE' })).rejects.toThrow('unsupportedSymbol');
        expect(create).not.toHaveBeenCalled();
    });

    it('refuses unknown conditions and impossible targets', async () => {
        await expect(createAlert({ symbol: 'AAPL', targetPrice: 1, condition: 'SIDEWAYS' as never })).rejects.toThrow('invalidCondition');
        await expect(createAlert({ symbol: 'AAPL', targetPrice: 0, condition: 'ABOVE' })).rejects.toThrow('invalidTarget');
        await expect(createAlert({ symbol: 'AAPL', targetPrice: 101, condition: 'CHANGE_UP' })).rejects.toThrow('invalidTarget');
        expect(create).not.toHaveBeenCalled();
    });

    it('stores only validated fields, so callers cannot pre-trigger or extend an alert', async () => {
        await createAlert({ symbol: ' brk.b ', targetPrice: 400, condition: 'BELOW', triggered: true, expiresAt: new Date(2100, 0) } as never);
        expect(create).toHaveBeenCalledWith({
            userId: 'user-123',
            symbol: 'BRK.B',
            targetPrice: 400,
            condition: 'BELOW',
            params: {},
            rules: [{ condition: 'BELOW', targetPrice: 400, params: {} }],
            join: 'and',
            active: true,
        });
    });

    it('clears the remembered price when the condition changes, so a stale cross cannot fire', async () => {
        findOne.mockResolvedValue({
            _id: 'alert-1',
            userId: 'user-123',
            condition: 'ABOVE',
            targetPrice: 200,
            active: true,
            triggered: false,
        });
        await updateAlert('alert-1', { condition: 'CROSS_UP' });
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'alert-1', userId: 'user-123' },
            expect.objectContaining({ condition: 'CROSS_UP', lastPrice: null }),
            { new: true },
        );
    });
});

describe('pause, resume and re-arm keep the cross baseline honest', () => {
    const stored = (over: Record<string, unknown> = {}) => ({
        _id: 'alert-1',
        userId: 'user-123',
        condition: 'CROSS_UP',
        targetPrice: 200,
        active: true,
        triggered: false,
        lastPrice: 190,
        ...over,
    });

    it('pausing and resuming a watching rule does not wipe the price a cross compares against', async () => {
        findOne.mockResolvedValue(stored());
        await updateAlert('alert-1', { active: false });
        expect(findOneAndUpdate).toHaveBeenLastCalledWith(
            { _id: 'alert-1', userId: 'user-123' },
            expect.objectContaining({ active: false }),
            { new: true },
        );
        expect(findOneAndUpdate.mock.calls.at(-1)?.[1]).not.toHaveProperty('lastPrice');

        await updateAlert('alert-1', { active: true });
        expect(findOneAndUpdate.mock.calls.at(-1)?.[1]).not.toHaveProperty('lastPrice');
    });

    it('reactivating a fired rule re-arms it, exactly as the re-arm button does', async () => {
        findOne.mockResolvedValue(stored({ condition: 'ABOVE', triggered: true, active: false }));
        await updateAlert('alert-1', { active: true });
        expect(findOneAndUpdate.mock.calls.at(-1)?.[1]).toEqual(
            expect.objectContaining({
                active: true,
                triggered: false,
                triggeredAt: null,
                triggeredPrice: null,
                seen: false,
                lastPrice: null,
            }),
        );
    });

    it('re-arm clears the whole firing, not only the flag', async () => {
        await rearmAlert('alert-1');
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'alert-1', userId: 'user-123' },
            { triggered: false, triggeredAt: null, triggeredPrice: null, seen: false, lastPrice: null, active: true },
            { new: true },
        );
    });

    it('refuses a re-arm that matches nothing (another user’s id)', async () => {
        findOneAndUpdate.mockResolvedValue(null);
        await expect(rearmAlert('alert-of-someone-else')).rejects.toThrow('notFound');
    });
});

describe('checkAlerts', () => {
    it('never reads a failed quote as zero: the rule is skipped and keeps its state', async () => {
        lean.mockResolvedValue([
            { _id: 'a1', userId: 'user-123', symbol: 'AAPL', condition: 'ABOVE', targetPrice: 300, lastPrice: 12 },
        ]);
        getLiveQuotes.mockResolvedValue({ AAPL: null });

        const result = await checkAlerts();
        expect(result.checked).toBe(0);
        expect(result.fired).toHaveLength(0);
        expect(findOneAndUpdate).not.toHaveBeenCalled();
        expect(updateOne).not.toHaveBeenCalled();
    });

    it('claims a firing atomically, closes the rule and records the price; a losing tab learns nothing', async () => {
        lean.mockResolvedValue([
            { _id: 'a1', userId: 'user-123', symbol: 'AAPL', condition: 'ABOVE', targetPrice: 100, lastPrice: null },
        ]);
        getLiveQuotes.mockResolvedValue({ AAPL: { c: 101, dp: 1.5 } });
        findOneAndUpdate.mockResolvedValue({ _id: 'a1' }); // this tab won the claim

        const result = await checkAlerts();
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'a1', triggered: false, active: true },
            {
                $set: expect.objectContaining({
                    triggered: true,
                    active: false,
                    triggeredPrice: 101,
                    lastPrice: 101,
                    seen: false,
                }),
            },
            { new: true },
        );
        expect(result.fired).toHaveLength(1);

        findOneAndUpdate.mockResolvedValue(null); // the other tab already claimed it
        const second = await checkAlerts();
        expect(second.fired).toHaveLength(0);
    });

    it('advances the remembered price on a miss, so a cross has something to compare to', async () => {
        lean.mockResolvedValue([
            { _id: 'a1', userId: 'user-123', symbol: 'AAPL', condition: 'CROSS_UP', targetPrice: 200, lastPrice: null },
        ]);
        getLiveQuotes.mockResolvedValue({ AAPL: { c: 150, dp: -0.5 } });

        const result = await checkAlerts();
        expect(result.fired).toHaveLength(0);
        expect(updateOne).toHaveBeenCalledWith(
            { _id: 'a1', triggered: false },
            { $set: { 'rules.0.lastValue': 150, lastPrice: 150 } },
        );
    });

    it('counts rules it could not price as not checked, and still prices the rest', async () => {
        lean.mockResolvedValue([
            { _id: 'a1', userId: 'user-123', symbol: 'AAPL', condition: 'ABOVE', targetPrice: 300, lastPrice: null },
            { _id: 'a2', userId: 'user-123', symbol: '2222.SR', condition: 'ABOVE', targetPrice: 25, lastPrice: null },
        ]);
        getLiveQuotes.mockResolvedValue({ AAPL: null }); // Finnhub answered nothing for AAPL
        getYahooDailyQuotes.mockResolvedValue({ '2222.SR': { price: 26, changePercent: 1 } });

        const result = await checkAlerts();
        expect(result.checked).toBe(1);
        expect(result.skipped).toBe(1);
        expect(result.fired.map((alert) => alert.symbol)).toEqual(['2222.SR']);
    });
});

describe('indicator rules in the actions', () => {
    const candlesFor = (closes: number[], volumes?: number[]) => ({
        currency: 'SAR',
        candles: closes.map((close, i) => ({ time: i * 86_400, open: close, high: close, low: close, close, volume: volumes?.[i] ?? 1_000 })),
    });
    const falling = (n: number) => Array.from({ length: n }, (_, i) => 100 - i);

    it('stores the second number a rule needs, with its default when it is left out', async () => {
        await createAlert({ symbol: 'AAPL', targetPrice: 30, condition: 'RSI_BELOW' });
        expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ condition: 'RSI_BELOW', params: { period: 14 } }));

        await createAlert({ symbol: 'AAPL', targetPrice: 30, condition: 'RSI_BELOW', params: { period: 21 } });
        expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ params: { period: 21 } }));

        await createAlert({ symbol: 'AAPL', targetPrice: 2, condition: 'VOLUME_SPIKE', params: { window: 50 } });
        expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ params: { window: 50 } }));

        await createAlert({ symbol: 'AAPL', targetPrice: 50, condition: 'PRICE_CROSS_UP_SMA' });
        expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ condition: 'PRICE_CROSS_UP_SMA', params: {} }));
    });

    it('refuses a second number outside its range and a rule with no candle source', async () => {
        await expect(createAlert({ symbol: 'AAPL', targetPrice: 30, condition: 'RSI_BELOW', params: { period: 1 } })).rejects.toThrow('invalidTarget');
        await expect(createAlert({ symbol: 'AAPL', targetPrice: 2, condition: 'VOLUME_SPIKE', params: { window: 4 } })).rejects.toThrow('invalidTarget');
        // A Binance pair has a Finnhub quote but no daily candle series.
        await expect(createAlert({ symbol: 'BINANCE:BTCUSDT', targetPrice: 30, condition: 'RSI_BELOW' })).rejects.toThrow('unsupportedSymbol');
        // The same pair is still fine for a quote rule.
        await createAlert({ symbol: 'BINANCE:BTCUSDT', targetPrice: 30, condition: 'ABOVE' });
        expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ symbol: 'BINANCE:BTCUSDT', condition: 'ABOVE' }));
    });

    it('fetches candles once per symbol, and only for the rules that measure a series', async () => {
        lean.mockResolvedValue([
            { _id: 'a1', userId: 'user-123', symbol: '2222.SR', condition: 'RSI_BELOW', targetPrice: 70, params: {}, lastPrice: null },
            { _id: 'a2', userId: 'user-123', symbol: '2222.SR', condition: 'VOLUME_SPIKE', targetPrice: 2, params: { window: 20 }, lastPrice: null },
            { _id: 'a3', userId: 'user-123', symbol: 'AAPL', condition: 'ABOVE', targetPrice: 100, params: {}, lastPrice: null },
        ]);
        getAlertCandles.mockResolvedValue(candlesFor(falling(30), [...Array(29).fill(1_000), 5_000]));
        getLiveQuotes.mockResolvedValue({ AAPL: { c: 101, dp: 1 } });

        const result = await checkAlerts();
        expect(getAlertCandles).toHaveBeenCalledTimes(1); // two rules on 2222.SR, one call
        expect(getAlertCandles).toHaveBeenCalledWith('2222.SR');
        expect(getLiveQuotes).toHaveBeenCalledWith(['AAPL']);
        expect(getYahooDailyQuotes).not.toHaveBeenCalled(); // a series rule needs no quote
        expect(result.checked).toBe(3);
        expect(result.fired.map((alert) => alert.id).sort()).toEqual(['a1', 'a2', 'a3']);
        // The firing records what the rule measured, not a price.
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'a1', triggered: false, active: true },
            { $set: expect.objectContaining({ triggeredPrice: 0, lastPrice: 0 }) },
            { new: true },
        );
    });

    it('skips a series rule whose candles never arrive, and does not touch its state', async () => {
        lean.mockResolvedValue([
            { _id: 'a1', userId: 'user-123', symbol: '2222.SR', condition: 'RSI_BELOW', targetPrice: 70, params: {}, lastPrice: 12 },
        ]);
        getAlertCandles.mockResolvedValue(null);

        const result = await checkAlerts();
        expect(result.checked).toBe(0);
        expect(result.skipped).toBe(1);
        expect(findOneAndUpdate).not.toHaveBeenCalled();
        expect(updateOne).not.toHaveBeenCalled();
    });
});

describe('alert groups in the actions', () => {
    it('stores extra rules and the join, mirroring the first rule on the document', async () => {
        await createAlert({
            symbol: 'AAPL',
            condition: 'ABOVE',
            targetPrice: 200,
            rules: [{ condition: 'RSI_BELOW', targetPrice: 30, params: { period: 14 } }],
            join: 'and',
        });
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            condition: 'ABOVE',
            targetPrice: 200,
            join: 'and',
            rules: [
                { condition: 'ABOVE', targetPrice: 200, params: {} },
                { condition: 'RSI_BELOW', targetPrice: 30, params: { period: 14 } },
            ],
        }));
    });

    it('refuses a sixth rule and a text rule with an invalid formula', async () => {
        const many = Array.from({ length: 5 }, () => ({ condition: 'ABOVE' as const, targetPrice: 100 }));
        await expect(createAlert({ symbol: 'AAPL', condition: 'ABOVE', targetPrice: 100, rules: many })).rejects.toThrow('tooManyRules');
        await expect(createAlert({
            symbol: 'AAPL',
            condition: 'FORMULA',
            targetPrice: 0,
            params: { expression: 'close >' },
        })).rejects.toThrow('invalidTarget');
        expect(create).not.toHaveBeenCalled();
    });

    it('stores a formula with no number, and a strategy as a full object', async () => {
        await createAlert({
            symbol: 'AAPL',
            condition: 'FORMULA',
            targetPrice: 0,
            params: { expression: 'close > sma(close, 20)' },
        });
        expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
            condition: 'FORMULA',
            targetPrice: 0,
            params: { expression: 'close > sma(close, 20)' },
        }));

        const strategy = {
            id: 's1', name: 'Mine', entry: 'close > 0', exit: 'close < 0',
            params: [], stopPct: 5, targetPct: 0, trailingPct: 0, riskPct: 0, direction: 'long' as const,
        };
        await createAlert({ symbol: 'AAPL', condition: 'STRATEGY', targetPrice: 0, params: { strategy } });
        expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ condition: 'STRATEGY', params: { strategy } }));
    });

    it('fires an AND group only when every rule is true, and records the event once', async () => {
        lean.mockResolvedValue([
            {
                _id: 'a1', userId: 'user-123', symbol: 'AAPL', condition: 'ABOVE', targetPrice: 100,
                join: 'and',
                rules: [
                    { condition: 'ABOVE', targetPrice: 100, params: {} },
                    { condition: 'ABOVE', targetPrice: 200, params: {} },
                ],
            },
        ]);
        getLiveQuotes.mockResolvedValue({ AAPL: { c: 250, dp: 1 } });

        const result = await checkAlerts();
        expect(result.fired).toHaveLength(1);
        expect(result.fired[0]).toMatchObject({ id: 'a1', symbol: 'AAPL', join: 'and', rules: 2 });
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'a1', triggered: false, active: true },
            expect.objectContaining({ $set: expect.objectContaining({ triggered: true }) }),
            { new: true },
        );
        expect(alertEventCreate).toHaveBeenCalledWith(expect.objectContaining({
            alertId: 'a1',
            symbol: 'AAPL',
            join: 'and',
            rules: 2,
        }));
    });

    it('does not fire an AND group when one rule is false, and remembers the rules it read', async () => {
        lean.mockResolvedValue([
            {
                _id: 'a1', userId: 'user-123', symbol: 'AAPL', condition: 'ABOVE', targetPrice: 100,
                join: 'and',
                rules: [
                    { condition: 'ABOVE', targetPrice: 100, params: {} },
                    { condition: 'ABOVE', targetPrice: 300, params: {} },
                ],
            },
        ]);
        getLiveQuotes.mockResolvedValue({ AAPL: { c: 250, dp: 1 } });

        const result = await checkAlerts();
        expect(result.fired).toHaveLength(0);
        expect(updateOne).toHaveBeenCalledWith(
            { _id: 'a1', triggered: false },
            { $set: { 'rules.0.lastValue': 250, lastPrice: 250 } },
        );
        expect(updateOne).toHaveBeenCalledWith(
            { _id: 'a1', triggered: false },
            { $set: { 'rules.1.lastValue': 250 } },
        );
    });

    it('fires an OR group as soon as one rule is true', async () => {
        lean.mockResolvedValue([
            {
                _id: 'a1', userId: 'user-123', symbol: 'AAPL', condition: 'ABOVE', targetPrice: 300,
                join: 'or',
                rules: [
                    { condition: 'ABOVE', targetPrice: 300, params: {} },
                    { condition: 'ABOVE', targetPrice: 100, params: {} },
                ],
            },
        ]);
        getLiveQuotes.mockResolvedValue({ AAPL: { c: 250, dp: 1 } });

        const result = await checkAlerts();
        expect(result.fired).toHaveLength(1);
        expect(result.fired[0].join).toBe('or');
    });
});

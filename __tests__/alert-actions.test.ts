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
        expect(create).toHaveBeenCalledWith({ userId: 'user-123', symbol: '2222.SR', targetPrice: 30, condition: 'CROSS_UP', active: true });
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
        expect(create).toHaveBeenCalledWith({ userId: 'user-123', symbol: 'BRK.B', targetPrice: 400, condition: 'BELOW', active: true });
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
        expect(updateOne).toHaveBeenCalledWith({ _id: 'a1', triggered: false }, { $set: { lastPrice: 150 } });
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

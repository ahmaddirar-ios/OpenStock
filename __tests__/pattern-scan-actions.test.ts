import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/actions/yahoo-candles.actions', () => ({
    getStrategyCandles: vi.fn(),
}));

import { getStrategyCandles } from '@/lib/actions/yahoo-candles.actions';
import { scanPatternBatch } from '@/lib/actions/pattern-scan.actions';
import { pivotOptionsFor } from '@/lib/pattern-scan';
import { SCAN_BATCH } from '@/lib/pattern-scan';

const candles = (waypoints: number[]) => {
    const closes: number[] = [];
    for (let i = 0; i < waypoints.length - 1; i += 1) {
        for (let step = 0; step < 5; step += 1) closes.push(waypoints[i] + ((waypoints[i + 1] - waypoints[i]) * step) / 5);
    }
    closes.push(waypoints[waypoints.length - 1]);
    return closes.map((close, index) => ({ time: 1_000 + index * 60, open: close, high: close + 0.4, low: close - 0.4, close, volume: 100 }));
};

const wave = candles([100, 95, 120, 90, 108, 78, 95]);

beforeEach(() => vi.mocked(getStrategyCandles).mockReset());

describe('pivotOptionsFor', () => {
    it('maps ATR to the ATR mode and a percentage to the percent mode', () => {
        expect(pivotOptionsFor('atr')).toEqual({ mode: 'atr' });
        expect(pivotOptionsFor('0.03')).toEqual({ mode: 'percent', percent: 0.03 });
    });
});

describe('scanPatternBatch', () => {
    it('answers per symbol and counts only the symbols that came back', async () => {
        vi.mocked(getStrategyCandles).mockImplementation(async (symbol: string) =>
            symbol === 'GOOD' ? { candles: wave } as never : null);
        const result = await scanPatternBatch(['GOOD', 'EMPTY'], ['wolfe'], '1d', '0.03');
        expect(result.requested).toBe(2);
        expect(result.answered).toBe(1);
        expect(result.results.find((row) => row.symbol === 'GOOD')?.hits[0].pattern).toBe('wolfe');
        expect(result.results.find((row) => row.symbol === 'EMPTY')?.hits).toEqual([]);
    });

    it('treats a throwing symbol as a miss, not a failed scan', async () => {
        vi.mocked(getStrategyCandles).mockImplementation(async (symbol: string) => {
            if (symbol === 'BOOM') throw new Error('nope');
            return { candles: wave } as never;
        });
        const result = await scanPatternBatch(['BOOM', 'GOOD'], ['wolfe'], '1d', '0.03');
        expect(result.answered).toBe(1);
        expect(result.results).toHaveLength(2);
    });

    it('caps the list at twice the batch size', async () => {
        vi.mocked(getStrategyCandles).mockResolvedValue({ candles: wave } as never);
        const many = Array.from({ length: SCAN_BATCH * 5 }, (_, i) => `S${i}`);
        await scanPatternBatch(many, ['wolfe'], '1d', '0.03');
        expect(vi.mocked(getStrategyCandles).mock.calls.length).toBe(SCAN_BATCH * 2);
    });

    it('asks for nothing when the symbol list is empty', async () => {
        const result = await scanPatternBatch([], ['wolfe'], '1d', '0.03');
        expect(result).toEqual({ results: [], answered: 0, requested: 0 });
        expect(vi.mocked(getStrategyCandles)).not.toHaveBeenCalled();
    });
});
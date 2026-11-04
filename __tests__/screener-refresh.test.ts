import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/actions/screener.actions', () => ({ refreshScreenerBatch: vi.fn() }));

import { refreshScreenerBatch } from '@/lib/actions/screener.actions';
import { runRefresh, type RefreshState } from '@/components/screener/runRefresh';

const mocked = vi.mocked(refreshScreenerBatch);

/** Collects the progress the button would draw. */
const recorder = () => {
    const states: RefreshState[] = [];
    return { states, onProgress: (state: RefreshState) => states.push(state) };
};

beforeEach(() => {
    mocked.mockReset();
});

describe('screener refresh walk', () => {
    it('walks the universe to the end', async () => {
        mocked
            .mockResolvedValueOnce({ processed: 24, next: 24, total: 48, priced: 20 })
            .mockResolvedValueOnce({ processed: 24, next: 48, total: 48, priced: 18 });
        const { states, onProgress } = recorder();

        await runRefresh(onProgress);

        expect(mocked).toHaveBeenCalledTimes(2);
        const last = states[states.length - 1];
        expect(last).toEqual({ done: 48, total: 48, priced: 38, running: false });
    });

    it('retries a batch once and keeps the numbers it does get', async () => {
        mocked
            .mockRejectedValueOnce(new Error('backend unavailable'))
            .mockResolvedValueOnce({ processed: 24, next: 24, total: 48, priced: 20 })
            .mockResolvedValueOnce({ processed: 24, next: 48, total: 48, priced: 18 });
        const { states, onProgress } = recorder();

        await runRefresh(onProgress);

        expect(mocked).toHaveBeenCalledTimes(3);
        expect(states[states.length - 1].priced).toBe(38);
    });

    it('skips a batch that will not answer and still finishes', async () => {
        mocked
            .mockRejectedValueOnce(new Error('down')).mockRejectedValueOnce(new Error('down'))
            .mockResolvedValueOnce({ processed: 24, next: 48, total: 72, priced: 24 })
            .mockResolvedValueOnce({ processed: 24, next: 72, total: 72, priced: 24 });
        const { states, onProgress } = recorder();

        await runRefresh(onProgress);

        const last = states[states.length - 1];
        expect(last.running).toBe(false);
        expect(last.done).toBe(72);
        expect(last.priced).toBe(48);
    });

    it('never leaves the button spinning, even when every batch fails', async () => {
        mocked.mockRejectedValue(new Error('down'));
        const { states, onProgress } = recorder();

        await runRefresh(onProgress, () => states.length > 6);

        expect(states[states.length - 1].running).toBe(false);
    });

    it('stops when the caller cancels', async () => {
        mocked.mockResolvedValue({ processed: 24, next: 24, total: 96, priced: 24 });
        const { states, onProgress } = recorder();

        await runRefresh(onProgress, () => states.length >= 1);

        expect(mocked).toHaveBeenCalledTimes(1);
        expect(states[states.length - 1].running).toBe(false);
    });
});

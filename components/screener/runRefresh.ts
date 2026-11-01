"use client";

import { refreshScreenerBatch } from '@/lib/actions/screener.actions';

export type RefreshState = { done: number; total: number; priced: number; running: boolean };

/**
 * Walks the whole universe in bounded batches, so no single request runs long. `onProgress` is
 * called after every batch; resolves when the last one is done or `isCancelled()` turns true.
 */
export async function runRefresh(onProgress: (state: RefreshState) => void, isCancelled: () => boolean = () => false): Promise<void> {
    let offset = 0;
    let priced = 0;
    let total = 0;
    while (!isCancelled()) {
        const result = await refreshScreenerBatch(offset, 40);
        offset = result.next;
        total = result.total;
        priced += result.priced;
        onProgress({ done: offset, total, priced, running: true });
        if (result.processed === 0 || offset >= result.total) break;
    }
    onProgress({ done: offset, total, priced, running: false });
}

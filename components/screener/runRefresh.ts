"use client";

import { refreshScreenerBatch } from '@/lib/actions/screener.actions';

export type RefreshState = { done: number; total: number; priced: number; running: boolean };

/**
 * Walks the whole universe in bounded batches, so no single request runs long. `onProgress` is
 * called after every batch; resolves when the last one is done or `isCancelled()` turns true.
 *
 * One batch can fail on its own: a server action is a network call, and a dropped response used to
 * abort the whole walk and leave the button spinning until a reload. A failure is retried once, and
 * a batch that still will not answer is skipped — the rest of the table is worth more than a
 * perfect one, and the trader can press refresh again.
 */
export async function runRefresh(onProgress: (state: RefreshState) => void, isCancelled: () => boolean = () => false): Promise<void> {
    let offset = 0;
    let priced = 0;
    let total = 0;
    let step = 40;
    try {
        while (!isCancelled()) {
            let result: Awaited<ReturnType<typeof refreshScreenerBatch>> | null = null;
            try {
                result = await refreshScreenerBatch(offset, 40);
            } catch {
                try {
                    result = await refreshScreenerBatch(offset, 40);
                } catch {
                    // Still no answer: step over this slice and keep walking.
                    offset += step;
                    onProgress({ done: offset, total, priced, running: true });
                    continue;
                }
            }
            step = Math.max(1, result.next - offset);
            // A batch that does not move the cursor forward would spin here forever.
            if (result.next <= offset) break;
            offset = result.next;
            total = result.total;
            priced += result.priced;
            onProgress({ done: offset, total, priced, running: true });
            if (result.processed === 0 || offset >= result.total) break;
        }
    } finally {
        // Whatever happened, the button stops spinning: a stuck "Refreshing…" is worse than a
        // half-filled table the trader can refresh again.
        onProgress({ done: offset, total, priced, running: false });
    }
}

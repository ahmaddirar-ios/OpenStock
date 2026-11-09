// @vitest-environment jsdom
// The scanner's control room: the controls and the empty state before a scan, one row per hit, a
// progress line while the batches run, the ceiling notice, and the cancellation contract — a batch
// that lands after the scan was stopped must change nothing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@/lib/actions/pattern-scan.actions', () => ({ scanPatternBatch: vi.fn() }));

import { scanPatternBatch } from '@/lib/actions/pattern-scan.actions';
import PatternScanner from '@/components/scanner/PatternScanner';
import { MAX_SCAN_SYMBOLS, SCAN_BATCH } from '@/lib/pattern-scan';
import { tx } from '@/lib/i18n';
import type { PatternHit } from '@/lib/patterns';

const label = (key: Parameters<typeof tx>[1]) => tx('en', key);

const hit: PatternHit = {
    pattern: 'wolfe',
    direction: 'bullish',
    tool: 'wolfe',
    points: [
        { time: 1, price: 100 }, { time: 2, price: 120 }, { time: 3, price: 90 },
        { time: 4, price: 108 }, { time: 5, price: 78 },
    ],
    labels: ['1', '2', '3', '4', '5'],
    invalidation: 78,
    target: 95,
    confirmed: true,
    foundAt: 5,
};

/** More than one batch of symbols, so a scan has a second call to land. */
const many = Array.from({ length: SCAN_BATCH + 1 }, (_, i) => `S${i}`);

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
};

afterEach(() => {
    cleanup();
    vi.mocked(scanPatternBatch).mockReset();
});

describe('PatternScanner', () => {
    it('shows the controls, and the empty state before the first scan', () => {
        render(<PatternScanner lang="en" universe={{ watchlist: ['2222.SR'], saudi: [], us: [] }} names={{ '2222.SR': 'أرامكو' }} />);
        expect(screen.getByRole('button', { name: label('scan.run') })).toBeTruthy();
        expect((screen.getByRole('radio', { name: label('scan.universe.watchlist') }) as HTMLInputElement).checked).toBe(true);
        expect(screen.getByText(label('scan.empty'))).toBeTruthy();
    });

    it('renders one row per hit with its pattern name, direction and state', async () => {
        vi.mocked(scanPatternBatch).mockResolvedValue({ results: [{ symbol: '2222.SR', hits: [hit] }], answered: 1, requested: 1 });
        render(<PatternScanner lang="en" universe={{ watchlist: ['2222.SR'], saudi: [], us: [] }} names={{ '2222.SR': 'أرامكو' }} />);
        fireEvent.click(screen.getByRole('button', { name: label('scan.run') }));

        const table = await screen.findByRole('table');
        expect(within(table).getByText(label('scan.pattern.wolfe'))).toBeTruthy();
        expect(within(table).getByText(label('scan.direction.bullish'))).toBeTruthy();
        expect(within(table).getByText(label('scan.state.confirmed'))).toBeTruthy();
        expect(within(table).getByText('2222.SR')).toBeTruthy();
        expect(within(table).getByText('أرامكو')).toBeTruthy();
    });

    it('reports progress while the batches run', async () => {
        vi.mocked(scanPatternBatch).mockResolvedValue({ results: [], answered: 1, requested: 1 });
        render(<PatternScanner lang="en" universe={{ watchlist: [], saudi: [], us: many }} names={{}} />);
        fireEvent.click(screen.getByRole('button', { name: label('scan.run') }));

        expect(await screen.findByText(label('scan.progress').replace('{done}', '9').replace('{total}', '9'))).toBeTruthy();
        expect(vi.mocked(scanPatternBatch).mock.calls.length).toBe(2);
    });

    it('stops at the ceiling and says so', () => {
        const us = Array.from({ length: MAX_SCAN_SYMBOLS + 10 }, (_, i) => `S${i}`);
        render(<PatternScanner lang="en" universe={{ watchlist: [], saudi: [], us }} names={{}} />);
        fireEvent.click(screen.getByRole('radio', { name: label('scan.universe.us') }));
        expect(screen.getByText(label('scan.partial').replace('{max}', String(MAX_SCAN_SYMBOLS)))).toBeTruthy();
    });

    it('ignores a batch that resolves after the scan was cancelled', async () => {
        const pending = deferred<{ results: { symbol: string; hits: PatternHit[] }[]; answered: number; requested: number }>();
        vi.mocked(scanPatternBatch).mockImplementationOnce(() => pending.promise as never);
        vi.mocked(scanPatternBatch).mockResolvedValue({ results: [], answered: 1, requested: 1 });

        render(<PatternScanner lang="en" universe={{ watchlist: [], saudi: [], us: many }} names={{}} />);
        const button = screen.getByRole('button', { name: label('scan.run') });
        fireEvent.click(button); // starts, and awaits the first batch
        fireEvent.click(button); // cancels while that batch is still in flight

        await act(async () => {
            pending.resolve({ results: [{ symbol: 'S0', hits: [hit] }], answered: 1, requested: SCAN_BATCH });
            await pending.promise;
        });

        expect(screen.queryByRole('table')).toBeNull();
    });
});
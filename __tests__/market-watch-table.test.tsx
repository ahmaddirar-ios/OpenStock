// @vitest-environment jsdom
// The board is one table in two places: the pane beside a chart (no market column) and `/world`
// (all five). Both draw the same rows, so the contract lives here: a row leans by its change, its
// last price is filled in that colour, and the symbol stays readable right-to-left — the D badge
// must sit on the left of the ticker in Arabic too, the way the terminal flags every row.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import MarketWatchTable from '@/components/markets/MarketWatchTable';
import { MARKET_SECTIONS, type WorldQuote } from '@/lib/market/sections';
import type { SectionBoard } from '@/lib/market/world-board';

const gulf = MARKET_SECTIONS.find((section) => section.id === 'gulf')!;

const quote: WorldQuote = {
    ticker: 'TADAWUL:TASI',
    short: 'TASI',
    nameKey: 'world.name.tasi',
    marketKey: 'world.market.saudi',
    price: 10093.3,
    changePercent: 0.54,
    changeAbs: 54.1,
};

const board = (over: Partial<WorldQuote> = {}): SectionBoard[] => [
    { section: gulf, quotes: [{ ...quote, ...over }] },
];

afterEach(cleanup);

describe('the market-watch table', () => {
    it('prints the five terminal columns', () => {
        const { container } = render(<MarketWatchTable sections={board()} lang="en" density="page" />);
        const heads = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
        expect(heads).toEqual(['Market', 'Symbol', 'Name', 'Last', 'Change %']);
        expect(container.querySelector('table')?.className).toContain('is-page');
    });

    it('leans a row by its change and fills the last price with it', () => {
        const { container } = render(<MarketWatchTable sections={board()} lang="en" />);
        const row = container.querySelector('tbody tr:not(.watch-section)')!;
        expect(row.className).toBe('is-up');
        expect(container.querySelector('tbody .watch-last')!.className).toContain('is-up');
        expect(container.querySelector('tbody .watch-change')!.textContent).toBe('+0.54');
    });

    it('calls a row with no change flat, not a loss', () => {
        const { container } = render(
            <MarketWatchTable sections={board({ changePercent: 0 })} lang="en" />,
        );
        expect(container.querySelector('tbody tr:not(.watch-section)')!.className).toBe('is-flat');
        expect(container.querySelector('tbody .watch-change')!.textContent).toBe('0.00');
    });

    it('keeps the D badge on the left of the ticker in Arabic', () => {
        const { container } = render(<MarketWatchTable sections={board()} lang="ar" />);
        const symbol = container.querySelector('tbody .watch-symbol')!;
        // One left-to-right island inside the mirrored table, so "D TASI" never becomes "TASI D".
        expect(symbol.querySelector('[dir="ltr"]')).not.toBeNull();
        const island = symbol.querySelector('[dir="ltr"]')!;
        expect(island.textContent).toBe('DTASI');
        expect(island.firstElementChild!.className).toContain('watch-d');
    });

    it('prints the last price and the market in Arabic digits and words', () => {
        const { container } = render(<MarketWatchTable sections={board()} lang="ar" density="page" />);
        expect(container.querySelector('tbody .watch-last')!.textContent).toContain('١٠');
        expect(container.querySelector('tbody .watch-market')!.textContent).toBe('السعودية');
    });

    it('counts the visible rows against the whole section', () => {
        const { container } = render(<MarketWatchTable sections={board()} lang="en" density="page" />);
        expect(container.querySelector('.watch-section-count')!.textContent).toBe('1/5');
    });
});

describe('a rankable watch table', () => {
    it('names the ranked column and its direction for the reader', () => {
        const { container, rerender } = render(
            <MarketWatchTable sections={board()} lang="en" sort={{ key: 'change', dir: 'desc' }} onSort={() => {}} />,
        );
        const sorted = container.querySelector('th[aria-sort="descending"]');
        expect(sorted).not.toBeNull();
        expect(sorted!.textContent).toContain('Change');
        // The other rankable column claims nothing.
        expect(container.querySelector('th.watch-last')!.getAttribute('aria-sort')).toBeNull();

        rerender(<MarketWatchTable sections={board()} lang="en" sort={{ key: 'change', dir: 'asc' }} onSort={() => {}} />);
        expect(container.querySelector('th[aria-sort="ascending"]')).not.toBeNull();
    });

    it('reports the column a header click names', () => {
        const onSort = vi.fn();
        const { container } = render(<MarketWatchTable sections={board()} lang="en" onSort={onSort} />);

        fireEvent.click(container.querySelector('.watch-last .watch-sort')!);
        expect(onSort).toHaveBeenLastCalledWith('last');
        fireEvent.click(container.querySelector('.watch-change .watch-sort')!);
        expect(onSort).toHaveBeenLastCalledWith('change');
    });
});

import { describe, expect, it } from 'vitest';
import {
    DEFAULT_GROUP,
    countByGroup,
    groupNames,
    isWatchlistSortKey,
    normalizeGroup,
    normalizeNote,
    normalizeTags,
    parseWatchlistCsv,
    sortWatchlist,
    watchlistToCsv,
} from '@/lib/watchlist';

describe('normalizeGroup', () => {
    it('falls back to the default group', () => {
        expect(normalizeGroup('')).toBe(DEFAULT_GROUP);
        expect(normalizeGroup('   ')).toBe(DEFAULT_GROUP);
        expect(normalizeGroup(null)).toBe(DEFAULT_GROUP);
    });
    it('collapses whitespace and caps the length', () => {
        expect(normalizeGroup('  Long   term  ')).toBe('Long term');
        expect(normalizeGroup('x'.repeat(80))).toHaveLength(40);
    });
});

describe('normalizeNote', () => {
    it('trims and caps', () => {
        expect(normalizeNote('  buy the dip  ')).toBe('buy the dip');
        expect(normalizeNote('x'.repeat(400))).toHaveLength(280);
    });
});

describe('normalizeTags', () => {
    it('lower-cases, de-dupes and caps', () => {
        expect(normalizeTags('Dividend, dividend, Entry')).toEqual(['dividend', 'entry']);
    });
    it('turns spaces into dashes', () => {
        expect(normalizeTags('long term')).toEqual(['long-term']);
    });
    it('caps the count', () => {
        expect(normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(8);
    });
    it('accepts an array', () => {
        expect(normalizeTags(['A', 'b'])).toEqual(['a', 'b']);
    });
});

describe('groupNames', () => {
    it('puts the default group first, then sorts', () => {
        expect(groupNames([{ group: 'Zeta' }, { group: '' }, { group: 'Alpha' }])).toEqual([DEFAULT_GROUP, 'Alpha', 'Zeta']);
    });
});

describe('countByGroup', () => {
    it('counts each group', () => {
        expect(countByGroup([{ group: 'A' }, { group: 'A' }, { group: '' }])).toEqual([
            { group: DEFAULT_GROUP, count: 1 },
            { group: 'A', count: 2 },
        ]);
    });
});

describe('parseWatchlistCsv', () => {
    it('parses a canonical file', () => {
        const csv = ['Symbol,Company,Group,Note,Tags', '2222.SR,Aramco,Dividends,wait for Q3,"dividend, energy"'].join('\n');
        const { items, errors } = parseWatchlistCsv(csv);
        expect(errors).toHaveLength(0);
        expect(items[0]).toMatchObject({
            symbol: '2222.SR',
            company: 'Aramco',
            group: 'Dividends',
            note: 'wait for Q3',
            tags: ['dividend', 'energy'],
        });
    });

    it('accepts aliases', () => {
        const csv = ['ticker,name,list,comment,labels', 'AAPL,Apple,Core,hold,tech'].join('\n');
        const { items } = parseWatchlistCsv(csv);
        expect(items[0]).toMatchObject({ symbol: 'AAPL', group: 'Core', note: 'hold', tags: ['tech'] });
    });

    it('parses a headerless file', () => {
        const { items } = parseWatchlistCsv('AAPL,Apple,Core,hold,tech');
        expect(items[0].symbol).toBe('AAPL');
    });

    it('reports bad and duplicate symbols', () => {
        const csv = ['Symbol,Group', 'AAPL,Core', 'not a symbol!,Core', 'AAPL,Other'].join('\n');
        const { items, errors } = parseWatchlistCsv(csv);
        expect(items).toHaveLength(1);
        expect(errors.map((e) => e.message)).toEqual(['badSymbol', 'duplicate']);
    });

    it('refuses a file without a symbol column', () => {
        const { errors } = parseWatchlistCsv('foo,bar\n1,2');
        expect(errors[0].message).toBe('missingColumns');
    });

    it('round-trips through watchlistToCsv', () => {
        const original = [{ symbol: 'AAPL', company: 'Apple', group: 'Core', note: 'hold, long', tags: ['tech', 'us'] }];
        const { items } = parseWatchlistCsv(watchlistToCsv(original));
        expect(items[0]).toMatchObject({ symbol: 'AAPL', group: 'Core', note: 'hold, long', tags: ['tech', 'us'] });
    });
});

describe('sortWatchlist', () => {
    const rows = [
        { symbol: 'MSFT', price: 400, change: 2, changePercent: 0.5, marketCap: 3_000 },
        { symbol: 'AAPL', price: 200, change: -3, changePercent: -1.5, marketCap: 2_800 },
        { symbol: '2222.SR', price: 28, change: 0.4, changePercent: 1.4, marketCap: 90 },
    ];

    it('orders symbols alphabetically in both directions', () => {
        expect(sortWatchlist(rows, 'symbol').map((r) => r.symbol)).toEqual(['2222.SR', 'AAPL', 'MSFT']);
        expect(sortWatchlist(rows, 'symbol', 'desc').map((r) => r.symbol)).toEqual(['MSFT', 'AAPL', '2222.SR']);
    });

    it('orders numbers by value', () => {
        expect(sortWatchlist(rows, 'price').map((r) => r.symbol)).toEqual(['2222.SR', 'AAPL', 'MSFT']);
        expect(sortWatchlist(rows, 'price', 'desc').map((r) => r.symbol)).toEqual(['MSFT', 'AAPL', '2222.SR']);
        expect(sortWatchlist(rows, 'changePercent', 'desc').map((r) => r.symbol)).toEqual(['2222.SR', 'MSFT', 'AAPL']);
    });

    it('keeps unpriced rows at the bottom in both directions', () => {
        const withBlank = [...rows, { symbol: 'ZZZ' }];
        expect(sortWatchlist(withBlank, 'price', 'desc').at(-1)?.symbol).toBe('ZZZ');
        expect(sortWatchlist(withBlank, 'price').at(-1)?.symbol).toBe('ZZZ');
        expect(sortWatchlist(withBlank, 'marketCap', 'desc').at(-1)?.symbol).toBe('ZZZ');
    });

    it('never mutates the rows it was given', () => {
        const copy = [...rows];
        sortWatchlist(rows, 'price', 'desc');
        expect(rows).toEqual(copy);
    });

    it('remembers only a real key and direction', () => {
        expect(isWatchlistSortKey('price')).toBe(true);
        expect(isWatchlistSortKey('price; drop table')).toBe(false);
        expect(isWatchlistSortKey(42)).toBe(false);
    });
});

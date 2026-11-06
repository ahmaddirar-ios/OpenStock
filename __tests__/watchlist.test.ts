import { describe, expect, it } from 'vitest';
import {
    DEFAULT_GROUP,
    countByGroup,
    groupNames,
    normalizeGroup,
    normalizeNote,
    normalizeTags,
    parseWatchlistCsv,
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

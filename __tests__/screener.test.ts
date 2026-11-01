import { describe, expect, it } from 'vitest';
import {
    criteriaToQuery,
    DEFAULT_CRITERIA,
    filterRows,
    latestUpdatedAt,
    parseCriteria,
    sortRows,
    toCsv,
    type ScreenerRow,
} from '@/lib/screener';

const row = (over: Partial<ScreenerRow>): ScreenerRow => ({
    symbol: 'AAPL',
    name: 'Apple Inc.',
    market: 'us',
    sector: 'Information Technology',
    exchange: 'Nasdaq',
    indexes: ['SP500', 'NDX100'],
    price: 100,
    changePercent: 1,
    currency: 'USD',
    updatedAt: 1,
    ...over,
});

const ROWS: ScreenerRow[] = [
    row({ symbol: 'AAPL', name: 'Apple Inc.', price: 200, changePercent: 2 }),
    row({ symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy', exchange: 'NYSE', indexes: ['SP500'], price: 100, changePercent: -3 }),
    row({ symbol: '2222.SR', name: 'Saudi Arabian Oil Co.', nameAr: 'أرامكو السعودية', market: 'sa', sector: '', exchange: 'TADAWUL', indexes: [], price: 25.92, changePercent: 0.5, currency: 'SAR' }),
];

describe('parseCriteria', () => {
    it('returns the defaults for an empty query', () => {
        expect(parseCriteria({})).toEqual(DEFAULT_CRITERIA);
    });

    it('keeps the recognised values and drops the rest', () => {
        const c = parseCriteria({ q: ' oil ', market: 'sa', sector: 'Energy', index: 'NDX100', minChange: '1.5', maxChange: '-2' });
        expect(c).toEqual({ q: 'oil', market: 'sa', sector: 'Energy', index: 'NDX100', minChange: 1.5, maxChange: -2 });
    });

    it('falls back when market or index are unknown', () => {
        const c = parseCriteria({ market: 'xx', index: 'FTSE' });
        expect(c.market).toBe('all');
        expect(c.index).toBe('all');
    });

    it('treats a blank or unparseable number as no bound', () => {
        expect(parseCriteria({ minChange: '', maxChange: 'abc' })).toMatchObject({ minChange: null, maxChange: null });
    });
});

describe('criteriaToQuery', () => {
    it('omits the defaults and keeps the rest', () => {
        expect(criteriaToQuery(DEFAULT_CRITERIA)).toBe('');
        expect(criteriaToQuery({ ...DEFAULT_CRITERIA, q: 'oil', market: 'sa', minChange: 1 })).toBe('q=oil&market=sa&minChange=1');
    });

    it('round-trips through parseCriteria', () => {
        const c = { ...DEFAULT_CRITERIA, q: 'أرامكو', sector: 'Energy', maxChange: 5 };
        const qs = criteriaToQuery(c);
        const parsed = Object.fromEntries(new URLSearchParams(qs)) as Record<string, string>;
        expect(parseCriteria(parsed)).toEqual(c);
    });
});

describe('filterRows', () => {
    it('returns everything by default', () => {
        expect(filterRows(ROWS, DEFAULT_CRITERIA)).toHaveLength(3);
    });

    it('matches the query against symbol, English and Arabic names', () => {
        expect(filterRows(ROWS, { ...DEFAULT_CRITERIA, q: 'aapl' }).map((r) => r.symbol)).toEqual(['AAPL']);
        expect(filterRows(ROWS, { ...DEFAULT_CRITERIA, q: 'exxon' }).map((r) => r.symbol)).toEqual(['XOM']);
        expect(filterRows(ROWS, { ...DEFAULT_CRITERIA, q: 'أرامكو' }).map((r) => r.symbol)).toEqual(['2222.SR']);
    });

    it('filters by market, sector and index', () => {
        expect(filterRows(ROWS, { ...DEFAULT_CRITERIA, market: 'sa' }).map((r) => r.symbol)).toEqual(['2222.SR']);
        expect(filterRows(ROWS, { ...DEFAULT_CRITERIA, sector: 'Energy' }).map((r) => r.symbol)).toEqual(['XOM']);
        expect(filterRows(ROWS, { ...DEFAULT_CRITERIA, index: 'NDX100' }).map((r) => r.symbol)).toEqual(['AAPL']);
    });

    it('filters by a change range, inclusive', () => {
        expect(filterRows(ROWS, { ...DEFAULT_CRITERIA, minChange: 1 }).map((r) => r.symbol)).toEqual(['AAPL']);
        expect(filterRows(ROWS, { ...DEFAULT_CRITERIA, maxChange: 0 }).map((r) => r.symbol)).toEqual(['XOM']);
        expect(filterRows(ROWS, { ...DEFAULT_CRITERIA, minChange: 0.5, maxChange: 2 }).map((r) => r.symbol)).toEqual(['AAPL', '2222.SR']);
    });
});

describe('sortRows', () => {
    it('sorts by price both ways', () => {
        expect(sortRows(ROWS, 'price', 'asc').map((r) => r.symbol)).toEqual(['2222.SR', 'XOM', 'AAPL']);
        expect(sortRows(ROWS, 'price', 'desc').map((r) => r.symbol)).toEqual(['AAPL', 'XOM', '2222.SR']);
    });

    it('sorts by change and by symbol', () => {
        expect(sortRows(ROWS, 'change', 'asc').map((r) => r.symbol)).toEqual(['XOM', '2222.SR', 'AAPL']);
        expect(sortRows(ROWS, 'symbol', 'asc').map((r) => r.symbol)).toEqual(['2222.SR', 'AAPL', 'XOM']);
    });

    it('does not mutate the input', () => {
        const before = ROWS.map((r) => r.symbol);
        sortRows(ROWS, 'price', 'desc');
        expect(ROWS.map((r) => r.symbol)).toEqual(before);
    });
});

describe('latestUpdatedAt', () => {
    it('is the newest timestamp, or zero for none', () => {
        expect(latestUpdatedAt([row({ updatedAt: 5 }), row({ updatedAt: 9 }), row({ updatedAt: 2 })])).toBe(9);
        expect(latestUpdatedAt([])).toBe(0);
    });
});

describe('toCsv', () => {
    it('writes a header and one line per row', () => {
        const csv = toCsv([row({ symbol: 'AAPL' })]);
        const [header, line] = csv.split('\n');
        expect(header).toBe('Symbol,Name,Market,Sector,Exchange,Price,Change %,Currency');
        expect(line).toBe('AAPL,Apple Inc.,US,Information Technology,Nasdaq,100,1,USD');
    });

    it('quotes cells that contain a comma', () => {
        const csv = toCsv([row({ name: 'Acme, Inc.' })]);
        expect(csv.split('\n')[1]).toContain('"Acme, Inc."');
    });

    it('escapes embedded quotes', () => {
        const csv = toCsv([row({ name: 'The "X" Corp' })]);
        expect(csv.split('\n')[1]).toContain('"The ""X"" Corp"');
    });
});

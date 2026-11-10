import { describe, expect, it } from 'vitest';
import {
    coverage,
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
    marketCap: 1e9,
    peRatio: 12,
    valueTraded: 5e6,
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
        expect(c).toEqual({
            q: 'oil', market: 'sa', sector: 'Energy', index: 'NDX100',
            minChange: 1.5, maxChange: -2,
            minValue: null, minMarketCap: null, maxPe: null,
        });
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
        expect(header).toBe('Symbol,Name,Market,Sector,Exchange,Price,Change %,Value traded,Market cap,P/E,Currency');
        expect(line).toBe('AAPL,Apple Inc.,US,Information Technology,Nasdaq,100,1,5000000,1000000000,12,USD');
    });

    it('quotes cells that contain a comma', () => {
        const csv = toCsv([row({ name: 'Acme, Inc.' })]);
        expect(csv.split('\n')[1]).toContain('"Acme, Inc."');
    });

    it('escapes embedded quotes', () => {
        const csv = toCsv([row({ name: 'The "X" Corp' })]);
        expect(csv.split('\n')[1]).toContain('"The ""X"" Corp"');
    });

    it('filters on turnover, size and P/E', () => {
        const quiet = row({ symbol: 'A', valueTraded: 1e6, marketCap: 5e8, peRatio: 8 });
        const busy = row({ symbol: 'B', valueTraded: 50e6, marketCap: 4e9, peRatio: 40 });
        const unprofitable = row({ symbol: 'C', valueTraded: 20e6, marketCap: 2e9, peRatio: null });

        // Ten million of turnover is the floor, and only B and C clear it.
        expect(filterRows([quiet, busy, unprofitable], { ...DEFAULT_CRITERIA, minValue: 10 }).map((r) => r.symbol)).toEqual(['B', 'C']);
        expect(filterRows([quiet, busy], { ...DEFAULT_CRITERIA, minMarketCap: 1000 }).map((r) => r.symbol)).toEqual(['B']);
        // A company with no P/E is not a cheap company.
        expect(filterRows([quiet, busy, unprofitable], { ...DEFAULT_CRITERIA, maxPe: 20 }).map((r) => r.symbol)).toEqual(['A']);
    });

    it('carries the new filters through the query string', () => {
        const query = criteriaToQuery({ ...DEFAULT_CRITERIA, minValue: 10, minMarketCap: 500, maxPe: 15 });
        expect(query).toContain('minValue=10');
        expect(query).toContain('minMarketCap=500');
        expect(query).toContain('maxPe=15');
        const parsed = parseCriteria(Object.fromEntries(new URLSearchParams(query)));
        expect(parsed).toMatchObject({ minValue: 10, minMarketCap: 500, maxPe: 15 });
    });

    it('sorts by turnover, size and P/E', () => {
        const small = row({ symbol: 'A', valueTraded: 1e6, marketCap: 1e9, peRatio: 30 });
        const big = row({ symbol: 'B', valueTraded: 9e6, marketCap: 9e9, peRatio: 5 });
        expect(sortRows([small, big], 'value', 'desc').map((r) => r.symbol)).toEqual(['B', 'A']);
        expect(sortRows([small, big], 'marketCap', 'desc').map((r) => r.symbol)).toEqual(['B', 'A']);
        expect(sortRows([small, big], 'pe').map((r) => r.symbol)).toEqual(['B', 'A']);
    });
});
describe('coverage', () => {
    it('reports a complete snapshot as not partial', () => {
        expect(coverage(906, 906)).toEqual({ priced: 906, total: 906, missing: 0, partial: false, percent: 100 });
    });

    it('makes the shortfall explicit', () => {
        const c = coverage(12, 906);
        expect(c).toMatchObject({ priced: 12, total: 906, missing: 894, partial: true });
        expect(c.percent).toBe(1);
    });

    it('never reports more priced symbols than the universe holds', () => {
        expect(coverage(1000, 906).priced).toBe(906);
        expect(coverage(1000, 906).missing).toBe(0);
    });

    it('survives nonsense input rather than printing NaN', () => {
        expect(coverage(Number.NaN, 906)).toMatchObject({ priced: 0, missing: 906, percent: 0 });
        expect(coverage(5, 0)).toEqual({ priced: 0, total: 0, missing: 0, partial: false, percent: 0 });
        expect(coverage(-3, -9)).toEqual({ priced: 0, total: 0, missing: 0, partial: false, percent: 0 });
    });
});

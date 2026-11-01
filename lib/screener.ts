// Screener filtering and sorting. Pure and IO-free, so the page can sort the whole snapshot in the
// browser and the same rules can be tested without a database.

export type ScreenerMarket = 'us' | 'sa';

export type ScreenerRow = {
    symbol: string;
    name: string;
    nameAr?: string;
    market: ScreenerMarket;
    sector: string;
    exchange: string;
    indexes: string[];
    price: number;
    changePercent: number;
    currency: string;
    /** Epoch milliseconds of the last price refresh. */
    updatedAt: number;
};

export type ScreenerCriteria = {
    q: string;
    market: 'all' | 'us' | 'sa';
    sector: string;
    index: 'all' | 'SP500' | 'NDX100';
    minChange: number | null;
    maxChange: number | null;
};

export const DEFAULT_CRITERIA: ScreenerCriteria = {
    q: '',
    market: 'all',
    sector: '',
    index: 'all',
    minChange: null,
    maxChange: null,
};

export type ScreenerSortKey = 'symbol' | 'name' | 'sector' | 'price' | 'change';
export type SortDirection = 'asc' | 'desc';

const firstValue = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const numberOrNull = (value: string): number | null => {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
};

/** Reads the criteria out of a page's query string, ignoring anything it does not recognise. */
export function parseCriteria(params: Record<string, string | string[] | undefined> = {}): ScreenerCriteria {
    const market = firstValue(params.market);
    const index = firstValue(params.index);
    return {
        q: firstValue(params.q).trim(),
        market: market === 'us' || market === 'sa' ? market : 'all',
        sector: firstValue(params.sector).trim(),
        index: index === 'SP500' || index === 'NDX100' ? index : 'all',
        minChange: numberOrNull(firstValue(params.minChange)),
        maxChange: numberOrNull(firstValue(params.maxChange)),
    };
}

/** Serialises criteria back to a query string, omitting the defaults. */
export function criteriaToQuery(criteria: ScreenerCriteria): string {
    const params = new URLSearchParams();
    if (criteria.q) params.set('q', criteria.q);
    if (criteria.market !== 'all') params.set('market', criteria.market);
    if (criteria.sector) params.set('sector', criteria.sector);
    if (criteria.index !== 'all') params.set('index', criteria.index);
    if (criteria.minChange !== null) params.set('minChange', String(criteria.minChange));
    if (criteria.maxChange !== null) params.set('maxChange', String(criteria.maxChange));
    return params.toString();
}

const haystack = (row: ScreenerRow): string =>
    [row.symbol, row.name, row.nameAr].filter(Boolean).join(' ').toLowerCase();

export function filterRows(rows: ScreenerRow[], criteria: ScreenerCriteria): ScreenerRow[] {
    const q = criteria.q.trim().toLowerCase();
    return rows.filter((row) => {
        if (criteria.market !== 'all' && row.market !== criteria.market) return false;
        if (criteria.sector && row.sector !== criteria.sector) return false;
        if (criteria.index !== 'all' && !row.indexes.includes(criteria.index)) return false;
        if (criteria.minChange !== null && row.changePercent < criteria.minChange) return false;
        if (criteria.maxChange !== null && row.changePercent > criteria.maxChange) return false;
        if (q && !haystack(row).includes(q)) return false;
        return true;
    });
}

export function sortRows(rows: ScreenerRow[], key: ScreenerSortKey, direction: SortDirection = 'asc'): ScreenerRow[] {
    const sign = direction === 'desc' ? -1 : 1;
    const compare = (a: ScreenerRow, b: ScreenerRow): number => {
        switch (key) {
            case 'price':
            case 'change':
                return ((key === 'price' ? a.price : a.changePercent) - (key === 'price' ? b.price : b.changePercent));
            case 'sector':
                return a.sector.localeCompare(b.sector);
            case 'name':
                return a.name.localeCompare(b.name);
            default:
                return a.symbol.localeCompare(b.symbol);
        }
    };
    // Decorate so equal rows keep their incoming order (a stable sort in every engine).
    return rows.map((row, index) => ({ row, index }))
        .sort((a, b) => compare(a.row, b.row) * sign || a.index - b.index)
        .map((entry) => entry.row);
}

/** The newest refresh time across the rows, or 0 for none. */
export function latestUpdatedAt(rows: ScreenerRow[]): number {
    return rows.reduce((latest, row) => (row.updatedAt > latest ? row.updatedAt : latest), 0);
}

const csvCell = (value: string | number): string => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** CSV of the given rows, with a header, ready for a spreadsheet. */
export function toCsv(rows: ScreenerRow[]): string {
    const header = ['Symbol', 'Name', 'Market', 'Sector', 'Exchange', 'Price', 'Change %', 'Currency'];
    const lines = rows.map((row) => [
        row.symbol,
        row.name,
        row.market === 'sa' ? 'Tadawul' : 'US',
        row.sector,
        row.exchange,
        row.price,
        row.changePercent,
        row.currency,
    ].map(csvCell).join(','));
    return [header.join(','), ...lines].join('\n');
}

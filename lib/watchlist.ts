// Watchlist organisation: groups, notes, tags, and the CSV that carries them between devices.
// Pure and IO-free, so the table, the server action and the tests share one definition of a group.

export const DEFAULT_GROUP = 'General';
export const MAX_GROUP_LENGTH = 40;
export const MAX_NOTE_LENGTH = 280;
export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 24;
export const MAX_IMPORT_ROWS = 200;

export type WatchlistMeta = {
    symbol: string;
    company: string;
    group: string;
    note: string;
    tags: string[];
};

/** A group name is trimmed, collapsed and capped; blank becomes the default group. */
export function normalizeGroup(raw: unknown): string {
    const text = String(raw ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_GROUP_LENGTH);
    return text || DEFAULT_GROUP;
}

export function normalizeNote(raw: unknown): string {
    return String(raw ?? '').trim().slice(0, MAX_NOTE_LENGTH);
}

/** Tags are lower-cased, de-duplicated, and capped in both count and length. */
export function normalizeTags(raw: unknown): string[] {
    const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of list) {
        const tag = String(item ?? '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .slice(0, MAX_TAG_LENGTH);
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        out.push(tag);
        if (out.length >= MAX_TAGS) break;
    }
    return out;
}

/** Groups in a stable order: the default first, then alphabetical. */
export function groupNames(items: { group?: string }[]): string[] {
    const names = new Set<string>();
    for (const item of items) names.add(normalizeGroup(item.group));
    return [...names].sort((a, b) => {
        if (a === DEFAULT_GROUP) return -1;
        if (b === DEFAULT_GROUP) return 1;
        return a.localeCompare(b);
    });
}

export function countByGroup(items: { group?: string }[]): { group: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const item of items) {
        const group = normalizeGroup(item.group);
        counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return groupNames(items).map((group) => ({ group, count: counts.get(group) ?? 0 }));
}

// -- Sorting -----------------------------------------------------------------------------------

export type WatchlistSortKey = 'symbol' | 'price' | 'changePercent' | 'change' | 'marketCap';
export type SortDirection = 'asc' | 'desc';

export const WATCHLIST_SORT_KEYS: WatchlistSortKey[] = ['symbol', 'price', 'changePercent', 'change', 'marketCap'];

/** Only these keys can be remembered from a previous visit; anything else falls back to the default. */
export const isWatchlistSortKey = (value: unknown): value is WatchlistSortKey =>
    typeof value === 'string' && (WATCHLIST_SORT_KEYS as string[]).includes(value);

export type SortableRow = {
    symbol: string;
    price?: number;
    change?: number;
    changePercent?: number;
    marketCap?: number;
};

/** A row that arrived without a quote carries no number for the price columns. */
const missingValue = (row: SortableRow, key: Exclude<WatchlistSortKey, 'symbol'>): boolean => {
    const value = row[key];
    if (key === 'price' || key === 'marketCap') return !value || !Number.isFinite(value);
    return value == null || !Number.isFinite(value);
};

/**
 * Sorts the watchlist. A row with no quote sorts to the bottom in both directions — an unpriced
 * symbol is never allowed to lead a "top gainers" list by accident. Ties keep their incoming
 * order, so the same table always reads the same way.
 */
export function sortWatchlist<T extends SortableRow>(
    rows: readonly T[],
    key: WatchlistSortKey,
    direction: SortDirection = 'asc'
): T[] {
    const sign = direction === 'desc' ? -1 : 1;
    return rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => {
            if (key === 'symbol') {
                return a.row.symbol.localeCompare(b.row.symbol) * sign || a.index - b.index;
            }
            const aMissing = missingValue(a.row, key);
            const bMissing = missingValue(b.row, key);
            if (aMissing !== bMissing) return aMissing ? 1 : -1;
            if (aMissing && bMissing) return a.index - b.index;
            return ((a.row[key] as number) - (b.row[key] as number)) * sign || a.index - b.index;
        })
        .map((entry) => entry.row);
}

// -- CSV ---------------------------------------------------------------------------------------

const csvCell = (value: string | number): string => {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function splitCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted) {
            if (char === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i += 1;
                } else {
                    quoted = false;
                }
            } else {
                current += char;
            }
            continue;
        }
        if (char === '"') quoted = true;
        else if (char === ',') {
            cells.push(current);
            current = '';
        } else current += char;
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
}

const HEADER_ALIASES: Record<string, 'symbol' | 'company' | 'group' | 'note' | 'tags'> = {
    symbol: 'symbol',
    ticker: 'symbol',
    code: 'symbol',
    company: 'company',
    name: 'company',
    group: 'group',
    list: 'group',
    folder: 'group',
    note: 'note',
    notes: 'note',
    comment: 'note',
    tags: 'tags',
    tag: 'tags',
    labels: 'tags',
};

export type WatchlistCsvResult = {
    items: WatchlistMeta[];
    errors: { line: number; message: string }[];
};

export function parseWatchlistCsv(text: string): WatchlistCsvResult {
    const lines = text
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '');
    if (lines.length === 0) return { items: [], errors: [{ line: 0, message: 'empty' }] };

    const first = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase().replace(/[\s-]+/g, '_'));
    const hasHeader = first.some((cell) => cell in HEADER_ALIASES);
    // A headerless file is only assumed when its first cell is a plausible ticker; otherwise the
    // file is some other CSV and "missing columns" is the honest answer.
    const firstCells = splitCsvLine(lines[0]);
    if (!hasHeader && (firstCells.length < 3 || !/^[A-Z0-9][A-Z0-9.&:-]{0,24}$/i.test(firstCells[0] ?? ''))) {
        return { items: [], errors: [{ line: 1, message: 'missingColumns' }] };
    }
    const columns = hasHeader
        ? first.map((cell) => HEADER_ALIASES[cell] ?? null)
        : (['symbol', 'company', 'group', 'note', 'tags'] as const);

    const at = (key: string) => columns.indexOf(key as never);
    const symbolAt = at('symbol');
    if (symbolAt < 0) return { items: [], errors: [{ line: 1, message: 'missingColumns' }] };

    const items: WatchlistMeta[] = [];
    const errors: { line: number; message: string }[] = [];
    const seen = new Set<string>();
    const start = hasHeader ? 1 : 0;

    for (let i = start; i < lines.length; i += 1) {
        const cells = splitCsvLine(lines[i]);
        const lineNumber = i + 1;
        const symbol = (cells[symbolAt] ?? '').trim().toUpperCase();
        if (!/^[A-Z0-9][A-Z0-9.&:-]{0,24}$/.test(symbol)) {
            errors.push({ line: lineNumber, message: 'badSymbol' });
            continue;
        }
        if (seen.has(symbol)) {
            errors.push({ line: lineNumber, message: 'duplicate' });
            continue;
        }
        seen.add(symbol);
        const companyAt = at('company');
        const groupAt = at('group');
        const noteAt = at('note');
        const tagsAt = at('tags');
        items.push({
            symbol,
            company: companyAt >= 0 ? (cells[companyAt] ?? '').slice(0, 120) : '',
            group: normalizeGroup(groupAt >= 0 ? cells[groupAt] : ''),
            note: normalizeNote(noteAt >= 0 ? cells[noteAt] : ''),
            tags: normalizeTags(tagsAt >= 0 ? cells[tagsAt] : ''),
        });
        if (items.length >= MAX_IMPORT_ROWS) break;
    }

    return { items, errors };
}

export function watchlistToCsv(items: WatchlistMeta[]): string {
    const header = ['Symbol', 'Company', 'Group', 'Note', 'Tags'];
    const lines = items.map((item) =>
        [item.symbol, item.company, item.group, item.note, item.tags.join(', ')].map(csvCell).join(',')
    );
    return [header.join(','), ...lines].join('\n');
}

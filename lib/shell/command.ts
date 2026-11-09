// What the command bar answers, with no React in the way.
//
// The bar has three groups, in the order a trader looks: where can I go, what can I use, what can I
// trade. Pages answer even when nothing is typed — an empty command bar that says nothing is a
// button, not a command bar. Tools and stocks need a query, so the dialog never opens as a wall.

import { tx } from '@/lib/i18n';
import { normaliseSearch, searchTools, toolById, type ToolEntry } from '@/lib/tools/catalog';
import type { Role } from '@/lib/authz';
import { PAGES, visiblePages, type PageDef } from './pages';

/** Where a tool lands when the trader has not chosen a chart yet: Aramco, the most-read row. */
export const DEFAULT_SYMBOL = '2222.SR';

/** The last stock the trader opened, so a tool from the command bar lands on their chart. */
export const LAST_SYMBOL_KEY = 'openstock-last-symbol';

/** The index the overview opens on when the trader has not read a stock yet. */
export const OVERVIEW_SYMBOL = 'TASI';

/**
 * Whether a string looks like a stock symbol: the stock pages' alphabet (letters, digits, a dot, a
 * dash, a caret and TADAWUL:'s colon), and nothing longer than a symbol can be.
 *
 * The overview reads its symbol from a cookie and the shell writes one there, so both sides ask the
 * same question — a stale or forged value must never reach the candle feed or a cookie header.
 */
export function isSymbolLike(value: string | null | undefined): boolean {
    return /^[A-Z0-9.^:=-]{1,24}$/i.test((value ?? '').trim());
}

/**
 * The overview's chart symbol: the last stock the trader read, else the index.
 *
 * Anything that is not a symbol is a stale key or a forged one, and asking the candle feed for it
 * would be a bug.
 */
export function overviewSymbol(stored: string | null | undefined): string {
    const value = (stored ?? '').trim();
    return isSymbolLike(value) ? value.toUpperCase() : OVERVIEW_SYMBOL;
}

export type CommandGroupId = 'pages' | 'tools' | 'stocks';

export type CommandGroup<T> = { id: CommandGroupId; items: T[] };

const PAGE_HAYSTACK = new Map<PageDef, string[]>(
    PAGES.map((page) => [
        page,
        [tx('en', page.labelKey), tx('ar', page.labelKey), page.href, ...page.keywords]
            .map(normaliseSearch)
            .filter(Boolean),
    ]),
);

const pageScore = (page: PageDef, needle: string): number => {
    let best = 0;
    for (const text of PAGE_HAYSTACK.get(page) ?? []) {
        if (text === needle) best = Math.max(best, 100);
        else if (text.startsWith(needle)) best = Math.max(best, 80);
        else if (text.includes(needle)) best = Math.max(best, 60);
    }
    return best;
};

/**
 * The pages that answer a query, best first and stable. An empty query answers every page, in the
 * shell's own order — the idle palette is a map of the terminal.
 *
 * With a role, only pages that role may open are offered. Omitting it keeps the whole registry,
 * which is what the registry sanity tests want.
 */
export function commandPages(query: string, role?: Role): PageDef[] {
    const pages = role ? visiblePages(role) : [...PAGES];
    const needle = normaliseSearch(query);
    if (!needle) return pages;
    return pages
        .map((page, order) => ({ page, order, score: pageScore(page, needle) }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map((hit) => hit.page);
}

/** Tools only answer a typed query; twelve is enough to choose from and one screenful to read. */
export function commandTools(query: string, limit = 12): ToolEntry[] {
    if (!normaliseSearch(query)) return [];
    return searchTools(query).slice(0, limit);
}

/** A tool is an address: the chart page with the tool named, so the link is shareable. */
export function toolHref(entry: ToolEntry, symbol: string = DEFAULT_SYMBOL): string {
    const ticker = encodeURIComponent(symbol.trim().toUpperCase());
    return `/stocks/${ticker}?tool=${encodeURIComponent(entry.id)}`;
}

/** The tool a deep link carries, or nothing when the id is stale or forged. */
export function toolFromParam(id: string | null): ToolEntry | undefined {
    return id ? toolById(id) : undefined;
}

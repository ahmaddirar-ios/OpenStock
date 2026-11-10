// The market-watch pane reads the same world board as /world: one list of instruments, one feed.
// These helpers are pure so the pane and the page can be tested without a browser or a scanner.

import { arDigits, tx, type Lang } from '@/lib/i18n';
import type { SectionId } from '@/lib/market/sections';
import { normalizeArabic } from '@/lib/market/saudi-symbols';
import type { SectionBoard } from '@/lib/market/world-board';

/** An index is points, a currency is a rate: one number of decimals cannot serve both. */
export function watchDecimals(section: SectionId, short: string): number {
    if (section === 'currencies') return short.includes('JPY') || short.includes('TRY') ? 2 : 4;
    if (section === 'crypto') return 0;
    return 2;
}

/** Which way a row leans. The table tints the row and fills the last-price cell from this. */
export type Direction = 'up' | 'down' | 'flat';

export function directionOf(changePercent: number): Direction {
    if (!Number.isFinite(changePercent) || changePercent === 0) return 'flat';
    return changePercent > 0 ? 'up' : 'down';
}

/** The change as the table prints it: a sign, two decimals, no percent sign (the header says it). */
export function watchChange(changePercent: number, lang: Lang): string {
    const value = Number.isFinite(changePercent) ? changePercent : 0;
    return arDigits(`${value > 0 ? '+' : ''}${value.toFixed(2)}`, lang);
}

/** The price as the pane prints it: grouped, fixed decimals, Arabic-Indic digits in Arabic. */
export function watchPrice(price: number, section: SectionId, short: string, lang: Lang): string {
    const digits = watchDecimals(section, short);
    return arDigits(
        price.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }),
        lang,
    );
}

/**
 * Filter the whole board by one query. Names are matched in the language on screen, and the short
 * label is matched with its separators folded away — a trader types "EUR/USD" or "EURUSD". The
 * feed's ticker is deliberately not searched: "eur" would otherwise match every ICEEUR contract.
 * Sections with nothing left are dropped, so the pane never prints an empty group.
 */
export function filterSections(
    sections: readonly SectionBoard[],
    query: string,
    lang: Lang,
): SectionBoard[] {
    const needle = normalizeArabic(query).replace(/ /g, '');
    if (needle === '') return [...sections];

    return sections
        .map(({ section, quotes }) => ({
            section,
            quotes: quotes.filter((quote) => {
                const haystack = normalizeArabic(
                    `${quote.short} ${tx(lang, quote.nameKey)}`,
                ).replace(/ /g, '');
                return haystack.includes(needle);
            }),
        }))
        .filter((entry) => entry.quotes.length > 0);
}

/** The two columns a terminal lets you re-rank: the last price and the day's change. */
export type WatchSortKey = 'last' | 'change';
export type WatchSort = { key: WatchSortKey; dir: 'asc' | 'desc' } | null;

/**
 * A header click cycles through three states, because a trader wants "biggest first" far more often
 * than "smallest first": the useful direction, its reverse, then the board's own order back.
 */
export function nextWatchSort(current: WatchSort, key: WatchSortKey): WatchSort {
    if (!current || current.key !== key) return { key, dir: 'desc' };
    if (current.dir === 'desc') return { key, dir: 'asc' };
    return null;
}

/**
 * Re-rank each section's own rows; the sections themselves keep the board's order, because a
 * currency is not competing with an index. Quotes the feed did not price sink to the bottom in
 * both directions — they are missing, not small.
 */
export function sortSections(sections: readonly SectionBoard[], sort: WatchSort): SectionBoard[] {
    if (!sort) return [...sections];
    const factor = sort.dir === 'asc' ? 1 : -1;
    const valueOf = (quote: SectionBoard['quotes'][number]) =>
        sort.key === 'last' ? quote.price : quote.changePercent;

    return sections.map(({ section, quotes }) => ({
        section,
        quotes: [...quotes].sort((a, b) => {
            const first = valueOf(a);
            const second = valueOf(b);
            const firstOk = Number.isFinite(first);
            const secondOk = Number.isFinite(second);
            if (!firstOk && !secondOk) return 0;
            if (!firstOk) return 1;
            if (!secondOk) return -1;
            return (first - second) * factor;
        }),
    }));
}

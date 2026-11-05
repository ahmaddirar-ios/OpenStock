// The market-watch pane reads the same world board as /world: one list of instruments, one feed.
// These helpers are pure so the pane and the page can be tested without a browser or a scanner.

import { arDigits, tx, type Lang } from '@/lib/i18n';
import type { SectionId } from '@/lib/market-sections';
import { normalizeArabic } from '@/lib/saudi-symbols';
import type { SectionBoard } from '@/lib/world-board';

/** An index is points, a currency is a rate: one number of decimals cannot serve both. */
export function watchDecimals(section: SectionId, short: string): number {
    if (section === 'currencies') return short.includes('JPY') || short.includes('TRY') ? 2 : 4;
    if (section === 'crypto') return 0;
    return 2;
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

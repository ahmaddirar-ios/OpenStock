// The Saudi market indices.
//
// Finnhub's symbol search is Latin-only and knows no index, and the local Saudi table is for
// companies: "TASI" — or "المؤشر العام" — found nothing in the search palette at all. The indices
// are not companies either, so they get their own small directory: one entry per index the app can
// actually chart, matched in both scripts.

import { normalizeArabic } from '@/lib/market/saudi-symbols';

export type SaudiIndex = {
    /** The symbol this app's stock pages take. */
    symbol: string;
    /** English name, as the exchange lists it. */
    name: string;
    /** The name the Arabic interface shows. */
    nameAr: string;
    /** Everything else a reader might type, in either script. */
    aliases: string[];
};

export const SAUDI_INDICES: readonly SaudiIndex[] = [
    {
        symbol: 'TASI',
        name: 'Tadawul All Shares Index',
        nameAr: 'المؤشر العام (تاسي)',
        // "tadawul" is the exchange, but it is what people call the index, so it has to match.
        aliases: [
            'tadawul all shares index',
            'tadawul all shares',
            'all shares index',
            'tasi index',
            'tadawul index',
            'tadawul',
            'المؤشر العام',
            'المؤشر',
            'مؤشر تداول',
            'مؤشر السوق',
            'تاسي',
            'تداول',
            'السوق السعودي',
        ],
    },
];

/** How well a stored key answers the query; a longer query that still matches is more specific. */
const score = (key: string, query: string): number => {
    if (key === query) return 100;
    if (key.startsWith(query)) return 60 + query.length;
    if (key.includes(` ${query}`)) return 50 + query.length;
    if (key.includes(query)) return 30 + query.length;
    // The reader typed more than the stored name, e.g. "tadawul all shares index today".
    if (query.includes(key)) return 20 + key.length;
    return 0;
};

/** Every spelling of an index, folded once per entry. */
const KEYS: { entry: SaudiIndex; keys: string[] }[] = SAUDI_INDICES.map((entry) => ({
    entry,
    keys: [entry.symbol, entry.name, entry.nameAr, ...entry.aliases].flatMap((value) => {
        const latin = value.trim().toLowerCase();
        const arabic = normalizeArabic(value);
        return latin === arabic ? [latin] : [latin, arabic];
    }),
}));

/**
 * Matches an index by ticker, English name, Arabic name or alias. A query that matches nothing
 * here returns an empty list, which leaves company searches to Finnhub exactly as before.
 */
export function searchSaudiIndices(query: string, limit = 3): SaudiIndex[] {
    const raw = typeof query === 'string' ? query.trim() : '';
    if (raw.length < 2) return [];
    // Latin queries are compared lower-cased; Arabic ones through the spelling-folding normaliser.
    const candidates = [raw.toLowerCase(), normalizeArabic(raw)].filter((value) => value.length >= 2);

    const hits: { entry: SaudiIndex; score: number }[] = [];
    for (const { entry, keys } of KEYS) {
        let best = 0;
        for (const key of keys) {
            for (const candidate of candidates) {
                const value = score(key, candidate);
                if (value > best) best = value;
            }
        }
        if (best > 0) hits.push({ entry, score: best });
    }

    return hits
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((hit) => hit.entry);
}

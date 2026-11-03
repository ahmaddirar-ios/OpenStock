// The rules the stock search follows before it spends a network call.
//
// Finnhub's /search rejects a query longer than twenty characters outright (`422 {"error":"q too
// long"}`), and a failing call must never be allowed to throw away matches the local tables already
// found — that is exactly how "Tadawul All Shares Index" showed "Nothing matches" while the index
// directory had answered it correctly.

/** The longest query Finnhub's symbol search accepts. */
export const FINNHUB_QUERY_MAX = 20;

/** Whether Finnhub is worth asking at all: a longer query is a guaranteed 422. */
export const finnhubCanAnswer = (query: string): boolean => query.trim().length <= FINNHUB_QUERY_MAX;

/**
 * The results a search shows: the local matches first (an index or an Arabic name the feed cannot
 * know), then whatever the feed added, with each symbol appearing once.
 */
export function mergeSearchResults<T extends { symbol?: string }>(local: T[], remote: T[]): T[] {
    const seen = new Set<string>();
    const merged: T[] = [];
    for (const candidate of [...local, ...remote]) {
        const symbol = (candidate?.symbol || '').toUpperCase();
        if (!symbol || seen.has(symbol)) continue;
        seen.add(symbol);
        merged.push(candidate);
    }
    return merged;
}

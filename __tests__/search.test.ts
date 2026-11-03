// The search's own rules, away from the server action that uses them: whether the feed is worth a
// call, and how local and remote matches combine.
import { describe, expect, it } from 'vitest';
import { FINNHUB_QUERY_MAX, finnhubCanAnswer, mergeSearchResults } from '@/lib/search';

describe('search arity', () => {
    it('knows the length Finnhub refuses', () => {
        // Measured against the live API: 18 characters pass, 21 answer {"error":"q too long"}.
        expect(FINNHUB_QUERY_MAX).toBe(20);
        expect(finnhubCanAnswer('tadawul all shares')).toBe(true);
        expect(finnhubCanAnswer('tadawul all shares index')).toBe(false);
        expect(finnhubCanAnswer('Tadawul All Shares Index')).toBe(false);
        // Whitespace is not part of the query the feed sees.
        expect(finnhubCanAnswer('  tadawul all shares  ')).toBe(true);
    });
});

describe('merging search halves', () => {
    it('puts the local matches first', () => {
        const merged = mergeSearchResults(
            [{ symbol: 'TASI', description: 'Tadawul All Shares Index' }],
            [{ symbol: 'AAPL', description: 'Apple Inc' }],
        );
        expect(merged.map((r) => r.symbol)).toEqual(['TASI', 'AAPL']);
    });

    it('keeps one row per symbol, preferring the local one', () => {
        const merged = mergeSearchResults(
            [{ symbol: 'TASI', description: 'Tadawul All Shares Index', type: 'Index' }],
            [{ symbol: 'tasi', description: 'something the feed thought it knew' }],
        );
        expect(merged).toHaveLength(1);
        expect(merged[0].description).toBe('Tadawul All Shares Index');
    });

    it('drops rows without a symbol and survives an empty half', () => {
        expect(mergeSearchResults([], [{ symbol: 'AAPL' }])).toHaveLength(1);
        expect(mergeSearchResults([{ symbol: 'TASI' }], [])).toHaveLength(1);
        expect(mergeSearchResults([{ description: 'no symbol' } as { symbol?: string }], [])).toHaveLength(0);
    });
});

// The Saudi indices are not companies: Finnhub's search does not know TASI, and the local Saudi
// table answers Arabic company queries only. A trader who types the index — in either script —
// must find it, so the index gets its own small directory and its own test.
import { describe, expect, it } from 'vitest';
import { SAUDI_INDICES, searchSaudiIndices } from '@/lib/saudi-indices';

describe('the Saudi index directory', () => {
    it('covers the index the app can chart', () => {
        expect(SAUDI_INDICES.map((index) => index.symbol)).toEqual(['TASI']);
    });

    it('finds the index by its own ticker, either case', () => {
        expect(searchSaudiIndices('TASI').map((i) => i.symbol)).toEqual(['TASI']);
        expect(searchSaudiIndices('tasi').map((i) => i.symbol)).toEqual(['TASI']);
    });

    it('finds the index by the name a trader would type', () => {
        expect(searchSaudiIndices('Tadawul All Shares Index').map((i) => i.symbol)).toEqual(['TASI']);
        expect(searchSaudiIndices('tadawul all shares').map((i) => i.symbol)).toEqual(['TASI']);
        expect(searchSaudiIndices('all shares index').map((i) => i.symbol)).toEqual(['TASI']);
    });

    it('finds the index by its Arabic names', () => {
        expect(searchSaudiIndices('المؤشر العام').map((i) => i.symbol)).toEqual(['TASI']);
        expect(searchSaudiIndices('تاسي').map((i) => i.symbol)).toEqual(['TASI']);
        // Diacritics and the alef/ya spelling variants must not defeat the match.
        expect(searchSaudiIndices('مؤشر تداول').map((i) => i.symbol)).toEqual(['TASI']);
    });

    it('leaves companies to Finnhub: a Latin company query answers nothing here', () => {
        expect(searchSaudiIndices('AAPL')).toEqual([]);
        expect(searchSaudiIndices('apple')).toEqual([]);
        expect(searchSaudiIndices('Saudi Aramco')).toEqual([]);
    });

    it('ignores a query too short to be meaningful', () => {
        expect(searchSaudiIndices('')).toEqual([]);
        expect(searchSaudiIndices('t')).toEqual([]);
    });
});

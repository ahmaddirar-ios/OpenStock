// The ribbon answers one question in one line: what is the market doing, right now? Its formatting is
// the whole product, so it is pure and tested apart from the markup that prints it.
import { describe, expect, it } from 'vitest';
import { compactFigure, formatPrice, ribbonQuotes, signedPercent } from '@/lib/market-ribbon';
import type { WorldBoardPayload } from '@/lib/world-board';

const payload = (): WorldBoardPayload => ({
    asOf: 0,
    sections: [
        {
            section: { id: 'gulf', nameKey: 'world.section.gulf', rows: [] },
            quotes: [
                { ticker: 'TADAWUL:TASI', short: 'TASI', price: 10095.42, changePercent: 0.56 },
                { ticker: 'DFM:DFMGI', short: 'DFMGI', price: 6040.74, changePercent: -1.02 },
            ],
        },
        {
            section: { id: 'world', nameKey: 'world.section.world', rows: [] },
            quotes: [{ ticker: 'FOREXCOM:SPXUSD', short: 'SPX', price: 6743.1, changePercent: 0.29 }],
        },
    ],
} as unknown as WorldBoardPayload);

describe('the market ribbon', () => {
    it('takes the indices in reading order and ignores the rest', () => {
        const rows = ribbonQuotes(payload());
        expect(rows.map((row) => row.short)).toEqual(['TASI', 'DFMGI', 'SPX']);
        expect(rows[0].price).toBe(10095.42);
    });

    it('prints an index the feed did not answer as absent, not as zero', () => {
        const rows = ribbonQuotes(payload(), ['TASI', 'EGX30']);
        expect(rows).toHaveLength(1);
        expect(rows[0].short).toBe('TASI');
    });
});

describe('ribbon figures', () => {
    it('compacts rials into the unit a trader reads at a glance', () => {
        expect(compactFigure(4_484_633_653, 'en')).toBe('4.5B');
        expect(compactFigure(4_484_633_653, 'ar')).toBe('٤٫٥ مليار');
        expect(compactFigure(252_576_527, 'en')).toBe('253M');
        expect(compactFigure(252_576_527, 'ar')).toBe('٢٥٣ مليون');
        expect(compactFigure(9_500, 'en')).toBe('9.5K');
        expect(compactFigure(120, 'en')).toBe('120');
    });

    it('groups a last price and keeps two decimals in either script', () => {
        expect(formatPrice(10095.4, 'en')).toBe('10,095.40');
        expect(formatPrice(10095.4, 'ar')).toBe('١٠٬٠٩٥٫٤٠');
    });

    it('signs a change the way a terminal does, and keeps zero unsigned', () => {
        expect(signedPercent(1.24, 'en')).toBe('+1.24%');
        expect(signedPercent(-0.5, 'ar')).toBe('−٠٫٥٠٪');
        expect(signedPercent(0, 'en')).toBe('0.00%');
    });
});

import { describe, expect, it } from 'vitest';
import { printChange, printDay, printDocumentTitle, printRange, printStudies } from '@/lib/chart/print';

const at = new Date(Date.UTC(2026, 10, 7, 9, 30));

describe('printDay', () => {
    it('reads a bar as a UTC day, so the same bar prints the same everywhere', () => {
        // 2026-10-06T00:00:00Z
        expect(printDay(Date.UTC(2026, 9, 6) / 1000)).toBe('6 Oct 2026');
        // 23:30 UTC is still the same day, even though it is already tomorrow in Riyadh.
        expect(printDay(Date.UTC(2026, 9, 6, 23, 30) / 1000)).toBe('6 Oct 2026');
    });
});

describe('printDocumentTitle', () => {
    it('strips the exchange suffix and stamps the day, so the PDF has a sane name', () => {
        expect(printDocumentTitle({ symbol: '4013.SR', interval: '60m', printedAt: at })).toBe('rovex-4013SR-60m-2026-11-07');
    });
});

describe('printRange', () => {
    it('names a single day once', () => {
        const from = Date.UTC(2026, 9, 6, 9) / 1000;
        const to = Date.UTC(2026, 9, 6, 15) / 1000;
        expect(printRange(from, to)).toBe('6 Oct 2026');
    });

    it('names both ends of a longer chart with an arrow', () => {
        expect(printRange(Date.UTC(2026, 9, 6) / 1000, Date.UTC(2026, 10, 7) / 1000)).toBe('6 Oct 2026 → 7 Nov 2026');
    });

    it('has nothing to say without both ends', () => {
        expect(printRange(undefined, 10)).toBeNull();
        expect(printRange(10, undefined)).toBeNull();
    });
});

describe('printChange', () => {
    it('spells out the sign on paper', () => {
        expect(printChange(0.42)).toBe('+0.42%');
        expect(printChange(-0.42)).toBe('-0.42%');
    });

    it('does not invent a sign for a flat session', () => {
        expect(printChange(0)).toBe('0.00%');
    });

    it('prints a dash when the feed sent no comparison', () => {
        expect(printChange(undefined)).toBe('—');
        expect(printChange(null)).toBe('—');
        expect(printChange(Number.NaN)).toBe('—');
    });
});

describe('printStudies', () => {
    it('joins the legend into one line', () => {
        expect(printStudies(['SMA 20', ' RSI 14 ', ''])).toBe('SMA 20 · RSI 14');
    });

    it('is null when the chart carries no studies', () => {
        expect(printStudies([])).toBeNull();
        expect(printStudies(['   '])).toBeNull();
    });
});

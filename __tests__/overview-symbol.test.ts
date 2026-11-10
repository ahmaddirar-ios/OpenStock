import { describe, expect, it } from 'vitest';
import { isSymbolLike, overviewSymbol } from '@/lib/shell/command';

// The overview chart opens on the last stock the trader read, and on the index when there is no
// history. The value arrives from a cookie, so it is untrusted input: a stale or forged string must
// become the index rather than a chart request for something that is not a symbol.
describe('the overview chart symbol', () => {
    it('opens on the last stock the trader read', () => {
        expect(overviewSymbol('2222.SR')).toBe('2222.SR');
        expect(overviewSymbol('aapl')).toBe('AAPL');
        expect(overviewSymbol(' 0700.HK ')).toBe('0700.HK');
    });

    it('falls back to the index when there is no history', () => {
        expect(overviewSymbol(null)).toBe('TASI');
        expect(overviewSymbol(undefined)).toBe('TASI');
        expect(overviewSymbol('')).toBe('TASI');
        expect(overviewSymbol('   ')).toBe('TASI');
    });

    it('refuses anything that is not a symbol', () => {
        expect(overviewSymbol('javascript:alert(1)')).toBe('TASI');
        expect(overviewSymbol('2222 SR')).toBe('TASI');
        expect(overviewSymbol('<script>')).toBe('TASI');
        expect(overviewSymbol('A'.repeat(32))).toBe('TASI');
    });

    it('keeps an index alias the trader opened on purpose', () => {
        expect(overviewSymbol('TASI')).toBe('TASI');
        expect(overviewSymbol('TADAWUL:TASI')).toBe('TADAWUL:TASI');
    });

    // The shell asks the same question before it writes the cookie: a URL segment that is not a
    // symbol never becomes a cookie value.
    it('agrees with the shell about what a cookie may hold', () => {
        expect(isSymbolLike('2222.SR')).toBe(true);
        expect(isSymbolLike('AAPL')).toBe(true);
        expect(isSymbolLike('javascript:alert(1)')).toBe(false);
        expect(isSymbolLike('a;b=c')).toBe(false);
        expect(isSymbolLike(null)).toBe(false);
    });
});

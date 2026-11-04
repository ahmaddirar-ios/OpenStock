import { describe, expect, it } from 'vitest';
import { isWaitlistEmail, normalizeWaitlistEmail } from '@/lib/waitlist';

describe('waitlist email', () => {
    it('accepts an ordinary address', () => {
        expect(isWaitlistEmail('trader@rovexjo.com')).toBe(true);
        expect(isWaitlistEmail('  a.b+tag@mail.co.uk ')).toBe(true);
    });

    it('rejects what is not an address', () => {
        for (const bad of ['', 'no-at-sign', 'two@@at.com', 'spaces in@mail.com', 'user@nodot', 'user@.com', 42, null]) {
            expect(isWaitlistEmail(bad as unknown)).toBe(false);
        }
    });

    it('rejects an address longer than the RFC limit', () => {
        expect(isWaitlistEmail(`${'a'.repeat(250)}@b.com`)).toBe(false);
    });

    it('stores the address lowercased and trimmed', () => {
        expect(normalizeWaitlistEmail('  Trader@RovexJO.com ')).toBe('trader@rovexjo.com');
    });
});

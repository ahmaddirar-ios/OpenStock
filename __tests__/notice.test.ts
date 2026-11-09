import { describe, expect, it } from 'vitest';
import {
    EMPTY_NOTICE,
    NOTICE_LEVELS,
    isNoticeLevel,
    normalizeNotice,
    noticeIsLive,
    safeNoticeHref,
} from '@/lib/notice';
import { FLAG_DEFAULTS, FLAG_KEYS, isFlagKey } from '@/lib/flags';

describe('the site notice', () => {
    it('names every level in both languages', async () => {
        const { tx } = await import('@/lib/i18n');
        for (const level of NOTICE_LEVELS) {
            const key = `admin.content.level.${level}` as never;
            expect(tx('en', key)).not.toBe(key);
            expect(tx('ar', key)).not.toBe(key);
        }
    });

    it('recognises only the three levels', () => {
        for (const level of NOTICE_LEVELS) expect(isNoticeLevel(level)).toBe(true);
        expect(isNoticeLevel('loud')).toBe(false);
        expect(isNoticeLevel(null)).toBe(false);
    });

    it('keeps an http(s) link and refuses anything else', () => {
        expect(safeNoticeHref('/pricing')).toBe('/pricing');
        expect(safeNoticeHref('https://rovexjo.com/pricing')).toBe('https://rovexjo.com/pricing');
        expect(safeNoticeHref('javascript:alert(1)')).toBe('');
        expect(safeNoticeHref('  ')).toBe('');
        expect(safeNoticeHref(42)).toBe('');
    });

    it('repairs an untrusted payload to the full shape', () => {
        const notice = normalizeNotice({
            messageEn: '  Maintenance tonight  ',
            messageAr: '',
            level: 'loud',
            href: 'javascript:alert(1)',
            linkLabelEn: 'Read',
            linkLabelAr: 7,
            active: 'yes',
            expiresAt: 'not-a-date',
        });
        expect(notice).toMatchObject({
            messageEn: 'Maintenance tonight',
            messageAr: '',
            level: 'info',
            href: '',
            linkLabelEn: 'Read',
            linkLabelAr: '',
            active: false,
            expiresAt: null,
        });
    });

    it('falls back to empty for nothing at all', () => {
        expect(normalizeNotice(null)).toEqual(EMPTY_NOTICE);
        expect(normalizeNotice('nope')).toEqual(EMPTY_NOTICE);
    });

    it('truncates long text instead of storing it', () => {
        expect(normalizeNotice({ messageEn: 'x'.repeat(500) }).messageEn).toHaveLength(240);
    });

    it('is live only when on, not empty and not expired', () => {
        const live = { ...EMPTY_NOTICE, messageEn: 'Hello', active: true };
        expect(noticeIsLive(live)).toBe(true);
        expect(noticeIsLive({ ...live, active: false })).toBe(false);
        expect(noticeIsLive({ ...EMPTY_NOTICE, active: true })).toBe(false);
        expect(noticeIsLive({ ...live, expiresAt: new Date(Date.now() - 1000).toISOString() })).toBe(false);
        expect(noticeIsLive({ ...live, expiresAt: new Date(Date.now() + 60_000).toISOString() })).toBe(true);
    });

    it('accepts the Arabic message alone', () => {
        const arabicOnly = { ...EMPTY_NOTICE, messageAr: 'صيانة الليلة', active: true };
        expect(noticeIsLive(arabicOnly)).toBe(true);
    });
});

describe('feature flags', () => {
    it('answers only for keys the product reads', () => {
        for (const key of FLAG_KEYS) expect(isFlagKey(key)).toBe(true);
        expect(isFlagKey('dashboard.ghost')).toBe(false);
        expect(isFlagKey(undefined)).toBe(false);
    });

    it('owns a default for every key', () => {
        for (const key of FLAG_KEYS) expect(typeof FLAG_DEFAULTS[key]).toBe('boolean');
        expect(Object.keys(FLAG_DEFAULTS).sort()).toEqual([...FLAG_KEYS].sort());
    });

    it('describes every flag in both languages', async () => {
        const { tx } = await import('@/lib/i18n');
        for (const key of FLAG_KEYS) {
            const label = `admin.flags.desc.${key}` as never;
            expect(tx('en', label)).not.toBe(label);
            expect(tx('ar', label)).not.toBe(label);
        }
    });
});

import { describe, expect, it } from 'vitest';
import { SHORTCUTS, shortcutFor } from '@/lib/shell/shortcuts';
import { tx, type Lang } from '@/lib/i18n';

const key = (over: Record<string, unknown> & { key: string }) => ({
    metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over,
});

describe('the desktop shortcuts', () => {
    it('reads ⌘K, ⌘B, ⌘⇧L and ⌘/ off the keyboard', () => {
        expect(shortcutFor(key({ key: 'k', metaKey: true }))).toBe('command');
        expect(shortcutFor(key({ key: 'b', metaKey: true }))).toBe('sidebar');
        expect(shortcutFor(key({ key: 'L', metaKey: true, shiftKey: true }))).toBe('language');
        expect(shortcutFor(key({ key: '/', metaKey: true }))).toBe('sheet');
    });

    it('answers Ctrl as well, so the same keys work off a Mac', () => {
        expect(shortcutFor(key({ key: 'k', ctrlKey: true }))).toBe('command');
        expect(shortcutFor(key({ key: 'b', ctrlKey: true }))).toBe('sidebar');
    });

    it('leaves the browser its own keys', () => {
        // Bare letters are typing, and ⌘L / ⌘⇧B / ⌘⇧/ belong to the browser (address bar,
        // bookmarks, "search the web"), so none of them may be taken.
        expect(shortcutFor(key({ key: 'b' }))).toBeNull();
        expect(shortcutFor(key({ key: 'l', metaKey: true }))).toBeNull();
        expect(shortcutFor(key({ key: 'B', metaKey: true, shiftKey: true }))).toBeNull();
        expect(shortcutFor(key({ key: '?', metaKey: true, shiftKey: true }))).toBeNull();
        expect(shortcutFor(key({ key: 'k', metaKey: true, altKey: true }))).toBeNull();
    });

    it('lists every shortcut once, with a key and a label in both languages', () => {
        const ids = SHORTCUTS.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const shortcut of SHORTCUTS) {
            expect(shortcut.keys.length).toBeGreaterThan(1);
            for (const lang of ['en', 'ar'] as Lang[]) {
                const label = tx(lang, shortcut.labelKey);
                expect(label, `${shortcut.id} has no ${lang} label`).not.toBe(shortcut.labelKey);
            }
        }
    });
});

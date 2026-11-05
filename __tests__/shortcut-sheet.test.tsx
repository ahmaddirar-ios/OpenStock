// @vitest-environment jsdom
// ⌘/ has to name the keys that really work, and only those. The sheet is the manual, so it reads
// from the same list the key handler reads from.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import ShortcutSheet, { openShortcuts } from '@/components/shell/ShortcutSheet';
import { SHORTCUTS } from '@/lib/shell/shortcuts';

afterEach(cleanup);

describe('the shortcut sheet', () => {
    it('stays shut until a key asks for it', () => {
        render(<ShortcutSheet lang="en" />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('lists every shortcut with its keys once opened', () => {
        render(<ShortcutSheet lang="en" />);
        act(() => openShortcuts());

        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(screen.getByText('Keyboard')).toBeTruthy();
        for (const shortcut of SHORTCUTS) {
            for (const cap of shortcut.keys) {
                expect(screen.getAllByText(cap).length).toBeGreaterThan(0);
            }
        }
        // ⌘/ itself is on the list, and it is the only place the sheet names itself.
        expect(screen.getByText('This list')).toBeTruthy();
    });

    it('speaks Arabic when the page does', () => {
        render(<ShortcutSheet lang="ar" />);
        act(() => openShortcuts());
        expect(screen.getByText('لوحة المفاتيح')).toBeTruthy();
        expect(screen.getByText('هذه القائمة')).toBeTruthy();
    });
});

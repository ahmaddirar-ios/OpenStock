import type { StringKey } from '@/lib/i18n';

/**
 * The keys the terminal really owns. Everything else a browser binds — ⌘T, ⌘W, ⌘1–9, ⌘L — is
 * left alone: a shortcut that fights the address bar is worse than no shortcut.
 */
export type ShortcutId = 'command' | 'sidebar' | 'language' | 'sheet';

export type Shortcut = {
    id: ShortcutId;
    /** As the sheet prints them, in the order a Mac keyboard reads them. */
    keys: readonly string[];
    labelKey: StringKey;
};

export const SHORTCUTS: readonly Shortcut[] = [
    { id: 'command', keys: ['⌘', 'K'], labelKey: 'shortcut.command' },
    { id: 'sidebar', keys: ['⌘', 'B'], labelKey: 'shortcut.sidebar' },
    { id: 'language', keys: ['⌘', '⇧', 'L'], labelKey: 'shortcut.language' },
    { id: 'sheet', keys: ['⌘', '/'], labelKey: 'shortcut.sheet' },
];

type KeyLike = {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
};

/** The letter of each binding is the last key the sheet prints; the shift is its own key. */
const BINDINGS = SHORTCUTS.map((shortcut) => ({
    id: shortcut.id,
    key: shortcut.keys[shortcut.keys.length - 1].toLowerCase(),
    shift: shortcut.keys.includes('⇧'),
}));

/**
 * One keyboard event to one shortcut, or nothing. Ctrl answers as ⌘ does, so the same sheet is
 * true on a Windows keyboard. `alt` and any unmatched shift are deliberately not ours.
 */
export function shortcutFor(event: KeyLike): ShortcutId | null {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
    const shift = event.shiftKey === true;
    const pressed = (event.key ?? '').toLowerCase();
    for (const binding of BINDINGS) {
        if (binding.key === pressed && binding.shift === shift) return binding.id;
    }
    return null;
}

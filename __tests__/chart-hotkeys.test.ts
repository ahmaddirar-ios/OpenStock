import { describe, expect, it } from 'vitest';
import { TOOL_SHORTCUTS, EDIT_SHORTCUTS, toolForKey } from '@/lib/chart-hotkeys';

describe('chart hotkeys', () => {
    it('arms a tool from a bare letter, in either case', () => {
        expect(toolForKey('t')).toBe('trend');
        expect(toolForKey('T')).toBe('trend');
        expect(toolForKey('f')).toBe('fib');
        expect(toolForKey('esc')).toBeNull();
        expect(toolForKey('')).toBeNull();
    });

    it('never maps two tools to the same key', () => {
        const keys = TOOL_SHORTCUTS.map((s) => s.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('uses one letter per shortcut', () => {
        for (const shortcut of TOOL_SHORTCUTS) expect(shortcut.key).toMatch(/^[a-z]$/);
    });

    it('keeps the editing list free of tool letters', () => {
        // A bare letter must never mean two things; every editor shortcut carries a modifier or is Esc/?.
        for (const shortcut of EDIT_SHORTCUTS) {
            expect(shortcut.keys === 'Esc' || shortcut.keys === '?' || shortcut.keys.includes('+')).toBe(true);
        }
    });
});

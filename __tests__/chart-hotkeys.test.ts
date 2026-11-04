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

import { textStyleOf, parseDrawingList, TEXT_SIZES } from '@/lib/chart-drawings';

describe('note text styling', () => {
    const note = (extra: Record<string, unknown> = {}) => ({
        id: 'n1', tool: 'text', points: [{ time: 1, price: 2 }], text: 'Watching 26.20', ...extra,
    });

    it('defaults to the medium weight and size', () => {
        const [drawing] = parseDrawingList([note()]);
        expect(textStyleOf(drawing)).toEqual({ fontSize: 12, fontWeight: 500 });
    });

    it('keeps a chosen size and bold', () => {
        const [drawing] = parseDrawingList([note({ textSize: 'lg', bold: true })]);
        expect(drawing.textSize).toBe('lg');
        expect(drawing.bold).toBe(true);
        expect(textStyleOf(drawing)).toEqual({ fontSize: 15, fontWeight: 700 });
    });

    it('drops styling on a tool that carries no words', () => {
        const [drawing] = parseDrawingList([{ id: 'l1', tool: 'trend', points: [{ time: 1, price: 2 }, { time: 3, price: 4 }], textSize: 'lg', bold: true }]);
        expect(drawing.textSize).toBeUndefined();
        expect(drawing.bold).toBeUndefined();
    });

    it('rejects a size it does not paint', () => {
        const [drawing] = parseDrawingList([note({ textSize: 'huge' })]);
        expect(TEXT_SIZES).not.toContain(drawing.textSize);
        expect(drawing.textSize).toBeUndefined();
    });
});

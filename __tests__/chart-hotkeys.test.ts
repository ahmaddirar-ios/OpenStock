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
        expect(textStyleOf(drawing)).toEqual({ fontSize: 12, fontWeight: 500, fontStyle: 'normal' });
    });

    it('keeps a chosen size and bold', () => {
        const [drawing] = parseDrawingList([note({ textSize: 'lg', bold: true })]);
        expect(drawing.textSize).toBe('lg');
        expect(drawing.bold).toBe(true);
        expect(textStyleOf(drawing)).toEqual({ fontSize: 15, fontWeight: 700, fontStyle: 'normal' });
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

import { MAGNET_PIXELS_BY_STRENGTH, magnetPixels, nextMagnetStrength } from '@/lib/chart-magnet';

describe('magnet strength', () => {
    it('cycles off → weak → strong → off', () => {
        expect(nextMagnetStrength('off')).toBe('weak');
        expect(nextMagnetStrength('weak')).toBe('strong');
        expect(nextMagnetStrength('strong')).toBe('off');
    });

    it('pulls harder when it is set to strong', () => {
        expect(magnetPixels('off')).toBe(0);
        expect(magnetPixels('weak')).toBe(8);
        expect(magnetPixels('strong')).toBe(20);
        expect(magnetPixels('strong')).toBeGreaterThan(MAGNET_PIXELS_BY_STRENGTH.weak);
    });
});

import { FILL_OPACITIES, fillOf, hasFill, parseDrawingList as parseDrawings2, textStyleOf as styleOf } from '@/lib/chart-drawings';

describe('fill and italic', () => {
    const box = (extra: Record<string, unknown> = {}) => ({
        id: 'b1', tool: 'rectangle', points: [{ time: 1, price: 2 }, { time: 3, price: 4 }], ...extra,
    });

    it('keeps the tool’s own fill until the trader changes it', () => {
        const [drawing] = parseDrawings2([box()]);
        expect(hasFill('rectangle')).toBe(true);
        expect(hasFill('trend')).toBe(false);
        expect(fillOf(drawing)).toEqual({ color: 'blue', opacity: 12 });
    });

    it('reads a chosen fill colour and strength', () => {
        const [drawing] = parseDrawings2([box({ fill: 'gold', fillOpacity: 40 })]);
        expect(drawing.fill).toBe('gold');
        expect(drawing.fillOpacity).toBe(40);
        expect(fillOf(drawing)).toEqual({ color: 'gold', opacity: 40 });
        expect(FILL_OPACITIES).toContain(40);
    });

    it('drops a fill on a tool that encloses nothing', () => {
        const [drawing] = parseDrawings2([{ id: 't1', tool: 'trend', points: [{ time: 1, price: 2 }, { time: 3, price: 4 }], fill: 'gold', fillOpacity: 40 }]);
        expect(drawing.fill).toBeUndefined();
        expect(drawing.fillOpacity).toBeUndefined();
    });

    it('slants a note when asked', () => {
        const [drawing] = parseDrawings2([{ id: 'n1', tool: 'text', points: [{ time: 1, price: 2 }], text: 'watch', italic: true }]);
        expect(styleOf(drawing)).toMatchObject({ fontStyle: 'italic', fontWeight: 500 });
    });
});

import { visibleOn } from '@/lib/chart-drawings';

describe('drawing visibility by interval', () => {
    it('shows everywhere by default', () => {
        expect(visibleOn({}, '1d')).toBe(true);
        expect(visibleOn({ timeframes: [] }, '1h')).toBe(true);
    });

    it('hides on the intervals it was not given', () => {
        const level = { timeframes: ['1d', '1w'] };
        expect(visibleOn(level, '1d')).toBe(true);
        expect(visibleOn(level, '5m')).toBe(false);
    });

    it('keeps only sane ids when read from storage', () => {
        const [drawing] = parseDrawings2([{ id: 'x', tool: 'trend', points: [{ time: 1, price: 2 }, { time: 3, price: 4 }], timeframes: ['1d', '1d', 42, ''] }]);
        expect(drawing.timeframes).toEqual(['1d']);
    });
});

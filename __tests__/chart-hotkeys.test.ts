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

describe('note background', () => {
    it('keeps a chip flag on a note and drops it elsewhere', () => {
        const [note] = parseDrawings2([{ id: 'n', tool: 'text', points: [{ time: 1, price: 2 }], text: 'x', background: true }]);
        expect(note.background).toBe(true);
        const [line] = parseDrawings2([{ id: 'l', tool: 'trend', points: [{ time: 1, price: 2 }, { time: 3, price: 4 }], background: true }]);
        expect(line.background).toBeUndefined();
    });
});

import { fibLevels, fibRatiosOf, hasFibLevels, MAX_FIB_LEVELS } from '@/lib/chart-drawings';

describe('Fibonacci levels', () => {
    const fib = (extra: Record<string, unknown> = {}) => ({
        id: 'f1', tool: 'fib', points: [{ time: 1, price: 100 }, { time: 9, price: 200 }], ...extra,
    });

    it('knows which tools have editable levels', () => {
        expect(hasFibLevels('fib')).toBe(true);
        expect(hasFibLevels('fibext')).toBe(true);
        expect(hasFibLevels('fibfan')).toBe(false);
        expect(hasFibLevels('trend')).toBe(false);
    });

    it('draws the classic set until a trader keeps their own', () => {
        const [defaults] = parseDrawings2([fib()]);
        expect(fibRatiosOf(defaults)).toContain(0.618);
        const [custom] = parseDrawings2([fib({ fibLevels: [0, 0.75] })]);
        expect(fibRatiosOf(custom)).toEqual([0, 0.75]);
    });

    it('sorts, de-duplicates and caps what it is given', () => {
        const [drawing] = parseDrawings2([fib({ fibLevels: [1, 0.5, 1, 'x', 0.5] })]);
        expect(drawing.fibLevels).toEqual([0.5, 1]);
        const many = Array.from({ length: 40 }, (_, i) => i / 10);
        const [capped] = parseDrawings2([fib({ fibLevels: many })]);
        expect(capped.fibLevels).toHaveLength(MAX_FIB_LEVELS);
    });

    it('drops levels on a tool that draws none', () => {
        const [line] = parseDrawings2([{ id: 'l', tool: 'trend', points: [{ time: 1, price: 2 }, { time: 3, price: 4 }], fibLevels: [0.5] }]);
        expect(line.fibLevels).toBeUndefined();
    });

    it('places a custom level where the ratio says', () => {
        const a = { time: 1, price: 100 };
        const b = { time: 9, price: 200 };
        const level = fibLevels(a, b, [0.5]).find((l) => l.ratio === 0.5);
        expect(level?.price).toBe(150);
    });
});

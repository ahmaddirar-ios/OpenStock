// @vitest-environment jsdom
// Organising a chart's drawings: what is painted on top of what, and the stroke a *new* drawing of a
// tool starts with. Both are rules the trader sets once and expects to keep, so both live in lib and
// are proved here rather than in the component.
import { describe, expect, it } from 'vitest';
import { layerDrawings, layerDrawingsMany, type Drawing } from '@/lib/chart/drawings';
import {
    DRAWING_STYLES_KEY,
    loadDrawingStyles,
    parseDrawingStyles,
    saveDrawingStyles,
    styleFor,
    withDrawingStyle,
    withoutDrawingStyle,
} from '@/lib/chart/drawing-styles';

const list = (ids: string[]): Drawing[] =>
    ids.map((id) => ({ id, tool: 'trend', points: [{ time: 1000, price: 10 }, { time: 2000, price: 12 }] }));
const ids = (drawings: Drawing[]): string[] => drawings.map((d) => d.id);

// This runner's jsdom has no localStorage (a store needs a real origin), so it is faked here the way
// a browser provides one. The library reads window.localStorage at call time, hence the define.
const store = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, String(value)),
        removeItem: (key: string) => void store.delete(key),
        clear: () => store.clear(),
    },
});

describe('the stacking order of the drawings', () => {
    it('paints a drawing last when it is brought to the front', () => {
        // The SVG paints its children in order, so the end of the list is the top of the pile.
        expect(ids(layerDrawings(list(['a', 'b', 'c']), 'a', 'front'))).toEqual(['b', 'c', 'a']);
    });

    it('paints a drawing first when it is sent to the back', () => {
        expect(ids(layerDrawings(list(['a', 'b', 'c']), 'b', 'back'))).toEqual(['b', 'a', 'c']);
    });

    it('leaves the list untouched when the move would change nothing', () => {
        // Same reference: an undo step that does nothing is worse than no step at all.
        const drawings = list(['a', 'b', 'c']);
        expect(layerDrawings(drawings, 'c', 'front')).toBe(drawings);
        expect(layerDrawings(drawings, 'a', 'back')).toBe(drawings);
        expect(layerDrawings(drawings, 'missing', 'front')).toBe(drawings);
    });

    it('lifts a whole selection to the front, keeping its own order', () => {
        // a and c are picked; they rise together, in the order they already had, above b.
        expect(ids(layerDrawingsMany(list(['a', 'b', 'c', 'd']), ['a', 'c'], 'front'))).toEqual(['b', 'd', 'a', 'c']);
    });

    it('drops a whole selection to the back, keeping its own order', () => {
        expect(ids(layerDrawingsMany(list(['a', 'b', 'c', 'd']), ['b', 'd'], 'back'))).toEqual(['b', 'd', 'a', 'c']);
    });

    it('does nothing for an empty or unknown selection', () => {
        const drawings = list(['a', 'b']);
        expect(layerDrawingsMany(drawings, [], 'front')).toBe(drawings);
        expect(layerDrawingsMany(drawings, ['missing'], 'back')).toBe(drawings);
    });
});

describe('the stroke a tool starts with', () => {
    it('remembers it per tool', () => {
        const styles = withDrawingStyle({}, 'trend', { color: 'gold', width: 3 });
        expect(styleFor('trend', styles)).toEqual({ color: 'gold', width: 3 });
        expect(styleFor('horizontal', styles)).toEqual({});
    });

    it('forgets a tool when asked, and drops an empty stroke instead of storing one', () => {
        const styles = withDrawingStyle({}, 'trend', { color: 'gold' });
        expect(withoutDrawingStyle(styles, 'trend')).toEqual({});
        // Saving nothing at all is the same as clearing: there is no style to apply.
        expect(withDrawingStyle(styles, 'trend', {})).toEqual({});
    });

    it('never applies the stroke of one tool to another tool', () => {
        const styles = withDrawingStyle(withDrawingStyle({}, 'rectangle', { dash: 'dotted' }), 'fib', { color: 'cyan' });
        expect(styleFor('fib', styles)).toEqual({ color: 'cyan' });
        expect(styleFor('rectangle', styles)).toEqual({ dash: 'dotted' });
        expect(styleFor('ellipse', styles)).toEqual({});
    });

    it('survives a round trip through storage', () => {
        localStorage.clear();
        expect(loadDrawingStyles()).toEqual({});
        const styles = withDrawingStyle({}, 'gannfan', { color: 'violet', width: 2, dash: 'dashed' });
        saveDrawingStyles(styles);
        expect(loadDrawingStyles()).toEqual(styles);
    });

    it('survives a corrupted or foreign store', () => {
        localStorage.setItem(DRAWING_STYLES_KEY, 'not json');
        expect(loadDrawingStyles()).toEqual({});
        // A stroke whose parts are not in the palette is dropped part by part, never trusted.
        expect(parseDrawingStyles('{"trend":{"color":"chartreuse","width":9,"dash":"wavy"}}')).toEqual({});
        expect(parseDrawingStyles('{"trend":{"color":"gold","width":9}}')).toEqual({ trend: { color: 'gold' } });
        expect(parseDrawingStyles('{"notATool":{"color":"gold"}}')).toEqual({});
        expect(parseDrawingStyles('[1,2,3]')).toEqual({});
        expect(parseDrawingStyles(null)).toEqual({});
    });
});

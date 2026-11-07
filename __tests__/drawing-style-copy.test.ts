import { describe, expect, it } from 'vitest';
import { applyCopiedStyle, copyStyleOf, sameStyle } from '@/lib/drawing-style-copy';
import { canExtend, extendSegment, parseDrawingList, type Drawing } from '@/lib/chart-drawings';

const base = (patch: Partial<Drawing> = {}): Drawing => ({
    id: 'd1',
    tool: 'trend',
    points: [
        { time: 100, price: 10 },
        { time: 200, price: 20 },
    ],
    ...patch,
});

describe('copyStyleOf', () => {
    it('takes the stroke and leaves the geometry and the words behind', () => {
        const source = base({ color: 'red', width: 3, dash: 'dotted', customColor: '#123456' });
        expect(copyStyleOf(source)).toEqual({ color: 'red', width: 3, dash: 'dotted', customColor: '#123456' });
    });

    it('only carries a fill for a shape that encloses one', () => {
        expect(copyStyleOf(base({ fill: 'red', fillOpacity: 20 }))).toEqual({});
        expect(copyStyleOf(base({ tool: 'rectangle', fill: 'red', fillOpacity: 20 }))).toEqual({ fill: 'red', fillOpacity: 20 });
    });

    it('only carries type styling for a tool that carries words', () => {
        const note = base({ tool: 'text', textSize: 'lg', bold: true, italic: true, background: true, textColor: 'teal' });
        expect(copyStyleOf(note)).toEqual({ textSize: 'lg', bold: true, italic: true, background: true, textColor: 'teal' });
        expect(copyStyleOf(base({ textSize: 'lg', bold: true }))).toEqual({});
    });
});

describe('applyCopiedStyle', () => {
    it('paints the target and keeps its own points', () => {
        const target = base({ id: 'd2', color: 'blue', width: 1 });
        const next = applyCopiedStyle(target, { color: 'teal', width: 4, dash: 'dashed' });
        expect(next.points).toEqual(target.points);
        expect(next).toMatchObject({ color: 'teal', width: 4, dash: 'dashed' });
    });

    it('replaces rather than merges: a stale fill does not survive a plain stroke', () => {
        const target = base({ tool: 'rectangle', fill: 'red', fillOpacity: 20, width: 3 });
        const next = applyCopiedStyle(target, { color: 'gold', width: 2 });
        expect(next.fill).toBeUndefined();
        expect(next.fillOpacity).toBeUndefined();
        expect(next.width).toBe(2);
    });

    it('drops the fields the target cannot show', () => {
        const target = base();
        const next = applyCopiedStyle(target, { color: 'teal', fill: 'red', fillOpacity: 20, textSize: 'lg', bold: true });
        expect(next).toMatchObject({ color: 'teal' });
        expect(next.fill).toBeUndefined();
        expect(next.textSize).toBeUndefined();
        expect(next.bold).toBeUndefined();
    });

    it('carries a fill onto a shape and type styling onto a note', () => {
        const shape = applyCopiedStyle(base({ tool: 'rectangle' }), { fill: 'red', fillOpacity: 15 });
        expect(shape).toMatchObject({ fill: 'red', fillOpacity: 15 });
        const note = applyCopiedStyle(base({ tool: 'text', text: 'hi' }), { textSize: 'sm', italic: true });
        expect(note).toMatchObject({ textSize: 'sm', italic: true, text: 'hi' });
    });
});

describe('sameStyle', () => {
    it('is true for two drawings painted the same way, false once one differs', () => {
        expect(sameStyle(base({ color: 'red', width: 2 }), base({ id: 'x', color: 'red', width: 2 }))).toBe(true);
        expect(sameStyle(base({ color: 'red', width: 2 }), base({ id: 'x', color: 'red', width: 3 }))).toBe(false);
    });
});

describe('extendSegment', () => {
    const a = { x: 100, y: 200 };
    const b = { x: 300, y: 100 };

    it('runs to the left edge at the same slope', () => {
        const [from, to] = extendSegment(a, b, 'left', 0, 500);
        expect(from).toEqual({ x: 0, y: 250 });
        expect(to).toEqual(b);
    });

    it('runs to the right edge at the same slope', () => {
        const [from, to] = extendSegment(a, b, 'right', 0, 500);
        expect(from).toEqual(a);
        expect(to).toEqual({ x: 500, y: 0 });
    });

    it('runs both ways, whichever way the two points were clicked', () => {
        const [from, to] = extendSegment(b, a, 'both', 0, 500);
        expect(from).toEqual({ x: 0, y: 250 });
        expect(to).toEqual({ x: 500, y: 0 });
    });
});

describe('the stored extend setting', () => {
    it('survives a round trip on a trend line', () => {
        const [drawing] = parseDrawingList([base({ extend: 'both' })]);
        expect(drawing.extend).toBe('both');
    });

    it('is dropped on a tool that has no ends to lengthen', () => {
        const [drawing] = parseDrawingList([base({ tool: 'rectangle', extend: 'both' })]);
        expect(drawing.extend).toBeUndefined();
    });

    it('is dropped when the value is not one the code knows', () => {
        const [drawing] = parseDrawingList([base({ extend: 'diagonal' as never })]);
        expect(drawing.extend).toBeUndefined();
    });

    it('only the plain trend line offers it', () => {
        expect(canExtend('trend')).toBe(true);
        expect(canExtend('ray')).toBe(false);
        expect(canExtend('extended')).toBe(false);
    });
});

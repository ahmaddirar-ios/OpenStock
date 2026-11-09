import { describe, expect, it } from 'vitest';
import { decodePatternLink, drawingFromLink, encodePatternLink } from '@/lib/pattern-link';

const wave = {
    pattern: 'wolfe' as const,
    direction: 'bullish' as const,
    intervalId: '1d',
    points: [
        { time: 1, price: 100 }, { time: 2, price: 120 }, { time: 3, price: 90 },
        { time: 4, price: 108 }, { time: 5, price: 78 },
    ],
};

describe('the pattern link', () => {
    it('round-trips a hit, interval included', () => {
        expect(decodePatternLink(encodePatternLink(wave))).toEqual(wave);
    });

    it('rejects an unknown pattern id', () => {
        const token = Buffer.from(JSON.stringify({ v: 1, p: 'nope', d: 'bullish', i: '1d', pts: wave.points.map((p) => [p.time, p.price]) })).toString('base64url');
        expect(decodePatternLink(token)).toBeNull();
    });

    it('rejects an interval the chart cannot open on', () => {
        const token = Buffer.from(JSON.stringify({ v: 1, p: 'wolfe', d: 'bullish', i: '7x', pts: wave.points.map((p) => [p.time, p.price]) })).toString('base64url');
        expect(decodePatternLink(token)).toBeNull();
    });

    it('rejects times that do not increase', () => {
        const token = encodePatternLink({ ...wave, points: [wave.points[0], wave.points[0], wave.points[2], wave.points[3], wave.points[4]] });
        expect(decodePatternLink(token)).toBeNull();
    });

    it('rejects a NaN price and an oversized token', () => {
        const bad = Buffer.from(JSON.stringify({ v: 1, p: 'wolfe', d: 'bullish', i: '1d', pts: [[1, null], [2, 1], [3, 1], [4, 1], [5, 1]] })).toString('base64url');
        expect(decodePatternLink(bad)).toBeNull();
        expect(decodePatternLink('a'.repeat(3000))).toBeNull();
        expect(decodePatternLink(undefined)).toBeNull();
    });

    it('refuses to build a drawing whose point count does not match its tool', () => {
        expect(drawingFromLink({ ...wave, pattern: 'triangle', direction: 'bearish' })).toBeNull();
        expect(drawingFromLink(wave)?.tool).toBe('wolfe');
    });

    it('builds an ordinary drawing: an id, the tool, the points and the labels', () => {
        const drawing = drawingFromLink(wave);
        expect(drawing?.id).toBeTruthy();
        expect(drawing?.points).toHaveLength(5);
        expect(drawing?.labels).toEqual(['1', '2', '3', '4', '5']);
        expect(drawing?.color).toBe('teal');
    });
});

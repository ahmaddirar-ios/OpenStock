import { describe, expect, it } from 'vitest';
import { autoPnfBox, pnfBoxes, pointAndFigure } from '@/lib/chart-pnf';

const candles = (closes: number[]) => closes.map((close, index) => ({ time: 1_700_000_000 + index * 60, close }));

describe('Point & Figure', () => {
    it('picks a box a chart can read', () => {
        expect(autoPnfBox(26)).toBe(0.2);
        expect(autoPnfBox(100)).toBe(1);
        expect(autoPnfBox(4)).toBe(0.05);
        expect(autoPnfBox(0)).toBe(1);
    });

    it('draws one rising column while the market climbs', () => {
        const columns = pointAndFigure(candles([10, 10.2, 10.6, 11]), 0.2, 3);
        expect(columns).toHaveLength(1);
        expect(columns[0]).toMatchObject({ direction: 'X', from: 10, to: 11 });
        expect(pnfBoxes(columns[0])).toBe(5);
    });

    it('flips to O only after the reversal count is met', () => {
        // Up to 11, then two boxes down (10.8, 10.6): still one column. A third box flips it.
        const twoDown = pointAndFigure(candles([10, 11, 10.8, 10.6]), 0.2, 3);
        expect(twoDown).toHaveLength(1);
        const threeDown = pointAndFigure(candles([10, 11, 10.8, 10.6, 10.4]), 0.2, 3);
        expect(threeDown).toHaveLength(2);
        expect(threeDown[1].direction).toBe('O');
        expect(threeDown[1].to).toBeLessThan(threeDown[0].to);
    });

    it('gives every column its own time so the library can space them', () => {
        const columns = pointAndFigure(candles([10, 11, 10.2, 11.4, 10.4]), 0.2, 3);
        const times = columns.map((column) => column.time);
        expect(new Set(times).size).toBe(times.length);
        expect([...times].sort((a, b) => a - b)).toEqual(times);
    });

    it('returns nothing for a series too short to make a column', () => {
        expect(pointAndFigure([])).toEqual([]);
        expect(pointAndFigure(candles([10]))).toEqual([]);
    });

    it('treats a silly reversal as one box', () => {
        const columns = pointAndFigure(candles([10, 10.4, 10]), 0.2, 0);
        expect(columns.length).toBeGreaterThan(1);
    });
});

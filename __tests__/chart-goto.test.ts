import { describe, expect, it } from 'vitest';
import { centredRange, nearestBarIndex } from '@/lib/chart-goto';

describe('nearestBarIndex', () => {
    it('finds the bar closest to the target, on either side', () => {
        const times = [100, 200, 300, 400];
        expect(nearestBarIndex(times, 290)).toBe(2);
        expect(nearestBarIndex(times, 210)).toBe(1);
        expect(nearestBarIndex(times, 0)).toBe(0);
        expect(nearestBarIndex(times, 9999)).toBe(3);
    });

    it('returns -1 for an empty series instead of a bogus index', () => {
        expect(nearestBarIndex([], 100)).toBe(-1);
    });
});

describe('centredRange', () => {
    it('opens a window of the requested width around the bar', () => {
        expect(centredRange(50, 100, 20)).toEqual({ from: 40, to: 60 });
    });

    it('clamps at the start so the window never runs before the first bar', () => {
        const range = centredRange(2, 100, 20);
        expect(range.from).toBe(-1);
        expect(range.to).toBe(19);
    });

    it('clamps at the end so the window never runs past the last bar', () => {
        const range = centredRange(98, 100, 20);
        expect(range.to).toBe(100);
        expect(range.from).toBe(80);
    });

    it('never asks for a window wider than the series', () => {
        const range = centredRange(5, 10, 500);
        expect(range.from).toBe(-1);
        expect(range.to).toBe(10);
    });

    it('handles an empty series without dividing by zero', () => {
        expect(centredRange(0, 0, 20)).toEqual({ from: -1, to: 1 });
    });
});

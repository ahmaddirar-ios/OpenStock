import { describe, expect, it } from 'vitest';
import { buildSurface, MAX_SURFACE_AXIS, pickSurfaceAxes, surfaceTone, thinAxis } from '@/lib/strategy-surface';
import type { OptimizerRow } from '@/lib/custom-strategy';

const row = (values: Record<string, number>, sharpe: number | null, totalReturn = 0): OptimizerRow => ({
    values,
    metrics: { sharpe, totalReturn } as OptimizerRow['metrics'],
});

describe('pickSurfaceAxes', () => {
    it('picks the two parameters the search varied most', () => {
        const rows = [
            row({ fast: 5, slow: 20, stop: 2 }, 1),
            row({ fast: 10, slow: 20, stop: 2 }, 1),
            row({ fast: 15, slow: 30, stop: 2 }, 1),
        ];
        expect(pickSurfaceAxes(rows, ['fast', 'slow', 'stop'])).toEqual(['fast', 'slow']);
    });

    it('skips a parameter that never moved, even when it is listed first', () => {
        const rows = [row({ stop: 2, fast: 5, slow: 20 }, 1), row({ stop: 2, fast: 10, slow: 30 }, 1)];
        expect(pickSurfaceAxes(rows, ['stop', 'fast', 'slow'])).toEqual(['fast', 'slow']);
    });

    it('has no surface when fewer than two parameters varied', () => {
        const rows = [row({ fast: 5, slow: 20 }, 1), row({ fast: 10, slow: 20 }, 1)];
        expect(pickSurfaceAxes(rows, ['fast', 'slow'])).toBeNull();
        expect(pickSurfaceAxes([], ['fast', 'slow'])).toBeNull();
    });
});

describe('thinAxis', () => {
    it('keeps every value when the axis is short enough', () => {
        expect(thinAxis([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('keeps both ends and spreads the rest evenly', () => {
        const values = Array.from({ length: 100 }, (_, i) => i + 1);
        const thinned = thinAxis(values, 10);
        expect(thinned).toHaveLength(10);
        expect(thinned[0]).toBe(1);
        expect(thinned[thinned.length - 1]).toBe(100);
        expect(MAX_SURFACE_AXIS).toBeGreaterThan(10);
    });
});

describe('buildSurface', () => {
    const rows = [
        row({ fast: 5, slow: 20 }, 0.5),
        row({ fast: 5, slow: 30 }, 1.5),
        row({ fast: 10, slow: 20 }, -0.5),
        row({ fast: 10, slow: 30 }, 2),
    ];

    it('lays the rows out on the two axes, y by row and x by column', () => {
        const surface = buildSurface(rows, 'fast', 'slow', 'sharpe');
        expect(surface).not.toBeNull();
        expect(surface!.x.values).toEqual([5, 10]);
        expect(surface!.y.values).toEqual([20, 30]);
        expect(surface!.cells[0][0].value).toBe(0.5);
        expect(surface!.cells[1][1].value).toBe(2);
        expect(surface!.min).toBe(-0.5);
        expect(surface!.max).toBe(2);
    });

    it('leaves a corner the search never reached empty instead of zero', () => {
        const surface = buildSurface([row({ fast: 5, slow: 20 }, 1)], 'fast', 'slow', 'sharpe');
        expect(surface!.cells[0][0].value).toBe(1);
        expect(surface!.cells[0][0].row).not.toBeNull();
    });

    it('treats a missing metric as an empty corner', () => {
        const surface = buildSurface([row({ fast: 5, slow: 20 }, null), row({ fast: 10, slow: 20 }, 1)], 'fast', 'slow', 'sharpe');
        expect(surface!.cells[0][0].value).toBeNull();
        expect(surface!.cells[0][1].value).toBe(1);
    });

    it('has no surface when nothing was measured', () => {
        expect(buildSurface([row({ fast: 5, slow: 20 }, null)], 'fast', 'slow', 'sharpe')).toBeNull();
        expect(buildSurface([], 'fast', 'slow', 'sharpe')).toBeNull();
    });
});

describe('surfaceTone', () => {
    it('diverges around zero when the range crosses it', () => {
        const loss = surfaceTone(-1, -1, 1);
        const gain = surfaceTone(1, -1, 1);
        expect(loss).toContain('hsl(0 ');
        expect(gain).toContain('hsl(145 ');
    });

    it('uses one hue when every value is on the same side of zero', () => {
        expect(surfaceTone(0.5, 0.5, 2)).toContain('hsl(145 ');
        expect(surfaceTone(2, 0.5, 2)).toContain('hsl(145 ');
    });

    it('gets stronger as the value rises', () => {
        const alpha = (tone: string) => Number(tone.match(/\/ ([\d.]+)\)/)?.[1] ?? 0);
        expect(alpha(surfaceTone(2, 0.5, 2))).toBeGreaterThan(alpha(surfaceTone(0.5, 0.5, 2)));
    });
});

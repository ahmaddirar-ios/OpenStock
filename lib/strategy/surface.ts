// The optimizer's parameter surface: the same rows the table ranks, laid out as a grid so the shape
// of the search is visible — a ridge, a cliff, or a plateau that says the parameter does not matter.
// Pure, so the layout and the colour scale are pinned by tests rather than by a screenshot.

import type { Objective, OptimizerRow } from '@/lib/strategy/custom';

/** How many values an axis may show before it is thinned. A 45×45 grid is a smear, not a picture. */
export const MAX_SURFACE_AXIS = 24;

export type SurfaceAxis = { key: string; values: number[] };

export type SurfaceCell = {
    /** The objective's value at this corner, or null when the search never ran it. */
    value: number | null;
    /** The row behind the cell, so a click can apply the whole parameter set. */
    row: OptimizerRow | null;
};

export type Surface = {
    x: SurfaceAxis;
    y: SurfaceAxis;
    /** `cells[yIndex][xIndex]`, so a row of the grid is one value of the y parameter. */
    cells: SurfaceCell[][];
    min: number;
    max: number;
};

const distinct = (rows: readonly OptimizerRow[], key: string): number[] =>
    [...new Set(rows.map((row) => row.values[key]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value)))].sort(
        (a, b) => a - b,
    );

/**
 * The two parameters worth drawing: the ones the search actually varied, widest first. A parameter
 * with a single value is a constant, not an axis, so it is skipped. Fewer than two varied parameters
 * means there is no surface to draw.
 */
export function pickSurfaceAxes(rows: readonly OptimizerRow[], keys: readonly string[]): [string, string] | null {
    const varied = keys
        .map((key) => ({ key, count: distinct(rows, key).length }))
        .filter((entry) => entry.count > 1)
        .sort((a, b) => b.count - a.count);
    if (varied.length < 2) return null;
    return [varied[0].key, varied[1].key];
}

/** Evenly spaced values, always keeping both ends, so a thinned axis still spans the search. */
export function thinAxis(values: readonly number[], max = MAX_SURFACE_AXIS): number[] {
    if (values.length <= max) return [...values];
    const out: number[] = [];
    for (let index = 0; index < max; index += 1) {
        out.push(values[Math.round((index * (values.length - 1)) / (max - 1))]);
    }
    return [...new Set(out)];
}

const objectiveValue = (row: OptimizerRow, objective: Objective): number | null => {
    const value = row.metrics[objective];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

/**
 * Lay the rows out on the two axes. A corner the search never reached (a combination that produced
 * no trades) stays empty rather than reading as zero, and the range is taken from the values that
 * are actually there.
 */
export function buildSurface(
    rows: readonly OptimizerRow[],
    xKey: string,
    yKey: string,
    objective: Objective,
    max = MAX_SURFACE_AXIS,
): Surface | null {
    const xs = thinAxis(distinct(rows, xKey), max);
    const ys = thinAxis(distinct(rows, yKey), max);
    if (xs.length === 0 || ys.length === 0) return null;

    const byCorner = new Map<string, OptimizerRow>();
    for (const row of rows) {
        const x = row.values[xKey];
        const y = row.values[yKey];
        if (typeof x !== 'number' || typeof y !== 'number') continue;
        byCorner.set(`${x}:${y}`, row);
    }

    let min = Infinity;
    let max2 = -Infinity;
    const cells: SurfaceCell[][] = ys.map((y) =>
        xs.map((x) => {
            const row = byCorner.get(`${x}:${y}`) ?? null;
            const value = row ? objectiveValue(row, objective) : null;
            if (value != null) {
                if (value < min) min = value;
                if (value > max2) max2 = value;
            }
            return { value, row };
        }),
    );
    if (!Number.isFinite(min)) return null;
    return { x: { key: xKey, values: xs }, y: { key: yKey, values: ys }, cells, min, max: max2 };
}

/**
 * A cell's colour. When the range crosses zero the scale is diverging — red below, green above, so a
 * losing corner cannot look merely "less good". When every value is on one side of zero the scale is
 * one hue whose strength is the value's place in the range.
 */
export function surfaceTone(value: number, min: number, max: number): string {
    if (min < 0 && max > 0) {
        const t = value >= 0 ? value / max : value / min;
        const hue = value >= 0 ? 145 : 0;
        const alpha = 0.16 + Math.min(1, Math.abs(t)) * 0.52;
        return `hsl(${hue} 62% 45% / ${alpha.toFixed(2)})`;
    }
    const span = max - min || 1;
    const t = Math.min(1, Math.max(0, (value - min) / span));
    return `hsl(145 62% 45% / ${(0.12 + t * 0.6).toFixed(2)})`;
}

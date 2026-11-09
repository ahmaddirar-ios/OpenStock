// An alert attached to a drawing is arithmetic on a snapshot of that drawing: where the line sits at a
// moment, how far the price is from it, and whether that constitutes the cross or touch the trader asked
// about. These tests fix that contract, including the promise that the first check only observes.
import { describe, expect, it } from 'vitest';
import {
    DRAWING_BAND,
    anchorFor,
    anchorGap,
    anchorPriceAt,
    clampBand,
    evaluateDrawingRule,
    parseAnchor,
    type DrawingAnchor,
} from '@/lib/chart/drawing-alert';

// A rising line: 20 bars from (1000, 100) to (2000, 120) — 0.02 price per second.
const line = (time: number) => 100 + (time - 1000) * 0.02;
const rising: DrawingAnchor = {
    tool: 'trend',
    kind: 'line',
    points: [
        { time: 1000, price: line(1000) },
        { time: 2000, price: line(2000) },
    ],
};

describe('what a drawing can offer an alert', () => {
    it('reads a two-point line tool as a line', () => {
        const anchor = anchorFor('trend', [{ time: 1000, price: 100 }, { time: 2000, price: 120 }]);
        expect(anchor).toEqual({ tool: 'trend', kind: 'line', points: [{ time: 1000, price: 100 }, { time: 2000, price: 120 }] });
    });

    it('reads a ray as forward-only and a horizontal as one level', () => {
        expect(anchorFor('ray', [{ time: 1000, price: 100 }, { time: 2000, price: 120 }])?.kind).toBe('ray');
        expect(anchorFor('hray', [{ time: 1000, price: 100 }])).toEqual({ tool: 'hray', kind: 'level', points: [{ time: 1000, price: 100 }] });
        expect(anchorFor('horizontal', [{ time: 1000, price: 100 }])?.kind).toBe('level');
    });

    it('refuses a drawing whose price at a moment is an interpretation, not a level', () => {
        // Fibonacci, patterns, Gann and the volume tools are deliberately not alertable.
        for (const tool of ['fib', 'xabcd', 'gannfan', 'pitchfork', 'vprofile', 'rectangle', 'vline'] as const) {
            expect(anchorFor(tool, [{ time: 1000, price: 100 }, { time: 2000, price: 120 }]), tool).toBeNull();
        }
    });

    it('refuses a degenerate line', () => {
        expect(anchorFor('trend', [{ time: 1000, price: 100 }, { time: 1000, price: 120 }])).toBeNull();
        expect(anchorFor('trend', [{ time: 1000, price: 100 }])).toBeNull();
    });
});

describe('where the line sits', () => {
    it('interpolates between the two points', () => {
        expect(anchorPriceAt(rising, 1500)).toBeCloseTo(110, 6);
    });

    it('continues past both points, because a trendline is a level', () => {
        expect(anchorPriceAt(rising, 3000)).toBeCloseTo(140, 6);
        expect(anchorPriceAt(rising, 0)).toBeCloseTo(80, 6);
    });

    it('does not exist before a ray starts', () => {
        const ray: DrawingAnchor = { ...rising, kind: 'ray' };
        expect(anchorPriceAt(ray, 500)).toBeNull();
        expect(anchorPriceAt(ray, 1500)).toBeCloseTo(110, 6);
    });

    it('holds one price for a level', () => {
        expect(anchorPriceAt({ tool: 'horizontal', kind: 'level', points: [{ time: 1000, price: 27.15 }] }, 9000)).toBe(27.15);
    });

    it('measures the gap as a signed fraction of the line', () => {
        // 2% above a line of 110 is a gap of +0.02, whoever the price is.
        expect(anchorGap(rising, line(1500) * 1.02, 1500)).toBeCloseTo(0.02, 6);
        expect(anchorGap(rising, line(1500) * 0.98, 1500)).toBeCloseTo(-0.02, 6);
        expect(anchorGap(rising, line(1500), 1500)).toBeCloseTo(0, 9);
    });
});

describe('whether the rule fires', () => {
    const at = (price: number) => ({ condition: 'DRAWING_CROSS_UP' as const, anchor: rising, price, time: 1500 });

    it('does not speak on the first check, only records', () => {
        expect(evaluateDrawingRule({ ...at(line(1500) * 1.01), lastGap: null })).toBe(false);
        expect(evaluateDrawingRule({ ...at(line(1500) * 1.01) })).toBe(false);
    });

    it('fires a cross up when the price passes from below the line to above it', () => {
        expect(evaluateDrawingRule({ ...at(line(1500) * 1.001), lastGap: -0.002 })).toBe(true);
        // Still above, but it was already above: no second alert.
        expect(evaluateDrawingRule({ ...at(line(1500) * 1.001), lastGap: 0.004 })).toBe(false);
        // Exactly on the line last time counts as below, so crossing it speaks.
        expect(evaluateDrawingRule({ ...at(line(1500) * 1.001), lastGap: 0 })).toBe(true);
    });

    it('fires a cross down the other way round', () => {
        const rule = { ...at(line(1500) * 0.999), condition: 'DRAWING_CROSS_DOWN' as const };
        expect(evaluateDrawingRule({ ...rule, lastGap: 0.002 })).toBe(true);
        expect(evaluateDrawingRule({ ...rule, lastGap: -0.004 })).toBe(false);
    });

    it('fires a touch inside the band, and only inside it', () => {
        // A tenth of a percent above the line: inside the default third of a percent.
        expect(evaluateDrawingRule({ ...at(line(1500) * 1.001), condition: 'DRAWING_TOUCH' as const, band: DRAWING_BAND.default })).toBe(true);
        // A quarter of a percent away is outside a tenth-of-a-percent band.
        expect(evaluateDrawingRule({ ...at(line(1500) * 1.0025), condition: 'DRAWING_TOUCH' as const, band: 0.1 })).toBe(false);
        // ...but inside the default one.
        expect(evaluateDrawingRule({ ...at(line(1500) * 1.0025), condition: 'DRAWING_TOUCH' as const, band: DRAWING_BAND.default })).toBe(true);
    });

    it('clamps a band a hand-edited row tries to widen', () => {
        expect(clampBand(0)).toBe(DRAWING_BAND.min);
        expect(clampBand(500)).toBe(DRAWING_BAND.max);
        expect(clampBand('x')).toBe(DRAWING_BAND.default);
    });

    it('never fires when the line does not exist at that moment', () => {
        const ray: DrawingAnchor = { ...rising, kind: 'ray' };
        expect(evaluateDrawingRule({ condition: 'DRAWING_CROSS_UP', anchor: ray, price: 100, time: 500, lastGap: -0.01 })).toBe(false);
    });
});

describe('an anchor read back from storage', () => {
    it('keeps a good one', () => {
        expect(parseAnchor(rising)).toEqual(rising);
    });

    it('drops one it cannot trust', () => {
        expect(parseAnchor(null)).toBeNull();
        expect(parseAnchor({ tool: 'trend', kind: 'diagonal', points: [] })).toBeNull();
        expect(parseAnchor({ tool: 'trend', kind: 'line', points: [{ time: 1, price: 2 }] })).toBeNull();
        expect(parseAnchor({ tool: 'trend', kind: 'line', points: [{ time: 1, price: 2 }, { time: 1, price: 3 }] })).toBeNull();
        expect(parseAnchor({ tool: 'horizontal', kind: 'level', points: [] })).toBeNull();
        // A non-numeric pair is dropped rather than trusted.
        expect(parseAnchor({ tool: 'trend', kind: 'line', points: [{ time: 1, price: 'x' }, { time: 2, price: 3 }] })).toBeNull();
    });
});

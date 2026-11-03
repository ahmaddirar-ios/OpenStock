// @vitest-environment jsdom
// The seven basic line tools differ only in where their segment ends: a ray runs to the right
// edge, an extended line to both, a horizontal ray and a vertical line are fixed by one point.
// These tests pin that contract at the SVG level, because the chart's own time→pixel lookup
// stops at the last bar and cannot place an end that belongs to the panel's edge.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import ChartDrawings from '@/components/stocks/ChartDrawings';
import type { DrawPoint, Drawing, ScreenPoint, ShapeTool } from '@/lib/chart-drawings';

// The panel the SVG fills; jsdom has no layout, so the size is declared rather than measured.
// It has to sit on Element.prototype: the drawing layer is an <svg>, which is not an HTMLElement.
const WIDTH = 640;
const HEIGHT = 660;

beforeEach(() => {
    Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => WIDTH });
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => HEIGHT });
});

afterEach(cleanup);

// A linear, non-snapping pair of scales: 10 seconds per pixel, 5 pixels per price unit.
const toScreen = (point: DrawPoint): ScreenPoint => ({ x: 100 + (point.time - 1000) / 10, y: 500 - (point.price - 100) * 5 });
const fromScreen = (x: number, y: number): DrawPoint => ({ time: 1000 + (x - 100) * 10, price: 100 + (500 - y) / 5 });

const renderTool = (tool: ShapeTool, points: DrawPoint[]) => {
    const drawing: Drawing = { id: 'd1', tool, points };
    const { container } = render(
        <ChartDrawings
            drawings={[drawing]}
            selectedId={null}
            tool={null}
            text=""
            barTimes={[]}
            toScreen={toScreen}
            fromScreen={fromScreen}
            onCommit={() => {}}
            onSelect={() => {}}
            onMoveHandle={() => {}}
            onEditText={() => {}}
            onToolConsumed={() => {}}
            onGestureStart={() => {}}
            onGestureEnd={() => {}}
            label={(key) => key}
        />,
    );
    const svg = container.querySelector('svg[role="application"]');
    if (!svg) throw new Error('the drawing layer did not render');
    const lines = Array.from(svg.querySelectorAll('line')).map((line) => ({
        x1: Number(line.getAttribute('x1')),
        y1: Number(line.getAttribute('y1')),
        x2: Number(line.getAttribute('x2')),
        y2: Number(line.getAttribute('y2')),
    }));
    const texts = Array.from(svg.querySelectorAll('text')).map((node) => node.textContent ?? '');
    return { lines, texts };
};

// A shallow line: (1000, 100) → (2000, 105), i.e. 100px right and 25px up on this scale.
const rise: DrawPoint[] = [
    { time: 1000, price: 100 },
    { time: 2000, price: 105 },
];

describe('the basic line tools on the chart', () => {
    it('draws a ray from its first point to the panel edge', () => {
        const { lines } = renderTool('ray', rise);
        expect(lines).toHaveLength(1);
        expect(lines[0].x1).toBeCloseTo(100, 5);
        expect(lines[0].x2).toBe(WIDTH);
        // The line keeps rising past the second point: at the edge the price is 127, y = 365.
        expect(lines[0].y2).toBeCloseTo(365, 4);
    });

    it('draws an extended line to both edges, in time order', () => {
        const { lines } = renderTool('extended', rise);
        expect(lines[0].x1).toBe(0);
        expect(lines[0].x2).toBe(WIDTH);
        // Falling left to right in price terms never happens here: the line rises, so y falls.
        expect(lines[0].y1).toBeGreaterThan(lines[0].y2);
        expect(lines[0].y1).toBeCloseTo(525, 4);
        expect(lines[0].y2).toBeCloseTo(365, 4);
    });

    it('draws a vertical line at its point, full height', () => {
        const { lines } = renderTool('vline', [{ time: 1000, price: 100 }]);
        expect(lines[0].x1).toBeCloseTo(100, 5);
        expect(lines[0].x2).toBeCloseTo(100, 5);
        expect(lines[0].y1).toBe(0);
        expect(lines[0].y2).toBe(HEIGHT);
    });

    it('draws a horizontal ray from its point to the right edge', () => {
        const { lines } = renderTool('hray', [{ time: 1000, price: 100 }]);
        expect(lines[0].x1).toBeCloseTo(100, 5);
        expect(lines[0].x2).toBe(WIDTH);
        expect(lines[0].y1).toBeCloseTo(500, 5);
        expect(lines[0].y2).toBeCloseTo(500, 5);
    });

    it('draws a cross as one line across and one down', () => {
        const { lines } = renderTool('cross', [{ time: 1000, price: 100 }]);
        expect(lines).toHaveLength(2);
        expect(lines.map((line) => [line.x1, line.x2, line.y1, line.y2])).toEqual([
            [0, WIDTH, 500, 500],
            [100, 100, 0, HEIGHT],
        ]);
    });

    it('reads the trend angle off the line it drew', () => {
        const { lines, texts } = renderTool('trendangle', rise);
        // The drawn segment still runs between the two points.
        expect(lines[0].x1).toBeCloseTo(100, 5);
        expect(lines[0].x2).toBeCloseTo(200, 5);
        // 25px up over 100px right is 14 degrees above horizontal.
        expect(texts.join(' ')).toContain('14.0°');
    });

    it('writes the move on an info line', () => {
        const { lines, texts } = renderTool('info', rise);
        expect(lines[0].x2).toBeCloseTo(200, 5);
        expect(texts.join(' ')).toContain('+5.00');
        expect(texts.join(' ')).toContain('+5.00%');
    });
});

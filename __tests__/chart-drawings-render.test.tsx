// @vitest-environment jsdom
// The seven basic line tools differ only in where their segment ends: a ray runs to the right
// edge, an extended line to both, a horizontal ray and a vertical line are fixed by one point.
// These tests pin that contract at the SVG level, because the chart's own time→pixel lookup
// stops at the last bar and cannot place an end that belongs to the panel's edge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
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

const renderTool = (tool: ShapeTool, points: DrawPoint[], barTimes: number[] = [], toScreenOverride?: (point: DrawPoint) => ScreenPoint | null) => {
    const drawing: Drawing = { id: 'd1', tool, points };
    const { container } = render(
        <ChartDrawings
            drawings={[drawing]}
            selectedId={null}
            tool={null}
            text=""
            barTimes={barTimes}
            toScreen={toScreenOverride ?? toScreen}
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
    const rects = Array.from(svg.querySelectorAll('rect'));
    const ellipses = Array.from(svg.querySelectorAll('ellipse')).map((node) => ({
        cx: Number(node.getAttribute('cx')),
        cy: Number(node.getAttribute('cy')),
        rx: Number(node.getAttribute('rx')),
        ry: Number(node.getAttribute('ry')),
    }));
    const circles = Array.from(svg.querySelectorAll('circle')).map((node) => ({
        cx: Number(node.getAttribute('cx')),
        cy: Number(node.getAttribute('cy')),
        r: Number(node.getAttribute('r')),
    }));
    const polygons = Array.from(svg.querySelectorAll('polygon')).map((node) => node.getAttribute('points') ?? '');
    const paths = Array.from(svg.querySelectorAll('path')).map((node) => node.getAttribute('d') ?? '');
    const dashes = Array.from(svg.querySelectorAll('line')).map((line) => line.getAttribute('stroke-dasharray'));
    const texts = Array.from(svg.querySelectorAll('text')).map((node) => node.textContent ?? '');
    // Every painted path with the weight and opacity it was given, for the freehand brushes.
    const strokes = Array.from(svg.querySelectorAll('path')).map((node) => ({
        d: node.getAttribute('d') ?? '',
        width: Number(node.getAttribute('stroke-width')),
        opacity: Number(node.getAttribute('opacity')),
    }));
    return { lines, rects, dashes, ellipses, circles, polygons, paths, strokes, texts };
};

/** The same layer, but with a tool armed, so a drawing gesture can be played against it. */
const renderDrawing = (options: { tool: ShapeTool | 'select'; points?: DrawPoint[] }, onCommit: (drawing: Drawing) => void = () => {}) => {
    const { container } = render(
        <ChartDrawings
            drawings={options.points ? [{ id: 'd1', tool: options.tool as ShapeTool, points: options.points }] : []}
            selectedId={null}
            tool={options.tool}
            text=""
            barTimes={[]}
            toScreen={toScreen}
            fromScreen={fromScreen}
            onCommit={onCommit}
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
    return { svg, container };
};

// A shallow line: (1000, 100) → (2000, 105), i.e. 100px right and 25px up on this scale.
const rise: DrawPoint[] = [
    { time: 1000, price: 100 },
    { time: 2000, price: 105 },
];

describe('the geometric shapes on the chart', () => {
    it('draws an ellipse from its two corners', () => {
        const { ellipses } = renderTool('ellipse', [{ time: 1000, price: 100 }, { time: 2000, price: 112 }]);
        expect(ellipses).toHaveLength(1);
        expect(ellipses[0]).toEqual({ cx: 150, cy: 470, rx: 50, ry: 30 });
    });

    it('draws a circle through the point it was given', () => {
        const { circles } = renderTool('circle', [{ time: 1000, price: 100 }, { time: 1300, price: 108 }]);
        // The centre carries a dot too, so the filled shape is the one with the translucent fill.
        const shape = circles.filter((c) => c.r === 50);
        expect(shape).toHaveLength(1);
        expect(shape[0]).toEqual({ cx: 100, cy: 500, r: 50 });
    });

    it('closes a triangle through its three points', () => {
        const { polygons } = renderTool('tri', [
            { time: 1000, price: 100 },
            { time: 2000, price: 100 },
            { time: 1500, price: 110 },
        ]);
        expect(polygons).toHaveLength(1);
        expect(polygons[0]).toBe('100,500 200,500 150,450');
    });

    it('runs a polyline through every point it was given', () => {
        const { paths } = renderTool('polyline', [
            { time: 1000, price: 100 },
            { time: 1500, price: 110 },
            { time: 2000, price: 104 },
        ]);
        expect(paths).toContain('M100,500 L150,450 L200,480');
    });

    it('bends a curve towards its handle', () => {
        const { paths } = renderTool('curve', [
            { time: 1000, price: 100 },
            { time: 1500, price: 90 },
            { time: 2000, price: 100 },
        ]);
        expect(paths.some((d) => d.startsWith('M100,500 Q150,550'))).toBe(true);
    });

    it('joins two curves for a double curve', () => {
        const { paths } = renderTool('dcurve', [
            { time: 1000, price: 100 },
            { time: 1200, price: 90 },
            { time: 1800, price: 110 },
            { time: 2000, price: 100 },
        ]);
        const path = paths.find((d) => d.startsWith('M100,500')) ?? '';
        expect(path.match(/Q/g)).toHaveLength(2);
    });

    it('draws an arc through three points, and a straight line when they are in a row', () => {
        const bent = renderTool('arc', [
            { time: 1500, price: 110 },
            { time: 1000, price: 100 },
            { time: 2000, price: 100 },
        ]);
        expect(bent.paths.some((d) => /A \d/.test(d))).toBe(true);

        const flat = renderTool('arc', [
            { time: 1000, price: 100 },
            { time: 1500, price: 100 },
            { time: 2000, price: 100 },
        ]);
        // Three points in a row have no circle: the straight line is what is drawn instead.
        expect(flat.paths).toHaveLength(0);
        expect(flat.lines.length).toBeGreaterThan(0);
    });

    it('keeps taking clicks for a polyline and finishes it on a double click', () => {
        const onCommit = vi.fn();
        const { svg } = renderDrawing({ tool: 'polyline' }, onCommit);

        const point = (x: number, y: number) => {
            fireEvent.pointerDown(svg, { clientX: x, clientY: y, pointerId: 1 });
            fireEvent.pointerUp(svg, { clientX: x, clientY: y, pointerId: 1 });
        };

        point(100, 500);
        point(150, 450);
        point(200, 480);
        // Nothing is committed while the line is still being drawn.
        expect(onCommit).not.toHaveBeenCalled();
        expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);

        // The double click lands on the last point again: it must not be stored twice.
        point(200, 480);
        fireEvent.doubleClick(svg, { clientX: 200, clientY: 480 });

        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit.mock.calls[0][0].tool).toBe('polyline');
        expect(onCommit.mock.calls[0][0].points).toHaveLength(3);
    });
});

describe('the freehand brush on the chart', () => {
    it('draws a stroke through every point it was given', () => {
        const { paths } = renderTool('brush', [
            { time: 1000, price: 100 },
            { time: 1200, price: 104 },
            { time: 1500, price: 100 },
        ]);
        expect(paths).toContain('M100,500 L120,480 L150,500');
    });

    it('paints the highlighter wide and see-through', () => {
        const { strokes } = renderTool('highlighter', [
            { time: 1000, price: 100 },
            { time: 1300, price: 106 },
        ]);
        const marker = strokes.find((s) => s.d === 'M100,500 L130,470');
        expect(marker).toBeTruthy();
        // Much wider than the brush's own stroke, and translucent, so the candles stay readable.
        expect(marker!.width).toBeGreaterThan(8);
        expect(marker!.opacity).toBeLessThan(0.5);
    });

    it('collects the stroke as the pointer is dragged, and commits it on release', () => {
        const onCommit = vi.fn();
        const { svg } = renderDrawing({ tool: 'brush' }, onCommit);

        fireEvent.pointerDown(svg, { clientX: 100, clientY: 500, pointerId: 5 });
        // A drag: each move adds a point, but a nudge of a pixel or two is noise, not a point.
        fireEvent.pointerMove(svg, { clientX: 120, clientY: 480, pointerId: 5 });
        fireEvent.pointerMove(svg, { clientX: 121, clientY: 481, pointerId: 5 });
        fireEvent.pointerMove(svg, { clientX: 150, clientY: 500, pointerId: 5 });
        expect(onCommit).not.toHaveBeenCalled();

        fireEvent.pointerUp(svg, { clientX: 150, clientY: 500, pointerId: 5 });
        expect(onCommit).toHaveBeenCalledTimes(1);
        const stroke = onCommit.mock.calls[0][0];
        expect(stroke.tool).toBe('brush');
        expect(stroke.points).toHaveLength(3);
    });

    it('throws the stroke away when the tool is dropped without a drag', () => {
        const onCommit = vi.fn();
        const { svg } = renderDrawing({ tool: 'brush' }, onCommit);
        fireEvent.pointerDown(svg, { clientX: 100, clientY: 500, pointerId: 6 });
        fireEvent.pointerUp(svg, { clientX: 100, clientY: 500, pointerId: 6 });
        // A single tap is a dot, and a dot is not worth a drawing.
        expect(onCommit).not.toHaveBeenCalled();
    });
});

describe('the Fibonacci family on the chart', () => {
    const base: DrawPoint = { time: 1000, price: 100 };
    const top: DrawPoint = { time: 2000, price: 120 };
    const third: DrawPoint = { time: 1200, price: 110 };

    it('labels every extension level with its ratio and price', () => {
        const { lines, texts } = renderTool('fibext', [base, top, third]);
        // The default extension set has eight levels, and the base move (20) is measured from 110.
        expect(lines.length).toBe(8);
        expect(texts.join(' ')).toContain('1 (130.00)');
        expect(texts.join(' ')).toContain('1.618 (142.36)');
    });

    it('draws the trend-based extension from its own ratios', () => {
        const { lines, texts } = renderTool('fibtrendext', [base, top, third]);
        expect(lines.length).toBe(4);
        expect(texts.join(' ')).toContain('0.618 (122.36)');
    });

    it('fans the retracement ratios from the first point to the vertical through the second', () => {
        const { lines } = renderTool('fibfan', [base, top]);
        expect(lines.length).toBe(15);
        // Ratio 0 lands on the first point's price at the second point's time; ratio 1 lands on the
        // second point itself (index 7 of the retracement set).
        expect(lines[0]).toEqual({ x1: 100, y1: 500, x2: 200, y2: 500 });
        expect(lines[7]).toEqual({ x1: 100, y1: 500, x2: 200, y2: 400 });
    });

    it('channels the base line towards the third point', () => {
        const { lines } = renderTool('fibchannel', [base, top, third]);
        expect(lines.length).toBe(15);
        // Ratio 0 is the base itself: from the first point to the second.
        expect(lines[0]).toEqual({ x1: 100, y1: 500, x2: 200, y2: 400 });
    });

    it('walks the Fibonacci sequence to the right of the move', () => {
        const { lines } = renderTool('fibtime', [base, top]);
        expect(lines.length).toBe(8);
        // The move spans 100px, so the zones sit at 1, 2, 3, 5, 8, 13, 21 and 34 spans past it.
        expect(lines[0]).toEqual({ x1: 300, y1: 0, x2: 300, y2: HEIGHT });
        expect(lines.map((line) => line.x1)).toEqual([300, 400, 500, 700, 1000, 1500, 2300, 3600]);
    });

    it('sizes the arcs from the base move around the third point', () => {
        const { ellipses } = renderTool('fibarc', [base, top, third]);
        expect(ellipses.length).toBe(15);
        // The base move is 100px wide and 100px tall on this scale, so every arc is a circle here.
        expect(ellipses[0].cx).toBe(120);
        expect(ellipses[0].cy).toBe(450);
        expect(ellipses[0].rx).toBe(0);
        expect(ellipses[1].rx).toBeCloseTo(23.6, 6);
        expect(ellipses[1].ry).toBeCloseTo(23.6, 6);
    });

    it('draws the speed fan at thirds of the slope to the edge', () => {
        const { lines } = renderTool('fibspeed', [base, top]);
        expect(lines.length).toBe(3);
        // The edge sits 5400 seconds past the base point, where the slope is 108 above the entry:
        // the thirds are 36, 72 and 108 up, which is 180, 360 and 540 pixels.
        expect(lines.map((line) => Math.round(line.y2))).toEqual([320, 140, -40]);
        expect(lines.every((line) => line.x1 === 100 && line.x2 === WIDTH)).toBe(true);
    });

    it('draws every level even when the price scale cannot show it', () => {
        // The chart answers with null for a price it cannot place, and an extension's far levels
        // sit above the candles: dropping them would leave the tool showing a single line.
        const windowed = (point: DrawPoint): ScreenPoint | null =>
            point.price > 130 || point.price < 80 ? null : { x: 100 + (point.time - 1000) / 10, y: 500 - (point.price - 100) * 5 };

        const extension = renderTool('fibext', [base, top, third], [], windowed);
        expect(extension.lines.length).toBe(8);

        const fan = renderTool('fibfan', [base, top], [], windowed);
        expect(fan.lines.length).toBe(15);

        const fan2 = renderTool('fibspeed', [base, top], [], windowed);
        expect(fan2.lines.length).toBe(3);
    });
});

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

describe('the forecast tools on the chart', () => {
    // Entry 100, target 110, stop 96: ten up, four down, R:R 2.5 and 4% at risk.
    const position: DrawPoint[] = [
        { time: 1000, price: 100 },
        { time: 2000, price: 110 },
        { time: 1500, price: 96 },
    ];

    it('paints the two zones of a long position and its reward to risk', () => {
        const { rects, texts } = renderTool('longpos', position);
        expect(rects).toHaveLength(2);
        const joined = texts.join(' ');
        expect(joined).toContain('+10.00');
        expect(joined).toContain('2.50');
        expect(joined).toContain('4.00');
    });

    it('paints a short as the mirror of the long, not a rotated copy', () => {
        const short: DrawPoint[] = [
            { time: 1000, price: 100 },
            { time: 2000, price: 90 },
            { time: 1500, price: 104 },
        ];
        const { rects, texts } = renderTool('shortpos', short);
        expect(rects).toHaveLength(2);
        // The target (profit) sits below the entry and the stop above it, and the ratio is the same.
        expect(texts.join(' ')).toContain('2.50');
    });

    it('reads a price range as the move it covers', () => {
        const { rects, texts } = renderTool('pricerange', rise);
        expect(rects).toHaveLength(1);
        expect(texts.join(' ')).toContain('+5.00');
        expect(texts.join(' ')).toContain('+5.00%');
    });

    it('counts the bars and the time a date range covers', () => {
        // One bar a minute over 1000 seconds is 17 bars, which is under a day so it reads in hours.
        const { rects, texts } = renderTool('daterange', rise, [1000, 1060]);
        expect(rects).toHaveLength(1);
        const joined = texts.join(' ');
        expect(joined).toContain('17');
        expect(joined).toContain('0.3H');
    });

    it('shows both readings on a date and price range', () => {
        const { texts } = renderTool('dprange', rise, [1000, 1060]);
        const joined = texts.join(' ');
        expect(joined).toContain('+5.00');
        expect(joined).toContain('17');
    });

    it('draws a projection as the drawn move plus one dotted repeat', () => {
        const { lines, dashes } = renderTool('projection', rise);
        expect(lines).toHaveLength(2);
        // The repeat starts where the drawn move ended and is dotted, so it reads as a forecast.
        expect(lines[1].x1).toBeCloseTo(200, 5);
        expect(lines[1].x2).toBeCloseTo(300, 5);
        expect(lines[1].y2).toBeCloseTo(450, 5);
        expect(dashes[1]).toBeTruthy();
        expect(dashes[0]).toBeFalsy();
    });
});

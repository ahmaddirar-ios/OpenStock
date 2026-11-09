// @vitest-environment jsdom
// The seven basic line tools differ only in where their segment ends: a ray runs to the right
// edge, an extended line to both, a horizontal ray and a vertical line are fixed by one point.
// These tests pin that contract at the SVG level, because the chart's own time→pixel lookup
// stops at the last bar and cannot place an end that belongs to the panel's edge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import ChartDrawings from '@/components/stocks/ChartDrawings';
import { layerDrawings, type DrawPoint, type Drawing, type ScreenPoint, type ShapeTool } from '@/lib/chart-drawings';

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

const renderTool = (tool: ShapeTool, points: DrawPoint[], barTimes: number[] = [], toScreenOverride?: (point: DrawPoint) => ScreenPoint | null, extra: { text?: string; extend?: 'left' | 'right' | 'both'; candles?: { time: number; open: number; high: number; low: number; close: number; volume: number }[]; fromScreen?: (x: number, y: number) => DrawPoint | null } = {}) => {
    const drawing: Drawing = { id: 'd1', tool, points, ...(extra.text ? { text: extra.text } : {}), ...(extra.extend ? { extend: extra.extend } : {}) };
    const { container } = render(
        <ChartDrawings
            drawings={[drawing]}
            selectedIds={[]}
            tool={null}
            text={extra.text ?? ""}
            barTimes={barTimes}
            candles={extra.candles ?? []}
            toScreen={toScreenOverride ?? toScreen}
            fromScreen={extra.fromScreen ?? fromScreen}
            onCommit={() => {}}
            onSelect={() => {}}
            onMoveHandle={() => {}}
            onMoveBody={() => {}}
            onMoveBodyStart={() => {}}
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
    return { container, lines, rects, dashes, ellipses, circles, polygons, paths, strokes, texts, shapes: { rects: Array.from(svg.querySelectorAll('rect') as unknown as HTMLElement[]) } };
};

/** The same layer, but with a tool armed, so a drawing gesture can be played against it. */
const renderDrawing = (options: { tool: ShapeTool | 'select'; points?: DrawPoint[]; text?: string }, onCommit: (drawing: Drawing) => void = () => {}) => {
    const { container } = render(
        <ChartDrawings
            drawings={options.points ? [{ id: 'd1', tool: options.tool as ShapeTool, points: options.points }] : []}
            selectedIds={[]}
            tool={options.tool}
            text={options.text ?? ""}
            barTimes={[]}
            toScreen={toScreen}
            fromScreen={fromScreen}
            onCommit={onCommit}
            onSelect={() => {}}
            onMoveHandle={() => {}}
            onMoveBody={() => {}}
            onMoveBodyStart={() => {}}
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

describe('the Wolfe wave on the chart', () => {
    const wave: DrawPoint[] = [
        { time: 1000, price: 100 },
        { time: 2000, price: 120 },
        { time: 3000, price: 90 },
        { time: 4000, price: 108 },
        { time: 5000, price: 78 },
    ];

    it('labels the five turns and names the target line', () => {
        const { texts } = renderTool('wolfe', wave);
        expect(texts).toEqual(expect.arrayContaining(['1', '2', '3', '4', '5', 'EPA']));
    });

    it('draws the wave, the two channel lines and the 1-4 target', () => {
        const { lines, dashes } = renderTool('wolfe', wave);
        // Four segments of the wave, two channel rays (1-3 and 2-4), and the target ray (1-4).
        expect(lines).toHaveLength(7);
        expect(dashes.filter((dash) => dash === '5 3')).toHaveLength(2);
        expect(dashes.filter((dash) => dash === '7 4')).toHaveLength(1);
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

describe('the annotation family on the chart', () => {
    it('draws a callout as a leader line, a label box and the words', () => {
        const { lines, texts, shapes } = renderTool('callout', [
            { time: 1000, price: 100 },
            { time: 1800, price: 112 },
        ], [], undefined, { text: 'Breakout' });
        // The leader runs from the point it annotates to the label box.
        expect(lines.some((l) => l.x1 === 100 && l.y1 === 500)).toBe(true);
        expect(texts).toContain('Breakout');
        expect(shapes.rects.length).toBeGreaterThan(0);
    });

    it('draws a balloon with a filled label', () => {
        const { texts, shapes } = renderTool('balloon', [
            { time: 1000, price: 100 },
            { time: 1700, price: 88 },
        ], [], undefined, { text: 'Target' });
        expect(texts).toContain('Target');
        // A balloon is filled, so its rect carries a translucent fill.
        expect(shapes.rects.some((rect) => (rect.getAttribute('fill') || '').includes('color-mix'))).toBe(true);
    });

    it('prints the price on a signpost and a flag', () => {
        const post = renderTool('signpost', [{ time: 1000, price: 100 }]);
        expect(post.texts.join(' ')).toContain('100.00');
        expect(post.lines.length).toBeGreaterThan(0);

        const flagged = renderTool('flag', [{ time: 1000, price: 100 }]);
        expect(flagged.texts.join(' ')).toContain('100.00');
        expect(flagged.polygons.length + flagged.shapes.rects.length).toBeGreaterThan(0);
    });

    it('pins a price note to the price it was placed at', () => {
        const { texts, shapes } = renderTool('pricenote', [{ time: 1000, price: 100 }]);
        expect(texts.join(' ')).toContain('100.00');
        // A note sits on the panel edge, like the chart's own last-price chip.
        expect(shapes.rects.length).toBeGreaterThan(0);
    });

    it('seeds a price marker with its price when the trader typed nothing', () => {
        const onCommit = vi.fn();
        const { svg } = renderDrawing({ tool: 'flag' }, onCommit);
        fireEvent.pointerDown(svg, { clientX: 100, clientY: 500, pointerId: 7 });
        fireEvent.pointerUp(svg, { clientX: 100, clientY: 500, pointerId: 7 });
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit.mock.calls[0][0].text).toBe('100.00');
    });
});

describe('the Gann, pitchfork and measured-channel family on the chart', () => {
    // On this scale a 1000-second leg is 100px wide, and one price unit is 5px tall.
    const a: DrawPoint = { time: 1000, price: 100 }; // (100, 500)
    const b: DrawPoint = { time: 2000, price: 120 }; // (200, 400)
    const c: DrawPoint = { time: 1600, price: 90 }; // (160, 550)

    it('fans the Gann angles out of the pivot to the right edge', () => {
        const { lines, circles } = renderTool('gannfan', [a, b]);
        // Every angle starts at the first click and stops at the panel's right edge.
        const fan = lines.filter((line) => line.x1 === 100 && line.y1 === 500 && line.x2 === 640);
        expect(fan).toHaveLength(9);
        // The 1x1 is the clicked trend itself: 20 price over 1000 seconds reaches 208 at 6400.
        expect(fan.some((line) => Math.abs(line.y2 - -40) < 0.5)).toBe(true);
        // Half the slope reaches half as far above the pivot.
        expect(fan.some((line) => Math.abs(line.y2 - 230) < 0.5)).toBe(true);
        // Both clicks are still grabbable.
        expect(circles.map((dot) => `${dot.cx},${dot.cy}`)).toEqual(expect.arrayContaining(['100,500', '200,400']));
    });

    it('boxes the Gann grid with its diagonals and the angles inside', () => {
        const { rects, lines } = renderTool('gannbox', [a, b]);
        // The traders' two clicks box the grid: (100,400) to (200,500).
        const box = rects.map((rect) => ({
            x: Number(rect.getAttribute('x')),
            y: Number(rect.getAttribute('y')),
            w: Number(rect.getAttribute('width')),
            h: Number(rect.getAttribute('height')),
        }));
        expect(box).toContainEqual({ x: 100, y: 400, w: 100, h: 100 });
        expect(lines).toHaveLength(11); // two diagonals plus the nine angles
    });

    it('makes a Gann square square, whatever the drag', () => {
        const { rects } = renderTool('gannsquare', [a, b]);
        const square = rects
            .map((rect) => ({ w: Number(rect.getAttribute('width')), h: Number(rect.getAttribute('height')) }))
            .find((rect) => rect.w > 0 && rect.w === rect.h);
        // The drag was 100px wide and 25px tall; the square takes the longer side.
        expect(square).toEqual({ w: 100, h: 100 });
    });

    it('draws a pitchfork as a median and two parallels running to the edge', () => {
        const { lines } = renderTool('pitchfork', [a, b, c]);
        const rails = lines.filter((line) => line.x2 === 640);
        expect(rails).toHaveLength(3);
        // The median passes through the midpoint of the last two points: (1800, 105) → (180, 475).
        expect(rails.some((line) => line.y1 === 500 && Math.abs(line.y2 - 331.25) < 0.5)).toBe(true);
        // The parallels leave through the second and third clicks.
        expect(rails.some((line) => line.y1 === 400 && Math.abs(line.y2 - 262.5) < 0.5)).toBe(true);
        expect(rails.some((line) => line.y1 === 550 && Math.abs(line.y2 - 400) < 0.5)).toBe(true);
    });

    it('moves the pivot for each pitchfork variant, as the names promise', () => {
        // Andrews starts at the first click.
        expect(renderTool('pitchfork', [a, b, c]).lines.find((line) => line.y1 === 500)?.x1).toBe(100);
        // Schiff starts half the price leg above the first click: price 110 → y 450.
        expect(renderTool('schiffpitchfork', [a, b, c]).lines.some((line) => line.x1 === 100 && line.y1 === 450)).toBe(true);
        // The modified and inside variants pivot on the midpoint of the first two clicks: (150, 450).
        expect(renderTool('modpitchfork', [a, b, c]).lines.some((line) => line.x1 === 150 && line.y1 === 450)).toBe(true);
        expect(renderTool('insidepitchfork', [a, b, c]).lines.some((line) => line.x1 === 150 && line.y1 === 450)).toBe(true);
    });

    it('fits a regression channel to the candles on screen', () => {
        const candles = Array.from({ length: 11 }, (_, i) => ({ time: 1000 + i * 100, open: 100 + i - 0.5, high: 100 + i + 1, low: 100 + i - 1, close: 100 + i, volume: 100 }));
        const { lines, polygons } = renderTool('regression', [a, { time: 2000, price: 110 }], [], undefined, { candles });
        // A perfect line: the channel runs from (1000, 100) up to (2000, 110).
        expect(lines.some((line) => line.x1 === 100 && line.y1 === 500 && line.x2 === 200 && line.y2 === 450)).toBe(true);
        // The two bands are drawn, and the fitted band is filled.
        expect(lines).toHaveLength(3);
        expect(polygons).toHaveLength(1);
    });

    it('holds a flat channel across the span the trader marked', () => {
        const { lines } = renderTool('flattop', [a, b]);
        // The high and the low, each held flat to the right edge.
        expect(lines.some((line) => line.y1 === 400 && line.y2 === 400 && line.x2 === 640)).toBe(true);
        expect(lines.some((line) => line.y1 === 500 && line.y2 === 500 && line.x2 === 640)).toBe(true);
    });

    it('still paints the retired Gann box so an old drawing does not vanish', () => {
        // `gann` left the rail when the richer gannbox replaced it, but a chart saved before that
        // must keep its box.
        const { rects, lines } = renderTool('gann', [a, b]);
        expect(rects.length).toBeGreaterThan(0);
        expect(lines.length).toBeGreaterThan(0);
    });

    it('carries the disjoint channel to the third point, away from the first', () => {
        const { lines } = renderTool('disjoint', [a, b, c]);
        // The base is the first two clicks; the parallel is the same move set off from the third.
        expect(lines).toContainEqual({ x1: 100, y1: 500, x2: 200, y2: 400 });
        expect(lines).toContainEqual({ x1: 160, y1: 550, x2: 260, y2: 450 });
    });
});

describe('a fan that has to reach the panel edge', () => {
    const a: DrawPoint = { time: 1000, price: 100 }; // (100, 500)
    const b: DrawPoint = { time: 2000, price: 120 }; // (200, 400)

    // In production the chart's own time lookup gives up a pixel or two before the panel's right
    // edge: the right offset is not part of its time scale. The painter has to carry the trend's
    // slope on instead, or a fan draws nothing at all (which is how the speed fan once behaved).
    const stopsBeforeTheEdge = (x: number, y: number) => (x >= WIDTH - 24 ? null : fromScreen(x, y));

    it('draws the Gann angles anyway', () => {
        const { lines } = renderTool('gannfan', [a, b], [], undefined, { fromScreen: stopsBeforeTheEdge });
        const fan = lines.filter((line) => line.x1 === 100 && line.y1 === 500 && line.x2 === 640);
        expect(fan).toHaveLength(9);
        // The 1x1 still lands where the real edge time would have put it.
        expect(fan.some((line) => Math.abs(line.y2 - -40) < 0.5)).toBe(true);
    });

    it('draws the speed fan, which had the same hole', () => {
        const { lines } = renderTool('fibspeed', [a, b], [], undefined, { fromScreen: stopsBeforeTheEdge });
        expect(lines.filter((line) => line.x2 === 640).length).toBeGreaterThan(0);
    });

    it('runs a ray and an extended line to the edges', () => {
        const ray = renderTool('ray', [a, b], [], undefined, { fromScreen: stopsBeforeTheEdge });
        expect(ray.lines.some((line) => line.x1 === 100 && line.x2 === 640)).toBe(true);

        const extended = renderTool('extended', [a, b], [], undefined, { fromScreen: stopsBeforeTheEdge });
        // Both ends move out past the two clicks: (0, …) to (640, …).
        expect(extended.lines.some((line) => line.x1 === 0 && line.x2 === 640)).toBe(true);
    });
});

describe('the pile the drawings are painted in', () => {
    const under: Drawing = { id: 'under', tool: 'rectangle', points: [{ time: 1000, price: 100 }, { time: 1500, price: 110 }] };
    const over: Drawing = { id: 'over', tool: 'rectangle', points: [{ time: 1000, price: 100 }, { time: 1800, price: 110 }] };

    const renderList = (drawings: Drawing[]) => {
        const { container } = render(
            <ChartDrawings
                drawings={drawings}
                selectedIds={[]}
                tool={null}
                text=""
                barTimes={[]}
                toScreen={toScreen}
                fromScreen={fromScreen}
                onCommit={() => {}}
                onSelect={() => {}}
                onMoveHandle={() => {}}
                onMoveBody={() => {}}
                onMoveBodyStart={() => {}}
                onEditText={() => {}}
                onToolConsumed={() => {}}
                onGestureStart={() => {}}
                onGestureEnd={() => {}}
                label={(key) => key}
            />,
        );
        const svg = container.querySelector('svg[role="application"]');
        if (!svg) throw new Error('the drawing layer did not render');
        // 50px and 80px wide on this scale: which one comes first tells the stacking order.
        return Array.from(svg.querySelectorAll('g rect')).map((rect) => Number(rect.getAttribute('width')));
    };

    it('lengthens a trend line to the edge it was told to reach', () => {
        // The same shallow line, painted with each extension.
        const plain = renderTool('trend', rise);
        expect(plain.lines[0]).toEqual({ x1: 100, y1: 500, x2: 200, y2: 475 });

        const right = renderTool('trend', rise, [], undefined, { extend: 'right' });
        expect(right.lines[0].x2).toBe(WIDTH);
        // The slope is unchanged: a quarter pixel up per pixel right.
        expect(right.lines[0].y2).toBeCloseTo(500 - 0.25 * (WIDTH - 100), 5);

        const both = renderTool('trend', rise, [], undefined, { extend: 'both' });
        expect(both.lines[0].x1).toBe(0);
        expect(both.lines[0].x2).toBe(WIDTH);
        expect(both.lines[0].y1).toBeCloseTo(525, 5);
    });

    it('points a callout at its anchor with an arrowhead', () => {
        const { polygons, texts } = renderTool('callout', [
            { time: 1000, price: 100 },
            { time: 2000, price: 112 },
        ], [], undefined, { text: 'Watch this' });
        expect(texts).toContain('Watch this');
        expect(polygons).toHaveLength(1);
        expect(polygons[0].split(' ')).toHaveLength(3);
        // The tip sits on the anchor the callout was pinned to.
        expect(polygons[0].startsWith('100,500 ')).toBe(true);
    });

    it('paints the drawings in the order it is given, last on top', () => {
        expect(renderList([under, over])).toEqual([50, 80]);
    });

    it('follows a move to the front, so the drawing the trader raised is painted last', () => {
        expect(renderList(layerDrawings([under, over], 'under', 'front'))).toEqual([80, 50]);
        expect(renderList(layerDrawings([under, over], 'over', 'back'))).toEqual([80, 50]);
    });
});

describe('the exotics on the chart', () => {
    const a: DrawPoint = { time: 1000, price: 100 }; // (100, 500)
    // Six rising hourly bars, so a VWAP, a profile and a copied pattern all have something to read.
    const candles = Array.from({ length: 6 }, (_, i) => ({
        time: 1000 + i * 100,
        open: 100 + i,
        high: 101 + i,
        low: 99 + i,
        close: 100.5 + i,
        volume: 100 * (i + 1),
    }));

    it('draws a sticker as its glyph', () => {
        const { texts } = renderTool('icon', [a], [], undefined, { text: '⚑' });
        expect(texts).toContain('⚑');
    });

    it('draws a pasted image inside its frame, and says so while it has no address', () => {
        const withUrl = renderTool('image', [a, { time: 2000, price: 120 }], [], undefined, { text: 'https://example.com/a.png' });
        expect(withUrl.container.querySelector('image')?.getAttribute('href')).toBe('https://example.com/a.png');

        const empty = renderTool('image', [a, { time: 2000, price: 120 }]);
        expect(empty.texts).toContain('chart.imagePlaceholder');
    });

    it('averages the candles from the anchor forward, inside two deviation bands', () => {
        const { paths } = renderTool('avwap', [a], [], undefined, { candles });
        // The VWAP plus ±1σ and ±2σ: five lines, each one point per candle from the anchor on.
        expect(paths).toHaveLength(5);
        for (const path of paths) expect(path.split('L')).toHaveLength(6);
    });

    it('draws nothing for a VWAP when the drawing layer has no candles', () => {
        expect(renderTool('avwap', [a]).paths).toHaveLength(0);
    });

    it('counts a range into a profile, shading the range and naming the busiest row', () => {
        const { rects, texts } = renderTool('vprofile', [a, { time: 1500, price: 110 }], [], undefined, { candles });
        // The shaded range plus one bar per price row that traded.
        expect(rects.length).toBeGreaterThan(2);
        const prices = texts.filter((text) => /^\d/.test(text));
        expect(prices).toHaveLength(1); // the point of control
        expect(Number(prices[0])).toBeGreaterThan(100);
    });

    it('copies a range of candles to the point it was dropped on', () => {
        const { lines, rects } = renderTool('bars', [a, { time: 1300, price: 108 }, { time: 2600, price: 120 }], [], undefined, { candles });
        // Four candles in the range: one wick each, one body each, and the three anchors' dots are circles.
        expect(lines).toHaveLength(4);
        expect(rects).toHaveLength(4);
        // The copy starts where it was dropped (x = 100 + (2600 - 1000)/10 = 260).
        const bodyX = Math.min(...rects.map((rect) => Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2));
        expect(bodyX).toBeCloseTo(260, 0);
    });
});

describe('the preview of a shape that is still being drawn', () => {
    // A draft has fewer points than its tool needs: after the first click of a three-point channel the
    // painter used to read a point that did not exist yet and crash the chart. Padding the preview to
    // the tool's own count is what makes a partial draft paintable.
    const placeFirstPointThenMove = (tool: ShapeTool) => {
        const { svg } = renderDrawing({ tool });
        fireEvent.pointerMove(svg, { clientX: 100, clientY: 500, pointerId: 1 });
        fireEvent.pointerDown(svg, { clientX: 100, clientY: 500, pointerId: 1 });
        fireEvent.pointerUp(svg, { clientX: 100, clientY: 500, pointerId: 1 });
        fireEvent.pointerMove(svg, { clientX: 320, clientY: 380, pointerId: 1 });
        return svg;
    };

    it('paints a multi-point tool after its first point instead of throwing', () => {
        for (const tool of ['channel', 'pitchfork', 'xabcd', 'fibext', 'tri', 'dcurve', 'triangle', 'regression'] as const) {
            const svg = placeFirstPointThenMove(tool);
            // Something is painted for the draft, and the layer still holds the interactive surface.
            expect(svg.querySelectorAll('line, path, polygon, rect, text').length, tool).toBeGreaterThan(0);
            cleanup();
        }
    });
});

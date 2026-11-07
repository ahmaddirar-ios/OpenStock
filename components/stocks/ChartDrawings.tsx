'use client';

import { useEffect, useRef, useState } from 'react';
import { DRAWING_COLORS, FIB_EXT_RATIOS, FIB_TREND_EXT_RATIOS, ICON_GLYPHS, MAX_STROKE_POINTS, anchoredVwapBands, annotationText, arcThrough, arrowHeadPoints, extendSegment, candlesBetween, carriesText, channelRails, circleFrom, cleanText, cycleIndices, dashOf, disjointChannel, doubleCurvePath, drawingColor, ellipseFrom, extendedEnds, fibArcRadii, fibChannelLevels, fibExtension, fibFanEnds, fibLevels, fibRatiosOf, fibSpiralPoints, fibTimeMultiples, fibWedgeLines, fillOf, flattenLines, gannBoxGuides, gannFanEnds, gannGuides, gannSquareCorner, gannSquareFixedCorner, GANN_SQUARE_FIXED_SIDE, handleIndex, hitTest, isFreehand, isImageUrl, labelsFor, measureSpan, nearestTime, newDrawingId, pitchforkLines, pointsNeeded, polygonPoints, polylinePath, positionZones, priceLabel, projectionEnds, quadraticPath, rangeReadout, rayEnd, regressionChannel, rotatedRectCorners, sinePoints, speedFanEnds, strokeWidthOf, TABLE_MAX, tableGrid, textColorOf, textStyleOf, toolDef, trendAngleDeg, type DrawCandle, type DrawPoint, type Drawing, type ScreenPoint, type ShapeKind, type ShapeTool, volumeProfile } from '@/lib/chart-drawings';
import { measureDetail, measureHeadline, measureReadout } from '@/lib/chart-measure';
import type { StringKey } from '@/lib/i18n';

export type ActiveTool = ShapeTool | 'select' | 'measure';

type Props = {
    drawings: Drawing[];
    /** Every selected drawing. Shift-click adds to the set, so several can move or delete together. */
    selectedIds: string[];
    tool: ActiveTool | null;
    /** Filled in when the note tool places a label. */
    text: string;
    /** Glyphs for the shape being placed, when the tool's default is not what the user asked for. */
    labels?: string[] | null;
    /** Asks the component to open the editor on a note (from the drawings list). */
    editRequest?: { id: string; nonce: number } | null;
    /** Bar times of the interval on screen, so a cycle can land on real bars. */
    barTimes: number[];
    /** The candles on screen: a regression channel is fitted to them and the volume tools count them. */
    candles?: DrawCandle[];
    /** Chart pixels for a drawing point, or null when the chart is not ready or the point is off screen. */
    toScreen: (point: DrawPoint) => ScreenPoint | null;
    /** The inverse, so a pointer position can be stored as a chart point. */
    fromScreen: (x: number, y: number) => DrawPoint | null;
    onCommit: (drawing: Drawing) => void;
    onSelect: (ids: string[]) => void;
    onMoveHandle: (id: string, index: number, point: DrawPoint) => void;
    /** The whole drawing moved: the parent translates it from the anchor it kept for this gesture. */
    onMoveBody: (ids: string[], delta: { time: number; price: number }) => void;
    /** Called once when a body drag starts, so the parent can snapshot the drawings for one undo step. */
    onMoveBodyStart: (ids: string[]) => void;
    /** A note's new wording, saved from the editor on the chart. */
    onEditText: (id: string, text: string) => void;
    /** Called once a drawing is finished, so the toolbar can drop the tool. */
    onToolConsumed: () => void;
    /** A drag started: the page snapshots the list so the whole drag is one undo step. */
    onGestureStart: () => void;
    /** A drag ended: the page records that one step. */
    onGestureEnd: () => void;
    /** Magnet rounding for a freshly placed or dragged point (identity when the magnet is off). */
    snapPoint?: (point: DrawPoint) => DrawPoint;
    /** A right-click: the drawing under the pointer (already selected), or null on empty chart space. */
    onContextMenu?: (hit: { id: string; x: number; y: number } | null) => void;
    label: (key: StringKey) => string;
};

const HANDLE = 5;
const GRAB = 9;
const TEXT_DOT = 3;
/** How far the pointer must travel before a freehand stroke keeps another point. */
const STROKE_STEP = 3;
/** A highlighter marks, it does not draw: much wider than the brush and always translucent. */
const HIGHLIGHTER_WIDTH = 12;

// An SVG layer over the chart. It only takes pointer events while a tool is active, so panning and
// zooming the chart underneath keep working exactly as they do without drawings.
export default function ChartDrawings({
    drawings,
    selectedIds,
    tool,
    text,
    labels,
    editRequest,
    barTimes,
    candles = [],
    toScreen,
    fromScreen,
    onCommit,
    onSelect,
    onMoveHandle,
    onMoveBody,
    onMoveBodyStart,
    onGestureStart,
    onGestureEnd,
    snapPoint,
    onContextMenu,
    onEditText,
    onToolConsumed,
    label,
}: Props) {
    const svgRef = useRef<SVGSVGElement>(null);
    /** True between a freehand stroke's pointerdown and its pointerup. */
    const strokingRef = useRef(false);    const [draft, setDraft] = useState<DrawPoint[]>([]);
    const [preview, setPreview] = useState<DrawPoint | null>(null);
    const [dragging, setDragging] = useState<{ id: string; index: number } | null>(null);
    // Grabbing the shape itself: the anchor is the chart point the gesture started on, so every move
    // is a delta from where the line was, not from where it has already been pushed.
    const bodyDrag = useRef<{ ids: string[]; anchor: DrawPoint } | null>(null);
    // The measure box lives only while the measure tool is on: it is a reading, not a drawing.
    const [measure, setMeasure] = useState<{ from: DrawPoint; to: DrawPoint } | null>(null);
    const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const drawingsRef = useRef(drawings);
    drawingsRef.current = drawings;

    useEffect(() => {
        if (editing) inputRef.current?.select();
    }, [editing]);

    // The drawings list can open a note's editor by id; the nonce makes a repeated request work.
    const editNonce = editRequest?.nonce ?? 0;    useEffect(() => {
        if (!editRequest) return;
        const note = drawingsRef.current.find((drawing) => drawing.id === editRequest.id);
        if (note) setEditing({ id: note.id, value: note.text ?? '' });
    }, [editNonce, editRequest]);

    // A tool change (or a different selection) abandons whatever was half drawn.
    useEffect(() => {
        setDraft([]);
        setPreview(null);
        setDragging(null);
        setEditing(null);
        // A reading belongs to the gesture that made it, not to the tool.
        setMeasure(null);
    }, [tool]);

    // Drawings stay on screen when no tool is armed; only the pointer capture is switched off, so the
    // chart underneath keeps panning and zooming normally.
    const interactive = Boolean(tool);

    // 'select' and 'measure' are gestures, not shapes: only a real shape tool has a point count.
    const shapeTool: ShapeTool | null = tool != null && tool !== 'select' && tool !== 'measure' ? tool : null;

    // A range counts its bars from the interval on screen, which is the spacing of the bar times.
    const barSeconds = barTimes.length > 1 ? Math.abs(barTimes[1] - barTimes[0]) : 0;

    const screenOf = (drawing: Drawing): ScreenPoint[] => drawing.points.map((point) => toScreen(point) ?? { x: NaN, y: NaN });
    const kindOf = (drawing: Drawing): ShapeKind => toolDef(drawing.tool).kind;
    const selectedSet = new Set(selectedIds);
    const usable = (points: ScreenPoint[]) => (points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ? points : []);

    const cursorOf = (event: React.PointerEvent): ScreenPoint => {
        const rect = svgRef.current?.getBoundingClientRect();
        return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
    };

    // A right-click on a drawing opens the object menu; on empty space it clears the selection. The
    // browser menu is suppressed only while the layer is interactive, so a right-click with no tool
    // armed still behaves like a normal page.
    const onContextMenuEvent = (event: React.MouseEvent) => {
        if (!interactive) return;
        event.preventDefault();
        const rect = svgRef.current?.getBoundingClientRect();
        const cursor = { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
        const hit = hitTest(drawings, drawings.map((drawing) => usable(screenOf(drawing))), cursor, GRAB);
        if (hit) {
            onSelect([hit.id]);
            onContextMenu?.({ id: hit.id, x: event.clientX, y: event.clientY });
        } else {
            onSelect([]);
            onContextMenu?.(null);
        }
    };

    const onPointerDown = (event: React.PointerEvent) => {
        if (!tool) return;
        const cursor = cursorOf(event);
        if (tool === 'measure') {
            const point = fromScreen(cursor.x, cursor.y);
            if (point) setMeasure({ from: point, to: point });
            return;
        }
        // A freehand tool draws by dragging: the stroke starts here and every move adds to it.
        if (shapeTool && isFreehand(shapeTool)) {
            const raw = fromScreen(cursor.x, cursor.y);
            if (!raw) return;
            strokingRef.current = true;
            setDraft([snapPoint ? snapPoint(raw) : raw]);
            setPreview(null);
            return;
        }
        const drawn = drawings.map(screenOf);
        const drawable = drawings.map((_, i) => usable(drawn[i]));

        if (tool === 'select') {
            // A handle of any selected drawing wins: grabbing one point of a group edits that point.
            for (const drawing of drawings) {
                if (!selectedSet.has(drawing.id) || drawing.locked) continue;
                const grabbed = handleIndex(drawn[drawings.indexOf(drawing)], cursor, GRAB);
                if (grabbed !== null) {
                    onGestureStart();
                    setDragging({ id: drawing.id, index: grabbed });
                    return;
                }
            }
            // Not a handle but on the body of a selected drawing: drag the whole selection together.
            const selectedDrawings = drawings.filter((drawing) => selectedSet.has(drawing.id) && !drawing.locked);
            if (selectedDrawings.length > 0) {
                const onBody = hitTest(
                    selectedDrawings,
                    selectedDrawings.map((drawing) => usable(screenOf(drawing))),
                    cursor,
                    GRAB,
                    (drawing) => kindOf(drawing),
                );
                if (onBody) {
                    const anchor = fromScreen(cursor.x, cursor.y);
                    if (anchor) {
                        const ids = selectedDrawings.map((drawing) => drawing.id);
                        onMoveBodyStart(ids);
                        bodyDrag.current = { ids, anchor };
                        return;
                    }
                }
            }
            setEditing(null);
            const hit = hitTest(drawings, drawable, cursor, GRAB);
            // Shift (or a command key) adds to the selection instead of replacing it.
            const additive = event.shiftKey || event.metaKey || event.ctrlKey;
            if (!hit) {
                if (!additive) onSelect([]);
                return;
            }
            if (additive) {
                onSelect(selectedSet.has(hit.id) ? selectedIds.filter((id) => id !== hit.id) : [...selectedIds, hit.id]);
            } else {
                onSelect([hit.id]);
            }
            return;
        }

        const raw = fromScreen(cursor.x, cursor.y);
        if (!raw) return;
        const point = snapPoint ? snapPoint(raw) : raw;
        const needed = pointsNeeded(tool as ShapeTool);
        // One-point tools (a level, a note) commit straight away; the rest collect clicks.
        if (needed === 1) {
            onCommit({
                id: newDrawingId(),
                tool,
                points: [point],
                ...(annotationText(tool, point.price, text) ? { text: annotationText(tool, point.price, text) } : {}),
            });
            onToolConsumed();
            return;
        }
        // An open-ended tool takes as many points as the trader gives it and is finished with a
        // double click. The second click of that double click lands on the last point again, so a
        // repeat within a few pixels replaces it instead of doubling it.
        if (needed === 0) {
            const next = [...draft];
            const last = next.length > 0 ? toScreen(next[next.length - 1]) : null;
            if (last && Math.hypot(last.x - cursor.x, last.y - cursor.y) <= 4) {
                next[next.length - 1] = point;
            } else {
                next.push(point);
            }
            setDraft(next.slice(0, MAX_STROKE_POINTS));
            setPreview(null);
            return;
        }
        const next = [...draft, point];
        if (next.length < needed) {
            setDraft(next);
            return;
        }
        const glyphs = labels ?? toolDef(tool).pointLabels;
        onCommit({
            id: newDrawingId(),
            tool,
            points: next,
            ...(glyphs ? { labels: glyphs } : {}),
            ...(annotationText(tool, next[next.length - 1].price, text) ? { text: annotationText(tool, next[next.length - 1].price, text) } : {}),
        });
        setDraft([]);
        setPreview(null);
        onToolConsumed();
    };

    const onPointerMove = (event: React.PointerEvent) => {
        const cursor = cursorOf(event);
        // A stroke follows the pointer while the button is down: the point is kept only once the
        // pointer has travelled far enough to be a stroke rather than a jitter.
        if (strokingRef.current) {
            const raw = fromScreen(cursor.x, cursor.y);
            if (!raw) return;
            const point = snapPoint ? snapPoint(raw) : raw;
            setDraft((current) => {
                if (current.length >= MAX_STROKE_POINTS) return current;
                const last = toScreen(current[current.length - 1]);
                if (last && Math.hypot(last.x - cursor.x, last.y - cursor.y) < STROKE_STEP) return current;
                return [...current, point];
            });
            return;
        }
        if (tool === 'measure' && measure) {
            const point = fromScreen(cursor.x, cursor.y);
            if (point) setMeasure({ from: measure.from, to: point });
            return;
        }
        if (bodyDrag.current) {
            const current = fromScreen(cursor.x, cursor.y);
            if (current) {
                const { ids, anchor } = bodyDrag.current;
                onMoveBody(ids, { time: current.time - anchor.time, price: current.price - anchor.price });
            }
            return;
        }
        if (dragging) {
            const point = fromScreen(cursor.x, cursor.y);
            if (point) onMoveHandle(dragging.id, dragging.index, snapPoint ? snapPoint(point) : point);
            return;
        }
        if (draft.length > 0) {
            const raw = fromScreen(cursor.x, cursor.y);
            setPreview(raw && snapPoint ? snapPoint(raw) : raw);
        }
    };

    const onPointerUp = () => {
        // Releasing the button ends a stroke: two points make a line, one is just a dot.
        if (strokingRef.current) {
            strokingRef.current = false;
            const points = draft.slice(0, MAX_STROKE_POINTS);
            setDraft([]);
            setPreview(null);
            if (shapeTool && points.length >= 2) {
                onCommit({ id: newDrawingId(), tool: shapeTool, points });
                onToolConsumed();
            }
            return;
        }
        if (bodyDrag.current) {
            bodyDrag.current = null;
            onGestureEnd();
        }
        if (dragging) onGestureEnd();
        setDragging(null);
    };
    // Rewriting a note is a double click: a single click on its dot has to stay free for dragging it.
    const onDoubleClick = (event: React.MouseEvent) => {
        // An open-ended stroke (a polyline, and later the brush) is finished by this double click.
        if (shapeTool && pointsNeeded(shapeTool) === 0 && draft.length >= 2) {
            onCommit({ id: newDrawingId(), tool: shapeTool, points: draft });
            setDraft([]);
            setPreview(null);
            onToolConsumed();
            return;
        }
        if (tool !== 'select') return;
        const rect = svgRef.current?.getBoundingClientRect();
        const cursor = { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
        const hit = hitTest(drawings, drawings.map((drawing) => usable(screenOf(drawing))), cursor, GRAB);
        if (hit && carriesText(hit.tool)) setEditing({ id: hit.id, value: hit.text ?? '' });
    };
    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        setMeasure(null);
        setDraft([]);
        setPreview(null);
        setDragging(null);
        setEditing(null);
        onSelect([]);
    };

    const saveEdit = () => {
        if (!editing) return;
        onEditText(editing.id, editing.value);
        setEditing(null);
    };

    // The ruler: a box between the two points, the price at each end, and a chip that reads the move
    // in price, percent, bars, time and volume. It is a reading, not a drawing, so it lives only
    // while the measure tool is armed.
    const measureRead = measure ? measureReadout(measure.from, measure.to, barSeconds, candles) : null;
    const measureTone = measureRead && measureRead.price < 0 ? '#EF5350' : '#26A69A';
    const measureBox = (() => {
        if (!measure || !measureRead) return null;
        const a = toScreen(measure.from);
        const b = toScreen(measure.to);
        if (!a || !b) return null;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const endLabel = (spot: ScreenPoint, price: number, key: string) => (
            <text
                key={key}
                x={spot.x + 6}
                y={spot.y - 6}
                fontSize={11}
                className="mono"
                fill={measureTone}
                style={{ paintOrder: 'stroke', stroke: 'var(--page)', strokeWidth: 3 }}
            >
                {price.toFixed(2)}
            </text>
        );
        return (
            <g key="measure">
                <rect
                    x={x}
                    y={y}
                    width={Math.abs(b.x - a.x)}
                    height={Math.abs(b.y - a.y)}
                    fill={`color-mix(in oklab, ${measureTone} 16%, transparent)`}
                    stroke={measureTone}
                    strokeWidth={1.4}
                />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={measureTone} strokeWidth={1.2} strokeDasharray="4 3" />
                {endLabel(a, measure.from.price, 'measure-from')}
                {endLabel(b, measure.to.price, 'measure-to')}
            </g>
        );
    })();

    // The chip is HTML rather than SVG text so it can be clamped inside the plot: a reading that
    // runs off the edge of the chart is a reading the trader cannot finish.
    const measureChip = (() => {
        if (!measure || !measureRead) return null;
        const b = toScreen(measure.to);
        if (!b) return null;
        const headline = measureHeadline(measureRead);
        const detail = measureDetail(measureRead, label('chart.range.bars'), label('chart.measure.vol'));
        const rect = svgRef.current?.getBoundingClientRect();
        const width = rect?.width ?? 0;
        const height = rect?.height ?? 0;
        // 11px monospace is about 6.6px a character; the padding and border add the rest.
        const chipWidth = Math.max(headline.length, detail.length) * 6.6 + 22;
        const chipHeight = 44;
        const left = Math.min(Math.max(4, b.x + 12), Math.max(4, width - chipWidth - 4));
        const top = Math.min(Math.max(4, b.y - chipHeight - 12), Math.max(4, height - chipHeight - 4));
        return (
            <div
                key="measure-chip"
                dir="ltr"
                className="pointer-events-none absolute z-20 flex flex-col gap-0.5 rounded-[8px] border bg-page/95 px-2 py-1 shadow-[0_6px_18px_rgba(0,0,0,0.28)]"
                style={{ left, top, borderColor: measureTone }}
            >
                <span className="mono text-[11.5px] font-semibold leading-tight" style={{ color: measureTone }}>
                    {headline}
                </span>
                <span className="mono text-[10.5px] leading-tight text-faint">{detail}</span>
            </div>
        );
    })();

    // Everything stored, plus the shape being drawn right now. A draft is padded up to the number of
    // points its tool needs, by repeating the point under the cursor: a channel's preview is painted
    // the moment its first leg is placed, and every painter can read the points it expects — before
    // this, a three-click tool crashed the chart on the first mouse move (its painter read a point
    // that did not exist yet).
    const draftPoints = (() => {
        if (draft.length === 0 || !preview || !tool) return null;
        const points = [...draft, preview];
        const needed = pointsNeeded(tool as ShapeTool);
        if (needed === 0) return points;
        while (points.length < needed) points.push(preview);
        return points.slice(0, Math.max(needed, points.length));
    })();
    const shapes: Drawing[] = draftPoints && tool && tool !== 'select'
        ? [...drawings, { id: 'draft', tool: tool as ShapeTool, points: draftPoints, labels: labels ?? toolDef(tool as ShapeTool).pointLabels }]
        : drawings;

    const dot = (x: number, y: number, key: string, color: string, opacity: number, radius = 4) => (
        <circle key={key} cx={x} cy={y} r={radius} fill={color} opacity={opacity} />
    );

    const shapeFor = (drawing: Drawing) => {
        const points = drawing.points.map((point) => toScreen(point));
        if (points.some((point) => !point)) return null;
        const screen = points as ScreenPoint[];
        const kind = toolDef(drawing.tool).kind;
        const color = drawingColor(drawing);
        const previewing = drawing.id === 'draft';
        const opacity = previewing ? 0.65 : 1;
        // The fill is its own choice now: a box can be filled with a different colour at a strength
        // the trader picked, and the tool's original look is the default rather than the only option.
        const paint = fillOf(drawing);
        // Words can wear their own colour: a note in white over a busy candle is a choice, not a bug.
        const ink = textColorOf(drawing);
        const fill = paint.opacity > 0 ? `color-mix(in oklab, ${paint.color} ${paint.opacity}%, transparent)` : 'none';
        const selected = selectedSet.has(drawing.id);
        const locked = drawing.locked === true;
        // The trader's stroke, with the selection adding a little weight for feedback.
        const width = strokeWidthOf(drawing) + (selected ? 0.8 : 0);
        const dash = dashOf(drawing);
        const glyphs = labelsFor(drawing);

        // A level runs the whole width; where it is clicked horizontally does not matter.
        if (kind === 'horizontal') {
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <line x1={0} x2="100%" y1={screen[0].y} y2={screen[0].y} stroke={color} strokeWidth={width} opacity={opacity} strokeDasharray={selected ? undefined : '6 4'} />
                    {dot(screen[0].x, screen[0].y, `${drawing.id}-p`, color, opacity)}
                </g>
            );
        }

        if (kind === 'vlines') {
            const [a, b] = drawing.points.map((point) => nearestTime(barTimes, point.time));
            const indexA = a == null ? -1 : barTimes.indexOf(a);
            const indexB = b == null ? -1 : barTimes.indexOf(b);
            if (indexA < 0 || indexB < 0) return null;
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {cycleIndices(barTimes.length, indexA, indexB).map((index) => {
                        const x = toScreen({ time: barTimes[index], price: drawing.points[0].price })?.x;
                        if (x == null) return null;
                        return <line key={`${drawing.id}-c${index}`} x1={x} x2={x} y1={0} y2="100%" stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={opacity} />;
                    })}
                </g>
            );
        }

        if (kind === 'sine') {
            const curve = sinePoints(screen[0], screen[1], (svgRef.current?.clientWidth ?? 0));
            if (curve.length === 0) return null;
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <path d={curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth={width} opacity={opacity} />
                    {dot(screen[0].x, screen[0].y, `${drawing.id}-a`, color, opacity)}
                    {dot(screen[1].x, screen[1].y, `${drawing.id}-b`, color, opacity)}
                </g>
            );
        }

        if (kind === 'fib') {
            let lastLabelY: number | null = null;
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {fibLevels(drawing.points[0], drawing.points[1], fibRatiosOf(drawing)).map(({ ratio, price }) => {
                        const y = toScreen({ time: drawing.points[0].time, price })?.y;
                        if (y == null) return null;
                        const left = Math.min(screen[0].x, screen[1].x);
                        const right = Math.max(screen[0].x, screen[1].x, svgRef.current?.clientWidth ?? 0);
                        const stacked = lastLabelY != null && Math.abs(y - lastLabelY) < 13;
                        if (!stacked) lastLabelY = y;
                        return (
                            <g key={`${drawing.id}-f${ratio}`}>
                                <line x1={left} x2={right} y1={y} y2={y} stroke={color} strokeWidth={1} strokeDasharray={ratio === 0 || ratio === 1 ? undefined : '5 4'} opacity={opacity} />
                                {!stacked && (
                                    <text x={right - 4} y={y - 4} textAnchor="end" fontSize={10.5} fill={color} className="mono" opacity={opacity}>
                                        {ratio} ({price.toFixed(2)})
                                    </text>
                                )}
                            </g>
                        );
                    })}
                    {dot(screen[0].x, screen[0].y, `${drawing.id}-a`, color, opacity)}
                    {dot(screen[1].x, screen[1].y, `${drawing.id}-b`, color, opacity)}
                </g>
            );
        }

        if (kind === 'gann') {
            const { corners, midPrice } = gannGuides(drawing.points[0], drawing.points[1]);
            const tops = corners.map((corner) => toScreen(corner));
            if (tops.some((point) => !point)) return null;
            const xs = tops.map((point) => (point as ScreenPoint).x);
            const top = toScreen({ time: corners[0].time, price: Math.max(drawing.points[0].price, drawing.points[1].price) })?.y;
            const bottom = toScreen({ time: corners[0].time, price: Math.min(drawing.points[0].price, drawing.points[1].price) })?.y;
            const middle = toScreen({ time: corners[0].time, price: midPrice })?.y;
            if (top == null || bottom == null || middle == null) return null;
            const left = Math.min(...xs);
            const right = Math.max(...xs);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <rect x={left} y={top} width={right - left} height={bottom - top} fill="none" stroke={color} strokeWidth={width} opacity={opacity} />
                    <line x1={left} y1={top} x2={right} y2={bottom} stroke={color} strokeWidth={1} opacity={0.7} />
                    <line x1={left} y1={bottom} x2={right} y2={top} stroke={color} strokeWidth={1} opacity={0.7} />
                    <line x1={left} y1={middle} x2={right} y2={middle} stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
                    <line x1={(left + right) / 2} y1={top} x2={(left + right) / 2} y2={bottom} stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
                    {dot(screen[0].x, screen[0].y, `${drawing.id}-a`, color, opacity)}
                    {dot(screen[1].x, screen[1].y, `${drawing.id}-b`, color, opacity)}
                </g>
            );
        }

        if (kind === 'text') {
            const style = textStyleOf(drawing);
            // The chip is measured from the glyphs themselves: the SVG text has no server-side box,
            // so the width is the character count at the same size the renderer paints.
            const chipWidth = Math.max(1, (drawing.text ?? '').length) * style.fontSize * 0.62 + 10;
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {drawing.background && (
                        <rect
                            x={screen[0].x + 4}
                            y={screen[0].y + 4 - style.fontSize}
                            width={chipWidth}
                            height={style.fontSize + 8}
                            rx={4}
                            fill={`color-mix(in oklab, var(--page) 78%, black)`}
                            stroke={`color-mix(in oklab, ${color} 45%, transparent)`}
                            strokeWidth={1}
                            opacity={opacity}
                        />
                    )}
                    {dot(screen[0].x, screen[0].y, `${drawing.id}-p`, color, opacity, TEXT_DOT)}
                    <text
                        x={screen[0].x + 8}
                        y={screen[0].y + 4}
                        fill={ink}
                        fontSize={textStyleOf(drawing).fontSize}
                        fontWeight={textStyleOf(drawing).fontWeight}
                        fontStyle={textStyleOf(drawing).fontStyle}
                        opacity={opacity}
                        className="mono"
                    >
                        {drawing.text}
                    </text>
                </g>
            );
        }

        if (kind === 'rectangle') {
            const x = Math.min(screen[0].x, screen[1].x);
            const y = Math.min(screen[0].y, screen[1].y);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <rect
                        x={x}
                        y={y}
                        width={Math.abs(screen[1].x - screen[0].x)}
                        height={Math.abs(screen[1].y - screen[0].y)}
                        fill={fill}
                        stroke={color}
                        strokeWidth={width}
                        opacity={opacity}
                    />
                    {selected && !locked && screen.map((point, i) => <rect key={i} x={point.x - HANDLE} y={point.y - HANDLE} width={HANDLE * 2} height={HANDLE * 2} fill={color} />)}
                </g>
            );
        }

        if (kind === 'table') {
            // A box of cells: the two anchors are the corners, and every row and column is drawn as
            // an even slice of it. The text is the grid itself, so a cell is filled in where it sits.
            const left = Math.min(screen[0].x, screen[1].x);
            const top = Math.min(screen[0].y, screen[1].y);
            const boxW = Math.abs(screen[1].x - screen[0].x);
            const boxH = Math.abs(screen[1].y - screen[0].y);
            const grid = tableGrid(drawing.text);
            const cols = grid[0]?.length ?? 1;
            const rows = grid.length;
            const cellW = boxW / cols;
            const cellH = boxH / rows;
            const fontSize = Math.max(8, Math.min(13, cellH * 0.55));
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <rect x={left} y={top} width={boxW} height={boxH} fill={fill} stroke={color} strokeWidth={width} opacity={opacity} />
                    {Array.from({ length: cols - 1 }, (_, i) => (
                        <line key={`${drawing.id}-v${i}`} x1={left + cellW * (i + 1)} y1={top} x2={left + cellW * (i + 1)} y2={top + boxH} stroke={color} strokeWidth={1} opacity={opacity * 0.65} />
                    ))}
                    {Array.from({ length: rows - 1 }, (_, i) => (
                        <line key={`${drawing.id}-h${i}`} x1={left} y1={top + cellH * (i + 1)} x2={left + boxW} y2={top + cellH * (i + 1)} stroke={color} strokeWidth={1} opacity={opacity * 0.65} />
                    ))}
                    {grid.flatMap((row, r) =>
                        row.map((cell, c) =>
                            cell.length > 0 && cellW > 12 && cellH > 9 ? (
                                <text
                                    key={`${drawing.id}-c${r}-${c}`}
                                    x={left + cellW * c + 4}
                                    y={top + cellH * r + cellH / 2 + fontSize * 0.35}
                                    fill={ink}
                                    fontSize={fontSize}
                                    opacity={opacity}
                                    className="mono"
                                >
                                    {cell.length > Math.floor(cellW / (fontSize * 0.6)) ? `${cell.slice(0, Math.max(1, Math.floor(cellW / (fontSize * 0.6))))}…` : cell}
                                </text>
                            ) : null,
                        ),
                    )}
                    {selected && !locked && screen.map((point, i) => <rect key={i} x={point.x - HANDLE} y={point.y - HANDLE} width={HANDLE * 2} height={HANDLE * 2} fill={color} />)}
                </g>
            );
        }

        if (kind === 'xrect') {
            // A box whose top and bottom prices run on to the right edge.
            const rightEdge = svgRef.current?.clientWidth ?? 0;
            const left = Math.min(screen[0].x, screen[1].x);
            const top = Math.min(screen[0].y, screen[1].y);
            const bottom = Math.max(screen[0].y, screen[1].y);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <rect
                        x={left}
                        y={top}
                        width={Math.max(0, rightEdge - left)}
                        height={Math.max(0, bottom - top)}
                        fill={fill}
                        stroke={color}
                        strokeWidth={width}
                        opacity={opacity}
                    />
                    {selected && !locked && screen.map((point, i) => <rect key={i} x={point.x - HANDLE} y={point.y - HANDLE} width={HANDLE * 2} height={HANDLE * 2} fill={color} />)}
                </g>
            );
        }

        if (kind === 'channel') {
            const rightEdge = svgRef.current?.clientWidth ?? 0;
            const rails = channelRails(drawing.points[0], drawing.points[1], drawing.points[2]);
            const ends = rails.base.map((point) => toScreen(point));
            const offsets = rails.parallel.map((point) => toScreen(point));
            if ([...ends, ...offsets].some((point) => !point)) return null;
            const [b0, b1] = ends as ScreenPoint[];
            const [p0, p1] = offsets as ScreenPoint[];
            const reach = (from: ScreenPoint, to: ScreenPoint) => {
                const dx = to.x - from.x;
                const y = Math.abs(dx) > 1 ? from.y + ((to.y - from.y) / dx) * (rightEdge - from.x) : from.y;
                return { from, end: { x: rightEdge, y } };
            };
            const baseRay = reach(b0, b1);
            const parallelRay = reach(p0, p1);
            const area = `${b0.x},${b0.y} ${baseRay.end.x},${baseRay.end.y} ${parallelRay.end.x},${parallelRay.end.y} ${p0.x},${p0.y}`;
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <polygon points={area} fill={`color-mix(in oklab, ${color} 8%, transparent)`} stroke="none" />
                    <line x1={b0.x} y1={b0.y} x2={baseRay.end.x} y2={baseRay.end.y} stroke={color} strokeWidth={width} opacity={opacity} />
                    <line x1={p0.x} y1={p0.y} x2={parallelRay.end.x} y2={parallelRay.end.y} stroke={color} strokeWidth={width} opacity={opacity} />
                    <line x1={b0.x} y1={b0.y} x2={p0.x} y2={p0.y} stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
                    {selected && !locked && screen.map((point, i) => <rect key={i} x={point.x - HANDLE} y={point.y - HANDLE} width={HANDLE * 2} height={HANDLE * 2} fill={color} />)}
                </g>
            );
        }

        if (kind === 'arrow') {
            const head = arrowHeadPoints(screen[0], screen[1], 9 + width * 2);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <line x1={screen[0].x} y1={screen[0].y} x2={screen[1].x} y2={screen[1].y} stroke={color} strokeWidth={width} opacity={opacity} />
                    {head && <polygon points={head} fill={color} opacity={opacity} />}
                    {dot(screen[0].x, screen[0].y, `${drawing.id}-a`, color, opacity, TEXT_DOT)}
                    {selected && !locked && screen.map((point, i) => <rect key={i} x={point.x - HANDLE} y={point.y - HANDLE} width={HANDLE * 2} height={HANDLE * 2} fill={color} />)}
                </g>
            );
        }

        if (kind === 'pricetime') {
            const span = measureSpan(drawing.points[0], drawing.points[1]);
            const days = Math.abs(span.seconds) / 86400;
            const spanText = days >= 1 ? `${days.toFixed(1)}D` : `${(Math.abs(span.seconds) / 3600).toFixed(1)}H`;
            const priceText = `${span.price >= 0 ? '+' : '−'}${Math.abs(span.price).toFixed(2)}`;
            const x = Math.min(screen[0].x, screen[1].x);
            const y = Math.min(screen[0].y, screen[1].y);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <rect
                        x={x}
                        y={y}
                        width={Math.abs(screen[1].x - screen[0].x)}
                        height={Math.abs(screen[1].y - screen[0].y)}
                        fill={fill}
                        stroke={color}
                        strokeWidth={width}
                        opacity={opacity}
                    />
                    <text
                        x={x + Math.abs(screen[1].x - screen[0].x) / 2}
                        y={y - 6}
                        textAnchor="middle"
                        fontSize={12}
                        className="mono"
                        fill={color}
                        opacity={opacity}
                    >
                        {`${priceText} · ${spanText}`}
                    </text>
                    {selected && !locked && screen.map((point, i) => <rect key={i} x={point.x - HANDLE} y={point.y - HANDLE} width={HANDLE * 2} height={HANDLE * 2} fill={color} />)}
                </g>
            );
        }

        if (kind === 'poly' || kind === 'hs' || kind === 'triangle') {
            const rightEdge = svgRef.current?.clientWidth ?? 0;
            const ray = (from: ScreenPoint, to: ScreenPoint, key: string, stroke: string) => {
                const dx = to.x - from.x;
                const y = Math.abs(dx) > 1 ? from.y + ((to.y - from.y) / dx) * (rightEdge - from.x) : from.y;
                return <line key={key} x1={from.x} y1={from.y} x2={rightEdge} y2={y} stroke={stroke} strokeWidth={width} opacity={opacity} />;
            };
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {kind !== 'triangle' &&
                        screen.slice(0, -1).map((point, i) => (
                            <line key={`${drawing.id}-s${i}`} x1={point.x} y1={point.y} x2={screen[i + 1].x} y2={screen[i + 1].y} stroke={color} strokeWidth={width} opacity={opacity} />
                        ))}
                    {kind === 'hs' && screen.length >= 4 && (
                        <line
                            key={`${drawing.id}-neck`}
                            x1={screen[1].x}
                            y1={screen[1].y}
                            x2={rightEdge}
                            y2={screen[1].y + ((screen[3].y - screen[1].y) / Math.max(1, screen[3].x - screen[1].x)) * (rightEdge - screen[1].x)}
                            stroke={color}
                            strokeWidth={1.5}
                            strokeDasharray="5 3"
                            opacity={opacity}
                        />
                    )}
                    {kind === 'triangle' && screen.length >= 4 && (
                        <>
                            {ray(screen[0], screen[1], `${drawing.id}-up`, '#EF5350')}
                            {ray(screen[2], screen[3], `${drawing.id}-lo`, '#26A69A')}
                        </>
                    )}
                    {screen.map((point, i) => (
                        <g key={`${drawing.id}-p${i}`}>
                            {dot(point.x, point.y, `${drawing.id}-d${i}`, color, opacity)}
                            {glyphs[i] && (
                                <text x={point.x} y={point.y - 8} textAnchor="middle" fontSize={12} fontWeight={700} fill={color} opacity={opacity}>
                                    {glyphs[i]}
                                </text>
                            )}
                        </g>
                    ))}
                    {selected && !locked && screen.map((point, i) => <rect key={`h${i}`} x={point.x - HANDLE} y={point.y - HANDLE} width={HANDLE * 2} height={HANDLE * 2} fill={color} />)}
                </g>
            );
        }

        // --- the basic line family ---------------------------------------------
        // One segment whose far end the visible range decides. Where that end sits is chart maths
        // (rayEnd / extendedEnds), then only its *price* is asked of the scale: the chart's own
        // time→pixel lookup stops at the last bar, and a line has to reach the panel's edge.
        const edgeX = svgRef.current?.clientWidth ?? 0;
        const edgeY = svgRef.current?.clientHeight ?? 0;
        const priceY = (time: number, price: number): number | null => toScreen({ time, price })?.y ?? null;
        // Where the panel's right edge sits in chart time. The chart's own lookup stops a pixel short
        // of the edge (the right offset is not part of its time scale), so when it gives up, the
        // clicked trend's slope is carried on linearly — the same approximation the price fallbacks
        // make. Every ray, extension and fan needs this; nothing else does.
        const edgeTimeAt = (x: number, a: DrawPoint, b: DrawPoint, at: ScreenPoint, bt: ScreenPoint): number | null =>
            fromScreen(x, 0)?.time ?? (bt.x === at.x ? null : a.time + ((b.time - a.time) / (bt.x - at.x)) * (x - at.x));
        const selectionHandles = (points: ScreenPoint[]) =>
            selected && !locked
                ? points.map((point, i) => <rect key={`h${i}`} x={point.x - HANDLE} y={point.y - HANDLE} width={HANDLE * 2} height={HANDLE * 2} fill={color} />)
                : null;

        if (kind === 'ray' || kind === 'extended') {
            const [p0, p1] = drawing.points;
            let from: ScreenPoint = screen[0];
            let to: ScreenPoint = screen[1] ?? screen[0];
            if (p1 && p1.time !== p0.time) {
                const rightward = p1.time > p0.time;
                if (kind === 'ray') {
                    const edgeTime = edgeTimeAt(rightward ? edgeX : 0, p0, p1, screen[0], screen[1]);
                    if (edgeTime != null) {
                        const end = rayEnd(p0, p1, edgeTime);
                        const y = priceY(p0.time, end.price);
                        if (y != null && Number.isFinite(y)) to = { x: rightward ? edgeX : 0, y };
                    }
                } else {
                    const leftTime = edgeTimeAt(0, p0, p1, screen[0], screen[1]);
                    const rightTime = edgeTimeAt(edgeX, p0, p1, screen[0], screen[1]);
                    if (leftTime != null && rightTime != null) {
                        const [left, right] = extendedEnds(p0, p1, leftTime, rightTime);
                        const leftY = priceY(p0.time, left.price);
                        const rightY = priceY(p0.time, right.price);
                        if (leftY != null && rightY != null && Number.isFinite(leftY) && Number.isFinite(rightY)) {
                            from = { x: 0, y: leftY };
                            to = { x: edgeX, y: rightY };
                        }
                    }
                }
            }
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={width} opacity={opacity} />
                    {screen.map((point, i) => dot(point.x, point.y, `${drawing.id}-d${i}`, color, opacity, TEXT_DOT))}
                    {selectionHandles(screen)}
                </g>
            );
        }

        // A horizontal ray, a vertical line and a cross are each fixed by the one point they were
        // placed with, so the missing direction comes from the panel rather than from a second click.
        if (kind === 'hray' || kind === 'vline' || kind === 'cross') {
            const at = screen[0];
            const across = kind === 'hray' || kind === 'cross';
            const down = kind === 'vline' || kind === 'cross';
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {across && (
                        <line x1={kind === 'hray' ? at.x : 0} y1={at.y} x2={edgeX} y2={at.y} stroke={color} strokeWidth={width} opacity={opacity} />
                    )}
                    {down && <line x1={at.x} y1={0} x2={at.x} y2={edgeY} stroke={color} strokeWidth={width} opacity={opacity} />}
                    {dot(at.x, at.y, `${drawing.id}-p`, color, opacity, TEXT_DOT)}
                    {selectionHandles([at])}
                </g>
            );
        }

        // Both readouts hang off the segment they belong to: the angle the line looks like, or what
        // the move along it was worth.
        if (kind === 'trendangle' || kind === 'info') {
            const [p0, p1] = drawing.points;
            const span = measureSpan(p0, p1);
            const percent = p0.price === 0 ? 0 : (span.price / p0.price) * 100;
            const signed = (value: number, suffix = '') => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}${suffix}`;
            const readout =
                kind === 'trendangle'
                    ? `${trendAngleDeg(p0, p1, {
                          pxPerTime: p1.time === p0.time ? 0 : (screen[1].x - screen[0].x) / (p1.time - p0.time),
                          pxPerPrice: p1.price === p0.price ? 0 : -(screen[1].y - screen[0].y) / (p1.price - p0.price),
                      }).toFixed(1)}°`
                    : `${signed(span.price)} (${signed(percent, '%')})`;
            const middle = { x: (screen[0].x + screen[1].x) / 2, y: (screen[0].y + screen[1].y) / 2 };
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <line x1={screen[0].x} y1={screen[0].y} x2={screen[1].x} y2={screen[1].y} stroke={color} strokeWidth={width} opacity={opacity} />
                    <text x={middle.x} y={middle.y - 8} textAnchor="middle" fontSize={12} className="mono" fill={color} opacity={opacity}>
                        {readout}
                    </text>
                    {screen.map((point, i) => dot(point.x, point.y, `${drawing.id}-d${i}`, color, opacity, TEXT_DOT))}
                    {selectionHandles(screen)}
                </g>
            );
        }

        // --- forecasts: positions, ranges and projection -------------------------
        // A position sizes a trade, a range measures one, a projection repeats a move. The numbers
        // come from the helpers; the painter only decides where the boxes and readouts sit.
        const boxOf = (from: DrawPoint, to: DrawPoint, fill: string) => {
            const a = toScreen(from);
            const b = toScreen(to);
            if (!a || !b) return null;
            return (
                <rect
                    x={Math.min(a.x, b.x)}
                    y={Math.min(a.y, b.y)}
                    width={Math.abs(b.x - a.x)}
                    height={Math.abs(b.y - a.y)}
                    fill={fill}
                    stroke={color}
                    strokeWidth={1}
                    opacity={opacity}
                />
            );
        };
        const standing = (value: number, suffix = '') => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}${suffix}`;

        if (kind === 'longpos' || kind === 'shortpos') {
            const zones = positionZones(drawing.points[0], drawing.points[1], drawing.points[2]);
            const profit = boxOf(zones.profit[0], zones.profit[1], 'color-mix(in oklab, #26A69A 22%, transparent)');
            const loss = boxOf(zones.loss[0], zones.loss[1], 'color-mix(in oklab, #EF5350 22%, transparent)');
            if (!profit || !loss) return null;
            const targetY = toScreen(zones.profit[1])?.y;
            const stopY = toScreen(zones.loss[1])?.y;
            const entryY = toScreen(zones.profit[0])?.y;
            if (targetY == null || stopY == null || entryY == null) return null;
            const right = Math.max(screen[0].x, screen[1].x);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {profit}
                    {loss}
                    <line x1={screen[0].x} y1={entryY} x2={right} y2={entryY} stroke={color} strokeWidth={width} opacity={opacity} />
                    <text x={right - 6} y={targetY + 12} textAnchor="end" fontSize={11.5} className="mono" fill="#26A69A" opacity={opacity}>
                        {`${standing(zones.reward)} · ${label('chart.pos.riskReward')} ${Number.isFinite(zones.ratio) ? zones.ratio.toFixed(2) : '∞'}`}
                    </text>
                    <text x={right - 6} y={stopY - 6} textAnchor="end" fontSize={11.5} className="mono" fill="#EF5350" opacity={opacity}>
                        {`${standing(-zones.risk)} · ${zones.riskPercent.toFixed(2)}%`}
                    </text>
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'pricerange' || kind === 'daterange' || kind === 'dprange') {
            const readout = rangeReadout(drawing.points[0], drawing.points[1], barSeconds);
            const box = boxOf(drawing.points[0], drawing.points[1], 'color-mix(in oklab, ' + color + ' 10%, transparent)');
            if (!box) return null;
            const middle = { x: (screen[0].x + screen[1].x) / 2, y: (screen[0].y + screen[1].y) / 2 };
            const days = Math.abs(readout.seconds) / 86400;
            const duration = days >= 1 ? `${days.toFixed(1)}D` : `${(Math.abs(readout.seconds) / 3600).toFixed(1)}H`;
            const readings =
                kind === 'pricerange'
                    ? `${standing(readout.price)} (${standing(readout.percent, '%')})`
                    : kind === 'daterange'
                      ? `${duration} · ${readout.bars} ${label('chart.range.bars')}`
                      : `${standing(readout.price)} (${standing(readout.percent, '%')}) · ${duration} · ${readout.bars} ${label('chart.range.bars')}`;
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {box}
                    {/* The measuring line the range is read off, at the middle of the span. */}
                    <line x1={middle.x} y1={screen[0].y} x2={middle.x} y2={screen[1].y} stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={opacity} />
                    <text x={middle.x} y={Math.min(screen[0].y, screen[1].y) - 7} textAnchor="middle" fontSize={11.5} className="mono" fill={color} opacity={opacity}>
                        {readings}
                    </text>
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'projection') {
            const [p0, p1] = drawing.points;
            const [, end] = projectionEnds(p0, p1, 1);
            const endAt = toScreen(end);
            if (!endAt) return null;
            const span = rangeReadout(p0, end, barSeconds);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <line x1={screen[0].x} y1={screen[0].y} x2={screen[1].x} y2={screen[1].y} stroke={color} strokeWidth={width} opacity={opacity} />
                    <line x1={screen[1].x} y1={screen[1].y} x2={endAt.x} y2={endAt.y} stroke={color} strokeWidth={width} strokeDasharray="5 4" opacity={opacity} />
                    <text x={endAt.x} y={endAt.y - 7} textAnchor="end" fontSize={11.5} className="mono" fill={color} opacity={opacity}>
                        {`${standing(span.price)} (${standing(span.percent, '%')})`}
                    </text>
                    {selectionHandles(screen)}
                </g>
            );
        }

        // --- the rest of the Fibonacci family ------------------------------------
        // The retracement's own branch is above; these are the readings built on it. Every level is
        // a line the helpers produce; the painter places them, and only the extension family prints
        // its ratio (the fan, channel and arcs are read by their position). A level whose price sits
        // outside the visible price range cannot be placed by the chart's own scale, so the painter
        // falls back to the pixel slope between the two placed points and lets the SVG clip it.
        const priceYFrom = (a: DrawPoint, b: DrawPoint, at: ScreenPoint, bt: ScreenPoint): ((price: number) => number) | null => {
            const move = b.price - a.price;
            if (move === 0) return null;
            const perPrice = (bt.y - at.y) / move;
            return (price) => at.y + (price - a.price) * perPrice;
        };
        if (kind === 'fibext' || kind === 'fibtrendext') {
            const [p0, p1, p2] = drawing.points;
            if (!p2) return null;
            const ratios = drawing.fibLevels?.length ? drawing.fibLevels : kind === 'fibext' ? FIB_EXT_RATIOS : FIB_TREND_EXT_RATIOS;
            const levels = fibExtension(p0, p1, p2, ratios);
            const fallbackY = priceYFrom(p0, p1, screen[0], screen[1]);
            const left = Math.min(screen[0].x, screen[1].x);
            const right = Math.max(screen[0].x, screen[1].x, edgeX);
            let lastLabelY: number | null = null;
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {levels.map(({ ratio, price }) => {
                        const y = toScreen({ time: p2.time, price })?.y ?? fallbackY?.(price) ?? null;
                        if (y == null) return null;
                        const stacked = lastLabelY != null && Math.abs(y - lastLabelY) < 13;
                        if (!stacked) lastLabelY = y;
                        return (
                            <g key={`${drawing.id}-x${ratio}`}>
                                <line x1={left} x2={right} y1={y} y2={y} stroke={color} strokeWidth={1} strokeDasharray="5 4" opacity={opacity} />
                                {!stacked && (
                                    <text x={right - 4} y={y - 4} textAnchor="end" fontSize={10.5} className="mono" fill={color} opacity={opacity}>
                                        {`${ratio} (${price.toFixed(2)})`}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                    {dot(screen[2].x, screen[2].y, `${drawing.id}-c`, color, opacity, TEXT_DOT)}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'fibfan') {
            const fan = fibFanEnds(drawing.points[0], drawing.points[1]);
            // Every fan line ends on the vertical through the second point, so only its price has to
            // be turned into a pixel.
            const fallbackY = priceYFrom(drawing.points[0], drawing.points[1], screen[0], screen[1]);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {fan.map(({ ratio, end }) => {
                        const y = toScreen(end)?.y ?? fallbackY?.(end.price) ?? null;
                        if (y == null) return null;
                        return <line key={`${drawing.id}-f${ratio}`} x1={screen[0].x} y1={screen[0].y} x2={screen[1].x} y2={y} stroke={color} strokeWidth={1} opacity={opacity} />;
                    })}
                    {screen.map((point, i) => dot(point.x, point.y, `${drawing.id}-d${i}`, color, opacity, TEXT_DOT))}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'fibwedge') {
            const [p0, p1, p2] = drawing.points;
            if (!p2) return null;
            const lines = fibWedgeLines(p0, p1, p2);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <line x1={screen[0].x} y1={screen[0].y} x2={screen[1].x} y2={screen[1].y} stroke={color} strokeWidth={width} opacity={opacity} />
                    {lines.map(([, end], index) => {
                        const point = toScreen(end);
                        if (!point) return null;
                        return (
                            <line
                                key={`${drawing.id}-w${index}`}
                                x1={screen[2].x}
                                y1={screen[2].y}
                                x2={point.x}
                                y2={point.y}
                                stroke={color}
                                strokeWidth={1}
                                opacity={0.7}
                            />
                        );
                    })}
                    {screen.map((point, i) => dot(point.x, point.y, `${drawing.id}-d${i}`, color, opacity, TEXT_DOT))}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'fibchannel') {
            const levels = fibChannelLevels(drawing.points[0], drawing.points[1], drawing.points[2]);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {levels.map(([from, to], index) => {
                        const a = toScreen(from);
                        const b = toScreen(to);
                        if (!a || !b) return null;
                        return (
                            <line
                                key={`${drawing.id}-c${index}`}
                                x1={a.x}
                                y1={a.y}
                                x2={b.x}
                                y2={b.y}
                                stroke={color}
                                strokeWidth={index === 0 ? width : 1}
                                opacity={index === 0 ? opacity : 0.75}
                            />
                        );
                    })}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'fibtime') {
            // The zones sit past the move and are read in pixels: a time beyond the last bar cannot
            // be mapped by the chart's own scale, so the spacing comes from the two points' pixels.
            const span = screen[1].x - screen[0].x;
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {fibTimeMultiples(8).map((multiple) => {
                        const x = screen[1].x + span * multiple;
                        return <line key={`${drawing.id}-t${multiple}`} x1={x} x2={x} y1={0} y2={edgeY} stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={opacity} />;
                    })}
                    {dot(screen[0].x, screen[0].y, `${drawing.id}-a`, color, opacity, TEXT_DOT)}
                    {dot(screen[1].x, screen[1].y, `${drawing.id}-b`, color, opacity, TEXT_DOT)}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'fibarc') {
            const radii = fibArcRadii(screen[0], screen[1]);
            const centre = screen[2] ?? screen[1];
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {radii.map(({ ratio, rx, ry }) => (
                        <ellipse key={`${drawing.id}-a${ratio}`} cx={centre.x} cy={centre.y} rx={rx} ry={ry} fill="none" stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={opacity} />
                    ))}
                    {dot(centre.x, centre.y, `${drawing.id}-c`, color, opacity, TEXT_DOT)}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'fibspeed') {
            const [p0, p1] = drawing.points;
            if (!p1) return null;
            const edgeTime = edgeTimeAt(edgeX, p0, p1, screen[0], screen[1]);
            const ends = edgeTime == null ? [] : speedFanEnds(p0, p1, edgeTime);
            const fallbackY = priceYFrom(p0, p1, screen[0], screen[1]);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {ends.map(({ ratio, end }) => {
                        const y = priceY(p0.time, end.price) ?? fallbackY?.(end.price) ?? null;
                        if (y == null || !Number.isFinite(y)) return null;
                        return <line key={`${drawing.id}-s${ratio}`} x1={screen[0].x} y1={screen[0].y} x2={edgeX} y2={y} stroke={color} strokeWidth={1} opacity={opacity} />;
                    })}
                    {screen.map((point, i) => dot(point.x, point.y, `${drawing.id}-d${i}`, color, opacity, TEXT_DOT))}
                    {selectionHandles(screen)}
                </g>
            );
        }

        // --- geometric shapes ----------------------------------------------------
        // Drawn in pixels: an ellipse has to stay round, a circle a circle, and an arc is defined by
        // three points. Each helper returns what the SVG element wants, so these branches stay short.
        if (kind === 'ellipse' || kind === 'circle') {
            if (kind === 'circle') {
                const { cx, cy, r } = circleFrom(screen[0], screen[1]);
                return (
                    <g key={drawing.id} strokeDasharray={dash}>
                        <circle cx={cx} cy={cy} r={r} fill={fill} stroke={color} strokeWidth={width} opacity={opacity} />
                        {dot(cx, cy, `${drawing.id}-c`, color, opacity, TEXT_DOT)}
                        {selectionHandles(screen)}
                    </g>
                );
            }
            const { cx, cy, rx, ry } = ellipseFrom(screen[0], screen[1]);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} stroke={color} strokeWidth={width} opacity={opacity} />
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'tri') {
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <polygon
                        points={polygonPoints(screen)}
                        fill={fill}
                        stroke={color}
                        strokeWidth={width}
                        opacity={opacity}
                    />
                    {screen.map((point, i) => dot(point.x, point.y, `${drawing.id}-d${i}`, color, opacity, TEXT_DOT))}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'rotrect') {
            const corners = rotatedRectCorners(screen[0], screen[1], screen[2] ?? screen[1]);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <polygon points={polygonPoints(corners)} fill={fill} stroke={color} strokeWidth={width} opacity={opacity} />
                    {screen.map((point, i) => dot(point.x, point.y, `${drawing.id}-d${i}`, color, opacity, TEXT_DOT))}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'fibspiral') {
            const points = fibSpiralPoints(screen[0], screen[1]);
            if (points.length < 2) return null;
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <path d={polylinePath(points)} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" opacity={opacity} />
                    {dot(screen[0].x, screen[0].y, `${drawing.id}-c`, color, opacity, TEXT_DOT)}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'polyline') {
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <path d={polylinePath(screen)} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" opacity={opacity} />
                    {screen.map((point, i) => dot(point.x, point.y, `${drawing.id}-d${i}`, color, opacity, TEXT_DOT))}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'curve' || kind === 'dcurve') {
            const d =
                kind === 'curve'
                    ? quadraticPath(screen[0], screen[1], screen[2] ?? screen[1])
                    : doubleCurvePath(screen[0], screen[1], screen[2], screen[3] ?? screen[2]);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" opacity={opacity} />
                    {/* The points between the ends are handles, not corners. */}
                    {screen.map((point, i) => (
                        <rect
                            key={`${drawing.id}-h${i}`}
                            x={point.x - 3}
                            y={point.y - 3}
                            width={6}
                            height={6}
                            fill={i === 0 || i === screen.length - 1 ? color : 'none'}
                            stroke={color}
                            strokeWidth={1}
                            opacity={opacity}
                        />
                    ))}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'arc') {
            const arc = arcThrough(screen[0], screen[1], screen[2] ?? screen[1]);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {arc ? (
                        <path d={arc.path} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" opacity={opacity} />
                    ) : (
                        // Three points in a row have no circle: the straight line is the honest picture.
                        <line x1={screen[0].x} y1={screen[0].y} x2={screen[2]?.x ?? screen[0].x} y2={screen[2]?.y ?? screen[0].y} stroke={color} strokeWidth={width} opacity={opacity} />
                    )}
                    {screen.map((point, i) => dot(point.x, point.y, `${drawing.id}-d${i}`, color, opacity, TEXT_DOT))}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'brush' || kind === 'highlighter') {
            const marker = kind === 'highlighter';
            return (
                <g key={drawing.id}>
                    <path
                        d={polylinePath(screen)}
                        fill="none"
                        stroke={color}
                        // A highlighter marks rather than draws: wide, soft and see-through, so the
                        // candles it covers stay readable.
                        strokeWidth={marker ? Math.max(HIGHLIGHTER_WIDTH, width * 4) : width}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={marker ? 0.28 : opacity}
                        style={marker ? { mixBlendMode: 'screen' } : undefined}
                    />
                    {selectionHandles(screen)}
                </g>
            );
        }

        // --- annotations ---------------------------------------------------------
        // A callout and a balloon are the trader's words with a leader line; the price markers read
        // the price at the point they were placed on. A price note sits against the panel edge, the
        // way the chart's own last-price chip does.
        if (kind === 'callout' || kind === 'balloon' || kind === 'signpost' || kind === 'flag' || kind === 'pricenote') {
            const words = drawing.text ?? priceLabel(drawing.points[0].price);
            const font = 11.5;
            const padX = 6;
            const boxW = Math.max(34, words.length * font * 0.62 + padX * 2);
            const boxH = 20;
            const anchor = screen[0];
            if (kind === 'pricenote') {
                const x = edgeX - boxW - 2;
                return (
                    <g key={drawing.id} strokeDasharray={dash}>
                        <line x1={screen[0].x} y1={anchor.y} x2={x} y2={anchor.y} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />
                        <rect x={x} y={anchor.y - boxH / 2} width={boxW} height={boxH} rx={4} fill={color} opacity={0.9} />
                        <text x={x + boxW / 2} y={anchor.y + 4} textAnchor="middle" fontSize={font} className="mono" fill="#0b0b0b">
                            {words}
                        </text>
                        {selectionHandles(screen)}
                    </g>
                );
            }

            const at = kind === 'callout' || kind === 'balloon' ? screen[1] ?? screen[0] : { x: anchor.x + 12, y: anchor.y - 14 };
            const boxX = at.x;
            const boxY = at.y - boxH / 2;
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {/* The leader line, and the pin a signpost or a flag stands on. */}
                    {kind === 'signpost' ? (
                        <line x1={anchor.x} y1={anchor.y} x2={anchor.x} y2={boxY + boxH} stroke={color} strokeWidth={1.5} opacity={opacity} />
                    ) : (
                        <line x1={anchor.x} y1={anchor.y} x2={kind === 'flag' ? boxX : at.x} y2={kind === 'flag' ? boxY + boxH / 2 : at.y} stroke={color} strokeWidth={1} opacity={opacity} />
                    )}
                    {/* A callout points at the bar it belongs to; a balloon already reads as a speech bubble. */}
                    {kind === 'callout' && (
                        <polygon points={arrowHeadPoints(at, anchor, 9)} fill={color} opacity={opacity} />
                    )}
                    <rect
                        x={boxX}
                        y={boxY}
                        width={boxW}
                        height={boxH}
                        rx={kind === 'balloon' ? boxH / 2 : 4}
                        fill={kind === 'balloon' ? `color-mix(in oklab, ${color} 78%, transparent)` : `color-mix(in oklab, var(--card) 92%, transparent)`}
                        stroke={color}
                        strokeWidth={1}
                        opacity={opacity}
                    />
                    <text x={boxX + padX} y={boxY + boxH / 2 + 4} fontSize={font} className="mono" fill={kind === 'balloon' ? '#0b0b0b' : color} opacity={opacity}>
                        {words}
                    </text>
                    {dot(anchor.x, anchor.y, `${drawing.id}-a`, color, opacity, TEXT_DOT)}
                    {selectionHandles(screen)}
                </g>
            );
        }

        // --- Gann, pitchforks and the measured channels ---------------------------
        // Gann measures the clicked trend against itself, a pitchfork measures the retracement that
        // followed it, and the regression channel is fitted to the candles on screen. The maths is in
        // lib/chart-drawings; here the lines are only placed.
        if (kind === 'gannsquarefixed') {
            // The side is fixed, so the square reads the same at every price; the second point only
            // chooses which quadrant it grows into.
            const corner = gannSquareFixedCorner(screen[0], screen[1]);
            const side = GANN_SQUARE_FIXED_SIDE;
            const x0 = Math.min(screen[0].x, corner.x);
            const y0 = Math.min(screen[0].y, corner.y);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <rect x={x0} y={y0} width={side} height={side} fill="none" stroke={color} strokeWidth={width} opacity={opacity} />
                    <line x1={x0} y1={y0} x2={x0 + side} y2={y0 + side} stroke={color} strokeWidth={1} opacity={0.7} />
                    <line x1={x0} y1={y0 + side} x2={x0 + side} y2={y0} stroke={color} strokeWidth={1} opacity={0.7} />
                    <line x1={x0 + side / 2} y1={y0} x2={x0 + side / 2} y2={y0 + side} stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
                    <line x1={x0} y1={y0 + side / 2} x2={x0 + side} y2={y0 + side / 2} stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'gannfan' || kind === 'gannbox' || kind === 'gannsquare') {
            const [p0, p1] = drawing.points;
            if (!p1) return null;
            const edgeTime = edgeTimeAt(edgeX, p0, p1, screen[0], screen[1]);
            const fromPrices = priceYFrom(p0, p1, screen[0], screen[1]);
            const fan = edgeTime == null ? [] : gannFanEnds(p0, p1, edgeTime);
            const fanLines = fan.map(({ ratio, end }) => {
                const y = priceY(p0.time, end.price) ?? fromPrices?.(end.price) ?? null;
                if (y == null || !Number.isFinite(y)) return null;
                return (
                    <line
                        key={`${drawing.id}-g${ratio}`}
                        x1={screen[0].x}
                        y1={screen[0].y}
                        x2={edgeX}
                        y2={y}
                        stroke={color}
                        strokeWidth={ratio === 1 ? width : 1}
                        opacity={ratio === 1 ? opacity : 0.5}
                    />
                );
            });

            if (kind === 'gannfan') {
                return (
                    <g key={drawing.id} strokeDasharray={dash}>
                        {fanLines}
                        {screen.map((point, i) => dot(point.x, point.y, `${drawing.id}-d${i}`, color, opacity, TEXT_DOT))}
                        {selectionHandles(screen)}
                    </g>
                );
            }

            if (kind === 'gannbox') {
                const guides = gannBoxGuides(p0, p1);
                const tl = toScreen(guides.corners[0]);
                const br = toScreen(guides.corners[1]);
                if (!tl || !br) return null;
                const top = Math.min(tl.y, br.y);
                const left = Math.min(tl.x, br.x);
                return (
                    <g key={drawing.id} strokeDasharray={dash}>
                        <rect x={left} y={top} width={Math.abs(br.x - tl.x)} height={Math.abs(br.y - tl.y)} fill="none" stroke={color} strokeWidth={width} opacity={opacity} />
                        <line x1={left} y1={top} x2={left + Math.abs(br.x - tl.x)} y2={top + Math.abs(br.y - tl.y)} stroke={color} strokeWidth={1} opacity={0.7} />
                        <line x1={left} y1={top + Math.abs(br.y - tl.y)} x2={left + Math.abs(br.x - tl.x)} y2={top} stroke={color} strokeWidth={1} opacity={0.7} />
                        {fanLines}
                        {selectionHandles(screen)}
                    </g>
                );
            }

            // A Gann square is square in pixels, which only the painter can know.
            const corner = gannSquareCorner(screen[0], screen[1]);
            const side = Math.abs(corner.x - screen[0].x);
            const x0 = Math.min(screen[0].x, corner.x);
            const y0 = Math.min(screen[0].y, corner.y);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <rect x={x0} y={y0} width={side} height={side} fill="none" stroke={color} strokeWidth={width} opacity={opacity} />
                    <line x1={x0} y1={y0} x2={x0 + side} y2={y0 + side} stroke={color} strokeWidth={1} opacity={0.7} />
                    <line x1={x0} y1={y0 + side} x2={x0 + side} y2={y0} stroke={color} strokeWidth={1} opacity={0.7} />
                    <line x1={x0 + side / 2} y1={y0} x2={x0 + side / 2} y2={y0 + side} stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
                    <line x1={x0} y1={y0 + side / 2} x2={x0 + side} y2={y0 + side / 2} stroke={color} strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
                    {fanLines}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'pitchfork' || kind === 'schiffpitchfork' || kind === 'modpitchfork' || kind === 'insidepitchfork') {
            const [p0, p1, p2] = drawing.points;
            if (!p2) return null;
            const variant = kind === 'pitchfork' ? 'andrews' : kind === 'schiffpitchfork' ? 'schiff' : kind === 'modpitchfork' ? 'modified' : 'inside';
            const lines = pitchforkLines(p0, p1, p2, variant);
            // Each rail starts where its own point is and runs to the panel's edge.
            const rail = (pair: [DrawPoint, DrawPoint], key: string, weight: number, alpha: number) => {
                const from = toScreen(pair[0]);
                const to = toScreen(pair[1]);
                if (!from || !to) return null;
                const dx = to.x - from.x;
                const y = Math.abs(dx) > 0.5 ? from.y + ((to.y - from.y) / dx) * (edgeX - from.x) : from.y;
                return <line key={key} x1={from.x} y1={from.y} x2={edgeX} y2={y} stroke={color} strokeWidth={weight} strokeDasharray={weight === 1 ? '6 4' : undefined} opacity={alpha} />;
            };
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {rail(lines.median, `${drawing.id}-m`, width, opacity)}
                    {rail(lines.upper, `${drawing.id}-u`, 1, 0.7)}
                    {rail(lines.lower, `${drawing.id}-l`, 1, 0.7)}
                    {screen.map((point, i) => dot(point.x, point.y, `${drawing.id}-d${i}`, color, opacity, TEXT_DOT))}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'regression') {
            const [p0, p1] = drawing.points;
            if (!p1) return null;
            const channel = regressionChannel(p0, p1, candles);
            const at = (point: DrawPoint) => toScreen({ time: point.time, price: point.price });
            const line = channel.line.map(at);
            const upper = channel.upper.map(at);
            const lower = channel.lower.map(at);
            if ([...line, ...upper, ...lower].some((point) => point == null)) return null;
            const [l0, l1] = line as ScreenPoint[];
            const [u0, u1] = upper as ScreenPoint[];
            const [d0, d1] = lower as ScreenPoint[];
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <polygon points={`${u0.x},${u0.y} ${u1.x},${u1.y} ${d1.x},${d1.y} ${d0.x},${d0.y}`} fill={`color-mix(in oklab, ${color} 10%, transparent)`} stroke="none" />
                    <line x1={u0.x} y1={u0.y} x2={u1.x} y2={u1.y} stroke={color} strokeWidth={1} strokeDasharray="5 4" opacity={0.7} />
                    <line x1={d0.x} y1={d0.y} x2={d1.x} y2={d1.y} stroke={color} strokeWidth={1} strokeDasharray="5 4" opacity={0.7} />
                    <line x1={l0.x} y1={l0.y} x2={l1.x} y2={l1.y} stroke={color} strokeWidth={width} opacity={opacity} />
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'flattop') {
            const [p0, p1] = drawing.points;
            if (!p1) return null;
            const { top, bottom } = flattenLines(p0, p1);
            const rails = [top, bottom].map((pair, index) => {
                const from = toScreen(pair[0]);
                const to = toScreen(pair[1]);
                if (!from || !to) return null;
                const y = from.y;
                return <line key={`${drawing.id}-f${index}`} x1={Math.min(from.x, to.x)} y1={y} x2={edgeX} y2={y} stroke={color} strokeWidth={width} opacity={index === 0 ? opacity : 0.7} />;
            });
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {rails}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'disjoint') {
            const [p0, p1, p2] = drawing.points;
            if (!p2) return null;
            const channel = disjointChannel(p0, p1, p2);
            const pair = (points: [DrawPoint, DrawPoint], key: string, weight: number) => {
                const from = toScreen(points[0]);
                const to = toScreen(points[1]);
                if (!from || !to) return null;
                return <line key={key} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={weight} opacity={opacity} />;
            };
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {pair(channel.base, `${drawing.id}-b`, width)}
                    {pair(channel.parallel, `${drawing.id}-p`, width)}
                    {screen.map((point, i) => dot(point.x, point.y, `${drawing.id}-d${i}`, color, opacity, TEXT_DOT))}
                    {selectionHandles(screen)}
                </g>
            );
        }

        // --- the exotics ---------------------------------------------------------
        // A sticker is a glyph; an image is a web picture the trader pasted by its address. The three
        // volume tools read the candles themselves (lib/chart-drawings does the counting): a bars
        // pattern copies the shape of a range forward, a VWAP averages it, and a profile counts it
        // into price rows.
        if (kind === 'icon') {
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    <text x={screen[0].x} y={screen[0].y + 8} textAnchor="middle" fontSize={22} fill={color} opacity={opacity}>
                        {drawing.text ?? ICON_GLYPHS[0]}
                    </text>
                    {dot(screen[0].x, screen[0].y, `${drawing.id}-p`, color, 0.55, TEXT_DOT)}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'image') {
            if (screen.length < 2) return null;
            const x = Math.min(screen[0].x, screen[1].x);
            const y = Math.min(screen[0].y, screen[1].y);
            const w = Math.abs(screen[1].x - screen[0].x);
            const h = Math.abs(screen[1].y - screen[0].y);
            const url = (drawing.text ?? '').trim();
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {isImageUrl(url) ? (
                        <image href={url} x={x} y={y} width={w} height={h} preserveAspectRatio="none" opacity={opacity} />
                    ) : (
                        // Nothing to show until an address is pasted: a frame says where the picture goes.
                        <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={11.5} fill={color} opacity={0.8}>
                            {label('chart.imagePlaceholder')}
                        </text>
                    )}
                    <rect x={x} y={y} width={w} height={h} fill="none" stroke={color} strokeWidth={1} opacity={0.7} />
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'avwap') {
            // toScreen wants a chart point; a VWAP point is a time and a value, which is the same shape.
            const bands = anchoredVwapBands(candles, drawing.points[0].time);
            const project = (pick: (point: (typeof bands)[number]) => number) =>
                bands
                    .map((point) => toScreen({ time: point.time, price: pick(point) }))
                    .filter((point): point is ScreenPoint => point != null);
            const line = project((point) => point.value);
            const upper1 = project((point) => point.upper1);
            const lower1 = project((point) => point.lower1);
            const upper2 = project((point) => point.upper2);
            const lower2 = project((point) => point.lower2);
            const path = (points: ScreenPoint[]) => (points.length > 1 ? polylinePath(points) : null);
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {/* The second band is the outer edge: faint, so it frames without shouting. */}
                    {path(upper2) && <path d={path(upper2)!} fill="none" stroke={color} strokeWidth={1} opacity={opacity * 0.35} />}
                    {path(lower2) && <path d={path(lower2)!} fill="none" stroke={color} strokeWidth={1} opacity={opacity * 0.35} />}
                    {path(upper1) && <path d={path(upper1)!} fill="none" stroke={color} strokeWidth={1} opacity={opacity * 0.6} strokeDasharray="4 3" />}
                    {path(lower1) && <path d={path(lower1)!} fill="none" stroke={color} strokeWidth={1} opacity={opacity * 0.6} strokeDasharray="4 3" />}
                    {path(line) && <path d={path(line)!} fill="none" stroke={color} strokeWidth={width} opacity={opacity} />}
                    {dot(screen[0].x, screen[0].y, `${drawing.id}-p`, color, opacity, TEXT_DOT)}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'vprofile') {
            if (screen.length < 2) return null;
            const profile = volumeProfile(candles, drawing.points[0].time, drawing.points[1].time);
            if (profile.rows.length === 0) return null;
            const left = Math.min(screen[0].x, screen[1].x);
            const span = Math.max(24, Math.abs(screen[1].x - screen[0].x));
            const stepY = (price: number) => priceY(drawing.points[0].time, price);
            const rowH = Math.max(1, Math.abs((stepY(profile.rows[0].price) ?? 0) - (stepY(profile.rows[0].price + profile.step) ?? 0)));
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {/* The range itself, faintly shaded, the way a profile marks what it counted. */}
                    <rect x={left} y={Math.min(screen[0].y, screen[1].y)} width={span} height={Math.abs(screen[1].y - screen[0].y)} fill={`color-mix(in oklab, ${color} 7%, transparent)`} stroke="none" />
                    {profile.rows.map((row) => {
                        const y = stepY(row.price);
                        if (y == null || row.volume <= 0) return null;
                        const barWidth = (row.volume / profile.max) * span;
                        const isPoc = row.volume === profile.max;
                        return (
                            <rect
                                key={`${drawing.id}-r${row.price}`}
                                x={left}
                                y={y - rowH / 2}
                                width={barWidth}
                                height={rowH}
                                fill={color}
                                opacity={isPoc ? 0.55 : 0.28}
                            />
                        );
                    })}
                    {/* The value area: the band holding 70% of the range's volume, marked by two
                        rules so a trader can see where the market accepted price. */}
                    {profile.valueArea && (() => {
                        const top = stepY(profile.valueArea.high);
                        const bottom = stepY(profile.valueArea.low);
                        if (top == null || bottom == null) return null;
                        return (
                            <g>
                                <rect
                                    x={left}
                                    y={Math.min(top, bottom)}
                                    width={span}
                                    height={Math.abs(bottom - top)}
                                    fill={`color-mix(in oklab, ${color} 10%, transparent)`}
                                    stroke="none"
                                />
                                <line x1={left} y1={top} x2={left + span} y2={top} stroke={color} strokeWidth={1} opacity={0.7} strokeDasharray="3 3" />
                                <line x1={left} y1={bottom} x2={left + span} y2={bottom} stroke={color} strokeWidth={1} opacity={0.7} strokeDasharray="3 3" />
                            </g>
                        );
                    })()}
                    {/* The row that traded most: the point of control, with its price. */}
                    {(() => {
                        const poc = profile.poc;
                        const y = poc != null ? stepY(poc) : null;
                        if (poc == null || y == null) return null;
                        return (
                            <text x={left + span + 4} y={y + 4} fontSize={10.5} className="mono" fill={color}>
                                {priceLabel(poc)}
                            </text>
                        );
                    })()}
                    {selectionHandles(screen)}
                </g>
            );
        }

        if (kind === 'bars') {
            if (screen.length < 3) return null;
            const source = candlesBetween(candles, drawing.points[0].time, drawing.points[1].time);
            if (source.length < 2) return null;
            const anchor = screen[2];
            const first = toScreen({ time: source[0].time, price: source[0].open });
            if (!first) return null;
            const shiftX = anchor.x - first.x;
            const shiftY = anchor.y - first.y;
            // The bar width comes from the spacing of the range that was copied.
            const second = toScreen({ time: source[1].time, price: source[1].open });
            const candleW = second ? Math.max(1, Math.min(14, Math.abs(second.x - first.x) * 0.62)) : 5;
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {source.map((candle) => {
                        const high = toScreen({ time: candle.time, price: candle.high });
                        const low = toScreen({ time: candle.time, price: candle.low });
                        const open = toScreen({ time: candle.time, price: candle.open });
                        const close = toScreen({ time: candle.time, price: candle.close });
                        if (!high || !low || !open || !close) return null;
                        const x = high.x + shiftX;
                        const bodyTop = Math.min(open.y, close.y) + shiftY;
                        const bodyBottom = Math.max(open.y, close.y) + shiftY;
                        const up = candle.close >= candle.open;
                        return (
                            <g key={`${drawing.id}-b${candle.time}`}>
                                <line x1={x} y1={high.y + shiftY} x2={x} y2={low.y + shiftY} stroke={color} strokeWidth={1} opacity={opacity} />
                                <rect
                                    x={x - candleW / 2}
                                    y={bodyTop}
                                    width={candleW}
                                    height={Math.max(1, bodyBottom - bodyTop)}
                                    fill={up ? color : 'transparent'}
                                    stroke={color}
                                    strokeWidth={1}
                                    opacity={up ? 0.75 : opacity}
                                />
                            </g>
                        );
                    })}
                    {screen.map((point, i) => dot(point.x, point.y, `${drawing.id}-d${i}`, color, 0.6, TEXT_DOT))}
                    {selectionHandles(screen)}
                </g>
            );
        }

        // trend: a segment between its two points, lengthened to the panel edge when the trader asked
        // for it. The extension is screen arithmetic (lib/chart-drawings), so it reaches the edge even
        // where the time scale has run out of bars.
        const [segmentFrom, segmentTo] = drawing.extend
            ? extendSegment(screen[0], screen[1], drawing.extend, 0, edgeX)
            : [screen[0], screen[1]];
        return (
            <g key={drawing.id} strokeDasharray={dash}>
                <line x1={segmentFrom.x} y1={segmentFrom.y} x2={segmentTo.x} y2={segmentTo.y} stroke={color} strokeWidth={width} opacity={opacity} />
                {selected && !locked &&
                    screen.map((point, i) => <rect key={`h${i}`} x={point.x - HANDLE} y={point.y - HANDLE} width={HANDLE * 2} height={HANDLE * 2} fill={color} />)}
            </g>
        );
    };

    // While an open-ended stroke is being drawn, the line so far follows the pointer: without it a
    // polyline of ten points would be ten dots and no line.
    const draftPath = (() => {
        if (shapeTool == null || pointsNeeded(shapeTool) !== 0) return null;
        const points = [...draft, ...(preview ? [preview] : [])]
            .map((point) => toScreen(point))
            .filter((point): point is ScreenPoint => point != null);
        return points.length >= 2 ? polylinePath(points) : null;
    })();
    const lastDraftAt = draft.length > 0 ? toScreen(draft[draft.length - 1]) : null;
    // A stroke ends when the button is released, so only a click-driven tool asks for a double click.
    const draftHint = draftPath && draft.length >= 2 && shapeTool != null && !isFreehand(shapeTool) ? label('chart.tool.finish') : null;

    // The note editor sits over the chart at the note's own position, as the interface promised.
    const editorTarget = editing ? drawings.find((drawing) => drawing.id === editing.id) : null;
    const editorAt = editorTarget ? toScreen(editorTarget.points[0]) : null;

    return (
        <>
            <svg
                ref={svgRef}
                className="absolute inset-0 z-10 size-full"
                style={{ pointerEvents: interactive ? 'auto' : 'none', cursor: interactive ? 'crosshair' : 'default' }}
                onPointerDown={onPointerDown}
                onContextMenu={onContextMenuEvent}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onDoubleClick={onDoubleClick}
                onKeyDown={onKeyDown}
                tabIndex={0}
                role="application"
                aria-label={label('chart.canvas')}
            >
                {shapes.map((drawing) => shapeFor(drawing))}
                {tool === 'measure' && measureBox}
                {draftPath && <path d={draftPath} fill="none" stroke="var(--brand)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />}
                {draftPath && draft.length >= 2 && lastDraftAt && draftHint && (
                    <text x={lastDraftAt.x + 8} y={lastDraftAt.y - 8} fontSize={11} className="mono" fill="var(--brand)" opacity={0.9}>
                        {draftHint}
                    </text>
                )}
                {/* Dots already placed, while a multi-click shape is being drawn. */}
                {draft.map((point, i) => {
                    const spot = toScreen(point);
                    return spot ? dot(spot.x, spot.y, `draft-${i}`, 'var(--brand)', 0.8) : null;
                })}
            </svg>

            {tool === 'measure' && measureChip}

            {editing && editorAt && (() => {
                // A table is edited as a grid, so it gets a multiline box and one line per row; every
                // other note stays the single line it always was.
                const isTable = editorTarget?.tool === 'table';
                return (
                    <div className="absolute z-20 flex flex-col gap-1" style={{ left: editorAt.x + 6, top: editorAt.y - 12 }}>
                        <div className="flex items-center gap-1">
                            {isTable ? (
                                <textarea
                                    ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>}
                                    value={editing.value}
                                    maxLength={TABLE_MAX}
                                    rows={3}
                                    onChange={(event) => setEditing({ id: editing.id, value: event.target.value })}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Escape') setEditing(null);
                                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) saveEdit();
                                    }}
                                    className="h-20 w-52 rounded-[10px] bg-page px-2 py-1 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    dir="auto"
                                    aria-label={label('chart.editText')}
                                />
                            ) : (
                                <input
                                    ref={inputRef}
                                    value={editing.value}
                                    maxLength={80}
                                    onChange={(event) => setEditing({ id: editing.id, value: event.target.value })}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') saveEdit();
                                        if (event.key === 'Escape') setEditing(null);
                                    }}
                                    className="h-6 w-40 rounded-full bg-page px-2 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    dir="auto"
                                    aria-label={label('chart.editText')}
                                />
                            )}
                            <button type="button" onClick={saveEdit} className="pill h-6 px-2 text-[11px] is-up">
                                {label('chart.save')}
                            </button>
                            <button type="button" onClick={() => setEditing(null)} className="pill h-6 px-2 text-[11px]">
                                {label('chart.cancel')}
                            </button>
                        </div>
                        {isTable && <p className="rounded bg-page/85 px-2 py-0.5 text-[10.5px] text-faint shadow-[inset_0_0_0_1px_var(--line)]">{label('chart.tool.tableHint')}</p>}
                    </div>
                );
            })()}

            {/* How many clicks are still expected, so a five-point pattern is not a guessing game. */}
            {tool && tool !== 'select' && tool !== 'measure' && pointsNeeded(tool) > 1 && (
                <div className="absolute bottom-2 left-2 z-20 rounded-full bg-page/85 px-2.5 py-1 text-[11.5px] text-faint shadow-[inset_0_0_0_1px_var(--line)]">
                    {label('chart.clicks')} {draft.length + 1}/{pointsNeeded(tool)}
                </div>
            )}
        </>
    );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import {
    cleanText,
    cycleIndices,
    drawingColor,
    fibLevels,
    gannGuides,
    arrowHeadPoints,
    channelRails,
    dashOf,
    handleIndex,
    measureSpan,
    hitTest,
    labelsFor,
    nearestTime,
    newDrawingId,
    strokeWidthOf,
    pointsNeeded,
    sinePoints,
    toolDef,
    type DrawPoint,
    type Drawing,
    type ScreenPoint,
    type ShapeTool,
} from '@/lib/chart-drawings';
import type { StringKey } from '@/lib/i18n';

export type ActiveTool = ShapeTool | 'select' | 'measure';

type Props = {
    drawings: Drawing[];
    selectedId: string | null;
    tool: ActiveTool | null;
    /** Filled in when the note tool places a label. */
    text: string;
    /** Glyphs for the shape being placed, when the tool's default is not what the user asked for. */
    labels?: string[] | null;
    /** Asks the component to open the editor on a note (from the drawings list). */
    editRequest?: { id: string; nonce: number } | null;
    /** Bar times of the interval on screen, so a cycle can land on real bars. */
    barTimes: number[];
    /** Chart pixels for a drawing point, or null when the chart is not ready or the point is off screen. */
    toScreen: (point: DrawPoint) => ScreenPoint | null;
    /** The inverse, so a pointer position can be stored as a chart point. */
    fromScreen: (x: number, y: number) => DrawPoint | null;
    onCommit: (drawing: Drawing) => void;
    onSelect: (id: string | null) => void;
    onMoveHandle: (id: string, index: number, point: DrawPoint) => void;
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
    label: (key: StringKey) => string;
};

const HANDLE = 5;
const GRAB = 9;
const TEXT_DOT = 3;

// An SVG layer over the chart. It only takes pointer events while a tool is active, so panning and
// zooming the chart underneath keep working exactly as they do without drawings.
export default function ChartDrawings({
    drawings,
    selectedId,
    tool,
    text,
    labels,
    editRequest,
    barTimes,
    toScreen,
    fromScreen,
    onCommit,
    onSelect,
    onMoveHandle,
    onGestureStart,
    onGestureEnd,
    snapPoint,
    onEditText,
    onToolConsumed,
    label,
}: Props) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [draft, setDraft] = useState<DrawPoint[]>([]);
    const [preview, setPreview] = useState<DrawPoint | null>(null);
    const [dragging, setDragging] = useState<{ id: string; index: number } | null>(null);
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
    const editNonce = editRequest?.nonce ?? 0;
    useEffect(() => {
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
    }, [tool]);

    // Drawings stay on screen when no tool is armed; only the pointer capture is switched off, so the
    // chart underneath keeps panning and zooming normally.
    const interactive = Boolean(tool);

    const screenOf = (drawing: Drawing): ScreenPoint[] => drawing.points.map((point) => toScreen(point) ?? { x: NaN, y: NaN });
    const usable = (points: ScreenPoint[]) => (points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ? points : []);

    const cursorOf = (event: React.PointerEvent): ScreenPoint => {
        const rect = svgRef.current?.getBoundingClientRect();
        return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
    };

    const onPointerDown = (event: React.PointerEvent) => {
        if (!tool) return;
        const cursor = cursorOf(event);
        if (tool === 'measure') {
            const point = fromScreen(cursor.x, cursor.y);
            if (point) setMeasure({ from: point, to: point });
            return;
        }
        const drawn = drawings.map(screenOf);
        const drawable = drawings.map((_, i) => usable(drawn[i]));

        if (tool === 'select') {
            const selectedIndex = drawings.findIndex((drawing) => drawing.id === selectedId);
            if (selectedIndex !== -1 && !drawings[selectedIndex].locked) {
                const grabbed = handleIndex(drawn[selectedIndex], cursor, GRAB);
                if (grabbed !== null) {
                    onGestureStart();
                    setDragging({ id: drawings[selectedIndex].id, index: grabbed });
                    return;
                }
            }
            setEditing(null);
            onSelect(hitTest(drawings, drawable, cursor, GRAB)?.id ?? null);
            return;
        }

        const raw = fromScreen(cursor.x, cursor.y);
        if (!raw) return;
        const point = snapPoint ? snapPoint(raw) : raw;
        // One-point tools (a level, a note) commit straight away; the rest collect clicks.
        if (pointsNeeded(tool) === 1) {
            onCommit({
                id: newDrawingId(),
                tool,
                points: [point],
                ...(tool === 'text' ? { text: cleanText(text) ?? '—' } : {}),
            });
            onToolConsumed();
            return;
        }
        const next = [...draft, point];
        if (next.length < pointsNeeded(tool)) {
            setDraft(next);
            return;
        }
        const glyphs = labels ?? toolDef(tool).pointLabels;
        onCommit({
            id: newDrawingId(),
            tool,
            points: next,
            ...(glyphs ? { labels: glyphs } : {}),
        });
        setDraft([]);
        setPreview(null);
        onToolConsumed();
    };

    const onPointerMove = (event: React.PointerEvent) => {
        const cursor = cursorOf(event);
        if (tool === 'measure' && measure) {
            const point = fromScreen(cursor.x, cursor.y);
            if (point) setMeasure({ from: measure.from, to: point });
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
        if (dragging) onGestureEnd();
        setDragging(null);
    };
    // Rewriting a note is a double click: a single click on its dot has to stay free for dragging it.
    const onDoubleClick = (event: React.MouseEvent) => {
        if (tool !== 'select') return;
        const rect = svgRef.current?.getBoundingClientRect();
        const cursor = { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
        const hit = hitTest(drawings, drawings.map((drawing) => usable(screenOf(drawing))), cursor, GRAB);
        if (hit && hit.tool === 'text') setEditing({ id: hit.id, value: hit.text ?? '' });
    };
    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        setMeasure(null);
        setDraft([]);
        setPreview(null);
        setDragging(null);
        setEditing(null);
        onSelect(null);
    };

    const saveEdit = () => {
        if (!editing) return;
        onEditText(editing.id, editing.value);
        setEditing(null);
    };

    // The measure box: a rectangle between the two points with what it measures beside it.
    const measureBox = (() => {
        if (!measure) return null;
        const a = toScreen(measure.from);
        const b = toScreen(measure.to);
        if (!a || !b) return null;
        const price = measure.to.price - measure.from.price;
        const percent = measure.from.price === 0 ? 0 : (price / measure.from.price) * 100;
        const seconds = Math.abs(measure.to.time - measure.from.time);
        const days = seconds / 86400;
        const span = days >= 1 ? `${days.toFixed(1)}D` : `${(seconds / 3600).toFixed(1)}H`;
        const tone = price >= 0 ? '#26A69A' : '#EF5350';
        const label = `${price >= 0 ? '+' : '−'}${Math.abs(price).toFixed(2)} (${percent >= 0 ? '+' : '−'}${Math.abs(percent).toFixed(2)}%) · ${span}`;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        return (
            <g key="measure">
                <rect
                    x={x}
                    y={y}
                    width={Math.abs(b.x - a.x)}
                    height={Math.abs(b.y - a.y)}
                    fill={`color-mix(in oklab, ${tone} 16%, transparent)`}
                    stroke={tone}
                    strokeWidth={1.4}
                />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={tone} strokeWidth={1.2} strokeDasharray="4 3" />
                <text
                    x={b.x + 8}
                    y={b.y - 8}
                    fontSize={12}
                    className="mono"
                    fill={tone}
                    style={{ paintOrder: 'stroke', stroke: 'black', strokeWidth: 3 }}
                >
                    {label}
                </text>
            </g>
        );
    })();

    // Everything stored, plus the shape being drawn right now.
    const shapes: Drawing[] = draft.length > 0 && preview && tool && tool !== 'select'
        ? [...drawings, { id: 'draft', tool: tool as ShapeTool, points: [...draft, preview], labels: labels ?? toolDef(tool as ShapeTool).pointLabels }]
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
        const selected = drawing.id === selectedId;
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
                    {fibLevels(drawing.points[0], drawing.points[1]).map(({ ratio, price }) => {
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
            return (
                <g key={drawing.id} strokeDasharray={dash}>
                    {dot(screen[0].x, screen[0].y, `${drawing.id}-p`, color, opacity, TEXT_DOT)}
                    <text x={screen[0].x + 8} y={screen[0].y + 4} fill={color} fontSize={12} opacity={opacity} className="mono">
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
                        fill={`color-mix(in oklab, ${color} 12%, transparent)`}
                        stroke={color}
                        strokeWidth={width}
                        opacity={opacity}
                    />
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
                        fill={`color-mix(in oklab, ${color} 10%, transparent)`}
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
                        fill={`color-mix(in oklab, ${color} 12%, transparent)`}
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

        // trend: a segment between its two points
        return (
            <g key={drawing.id} strokeDasharray={dash}>
                <line x1={screen[0].x} y1={screen[0].y} x2={screen[1].x} y2={screen[1].y} stroke={color} strokeWidth={width} opacity={opacity} />
                {selected && !locked &&
                    screen.map((point, i) => <rect key={`h${i}`} x={point.x - HANDLE} y={point.y - HANDLE} width={HANDLE * 2} height={HANDLE * 2} fill={color} />)}
            </g>
        );
    };

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
                {/* Dots already placed, while a multi-click shape is being drawn. */}
                {draft.map((point, i) => {
                    const spot = toScreen(point);
                    return spot ? dot(spot.x, spot.y, `draft-${i}`, 'var(--brand)', 0.8) : null;
                })}
            </svg>

            {editing && editorAt && (
                <div className="absolute z-20 flex items-center gap-1" style={{ left: editorAt.x + 6, top: editorAt.y - 12 }}>
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
                    <button type="button" onClick={saveEdit} className="pill h-6 px-2 text-[11px] is-up">
                        {label('chart.save')}
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="pill h-6 px-2 text-[11px]">
                        {label('chart.cancel')}
                    </button>
                </div>
            )}

            {/* How many clicks are still expected, so a five-point pattern is not a guessing game. */}
            {tool && tool !== 'select' && tool !== 'measure' && pointsNeeded(tool) > 1 && (
                <div className="absolute bottom-2 left-2 z-20 rounded-full bg-page/85 px-2.5 py-1 text-[11.5px] text-faint shadow-[inset_0_0_0_1px_var(--line)]">
                    {label('chart.clicks')} {draft.length + 1}/{pointsNeeded(tool)}
                </div>
            )}
        </>
    );
}

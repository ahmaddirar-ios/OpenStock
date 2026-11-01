'use client';

import { useRef, useState } from 'react';
import {
    fibPrices,
    handleIndex,
    hitTest,
    newDrawingId,
    pointsNeeded,
    type DrawPoint,
    type Drawing,
    type DrawingTool,
    type ScreenPoint,
} from '@/lib/chart-drawings';
import type { StringKey } from '@/lib/i18n';

export type ActiveTool = DrawingTool | 'select';

type Props = {
    drawings: Drawing[];
    selectedId: string | null;
    tool: ActiveTool | null;
    /** Filled in when the label tool places a note. */
    text: string;
    /** Chart pixels for a drawing point, or null when the chart is not ready or the point is off screen. */
    toScreen: (point: DrawPoint) => ScreenPoint | null;
    /** The inverse, so a pointer position can be stored as a chart point. */
    fromScreen: (x: number, y: number) => DrawPoint | null;
    onCommit: (drawing: Drawing) => void;
    onSelect: (id: string | null) => void;
    onMoveHandle: (id: string, index: number, point: DrawPoint) => void;
    /** Called once a drawing is finished, so the toolbar can drop the tool. */
    onToolConsumed: () => void;
    label: (key: StringKey) => string;
};

const HANDLE = 5;
const GRAB = 9;

// An SVG layer over the chart. It only takes pointer events while a tool is active, so panning and
// zooming the chart underneath keep working exactly as they do without drawings.
export default function ChartDrawings({
    drawings,
    selectedId,
    tool,
    text,
    toScreen,
    fromScreen,
    onCommit,
    onSelect,
    onMoveHandle,
    onToolConsumed,
    label,
}: Props) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [draft, setDraft] = useState<DrawPoint[]>([]);
    const [preview, setPreview] = useState<DrawPoint | null>(null);
    const [dragging, setDragging] = useState<{ id: string; index: number } | null>(null);

    // Drawings stay on screen when no tool is armed; only the pointer capture is switched off, so the
    // chart underneath keeps panning and zooming normally.
    const interactive = Boolean(tool);

    const cursorOf = (event: React.PointerEvent): ScreenPoint => {
        const rect = svgRef.current?.getBoundingClientRect();
        return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
    };

    const onPointerDown = (event: React.PointerEvent) => {
        if (!tool) return;
        const cursor = cursorOf(event);
        const drawn = drawings.map((drawing) => drawing.points.map((point) => toScreen(point) ?? null) as ScreenPoint[]);
        const usable = drawings.map((drawing, i) => (drawn[i].every(Boolean) ? drawn[i] : []));

        if (tool === 'select') {
            const selectedIndex = drawings.findIndex((drawing) => drawing.id === selectedId);
            if (selectedIndex !== -1) {
                const grabbed = handleIndex(drawn[selectedIndex], cursor, GRAB);
                if (grabbed !== null) {
                    setDragging({ id: drawings[selectedIndex].id, index: grabbed });
                    return;
                }
            }
            onSelect(hitTest(drawings, usable, cursor, GRAB)?.id ?? null);
            return;
        }

        const point = fromScreen(cursor.x, cursor.y);
        if (!point) return;
        if (pointsNeeded(tool) === 1) {
            onCommit({ id: newDrawingId(), tool, points: [point], text: tool === 'text' ? text.trim() || '—' : undefined });
            onToolConsumed();
            return;
        }
        if (draft.length === 0) {
            setDraft([point]);
            setPreview(point);
            return;
        }
        onCommit({ id: newDrawingId(), tool, points: [draft[0], point] });
        setDraft([]);
        setPreview(null);
        onToolConsumed();
    };

    const onPointerMove = (event: React.PointerEvent) => {
        if (dragging) {
            const point = fromScreen(cursorOf(event).x, cursorOf(event).y);
            if (point) onMoveHandle(dragging.id, dragging.index, point);
            return;
        }
        if (draft.length === 1) setPreview(fromScreen(cursorOf(event).x, cursorOf(event).y));
    };

    const onPointerUp = () => setDragging(null);
    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        setDraft([]);
        setPreview(null);
        setDragging(null);
        onSelect(null);
    };

    // Shapes to draw: everything stored, plus the line being drawn right now.
    const shapes: Drawing[] = draft.length === 1 && preview && tool ? [...drawings, { id: 'draft', tool: tool as DrawingTool, points: [draft[0], preview] }] : drawings;

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 z-10 size-full"
            style={{ pointerEvents: interactive ? 'auto' : 'none', cursor: interactive ? 'crosshair' : 'default' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onKeyDown={onKeyDown}
            tabIndex={0}
            role="application"
            aria-label={label('chart.canvas')}
        >
            {shapes.map((drawing) => {
                const points = drawing.points.map((point) => toScreen(point));
                if (points.some((point) => !point)) return null;
                const screen = points as ScreenPoint[];
                const selected = drawing.id === selectedId;
                const stroke = selected ? 'var(--brand)' : 'var(--faint)';

                if (drawing.tool === 'text') {
                    return (
                        <g key={drawing.id}>
                            <circle cx={screen[0].x} cy={screen[0].y} r={3} fill={stroke} />
                            <text x={screen[0].x + 8} y={screen[0].y + 4} fill={stroke} fontSize={12} className="mono">
                                {drawing.text}
                            </text>
                        </g>
                    );
                }

                if (drawing.tool === 'horizontal') {
                    return <line key={drawing.id} x1={0} x2="100%" y1={screen[0].y} y2={screen[0].y} stroke={stroke} strokeWidth={1.5} strokeDasharray={selected ? undefined : '6 4'} />;
                }

                if (drawing.tool === 'rectangle') {
                    const x = Math.min(screen[0].x, screen[1].x);
                    const y = Math.min(screen[0].y, screen[1].y);
                    return (
                        <rect
                            key={drawing.id}
                            x={x}
                            y={y}
                            width={Math.abs(screen[1].x - screen[0].x)}
                            height={Math.abs(screen[1].y - screen[0].y)}
                            fill="color-mix(in oklab, var(--brand) 12%, transparent)"
                            stroke={stroke}
                            strokeWidth={1.5}
                        />
                    );
                }

                if (drawing.tool === 'fib') {
                    const levels = fibPrices(drawing.points[0], drawing.points[1]);
                    const left = Math.min(screen[0].x, screen[1].x);
                    const right = Math.max(screen[0].x, screen[1].x);
                    return (
                        <g key={drawing.id}>
                            {levels.map(({ level, price }) => {
                                const y = toScreen({ time: drawing.points[0].time, price })?.y;
                                if (y == null) return null;
                                return (
                                    <g key={level}>
                                        <line x1={left} x2={right} y1={y} y2={y} stroke={stroke} strokeWidth={1} strokeDasharray={level === 0 || level === 1 ? undefined : '5 4'} />
                                        <text x={right + 4} y={y + 3} fill="var(--faint)" fontSize={10} className="mono">
                                            {level === 0 || level === 1 ? label(level === 0 ? 'chart.fibStart' : 'chart.fibEnd') : level.toFixed(3)}
                                        </text>
                                    </g>
                                );
                            })}
                        </g>
                    );
                }

                return (
                    <g key={drawing.id}>
                        <line x1={screen[0].x} y1={screen[0].y} x2={screen[1].x} y2={screen[1].y} stroke={stroke} strokeWidth={1.5} />
                        {selected &&
                            screen.map((point, i) => (
                                <rect key={i} x={point.x - HANDLE} y={point.y - HANDLE} width={HANDLE * 2} height={HANDLE * 2} fill="var(--brand)" />
                            ))}
                    </g>
                );
            })}
        </svg>
    );
}

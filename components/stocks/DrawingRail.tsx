'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
    Brush,
    Circle,
    Eraser,
    EyeOff,
    Grid2x2,
    Lock,
    Magnet,
    Minus,
    MousePointer2,
    Redo2,
    Ruler,
    Shapes,
    Target,
    Trash2,
    Type,
    Undo2,
    Unlock,
    Waves,
    X,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toolsInGroup, toolDef, type ShapeTool, type ToolGroup } from '@/lib/chart-drawings';
import { TOOL_LABEL_KEYS, railGroupsWithTools } from '@/lib/drawing-groups';
import type { ActiveTool } from '@/components/stocks/ChartDrawings';
import type { StringKey } from '@/lib/i18n';

const GROUP_ICONS: Record<ToolGroup, LucideIcon> = {
    cursor: MousePointer2,
    lines: Minus,
    fib: Waves,
    gann: Grid2x2,
    patterns: Shapes,
    elliott: Waves,
    forecast: Target,
    shapes: Circle,
    annotation: Type,
    brush: Brush,
};

/** A small swatch that hints at how a tool draws, so a row reads without an icon set. */
function ToolGlyph({ tool }: { tool: ShapeTool }) {
    const kind = toolDef(tool).kind;
    const dashed = kind === 'horizontal' ? 'dashed' : 'solid';
    return (
        <span aria-hidden className="draw-rail-glyph">
            <span style={{ borderTop: `2px ${dashed} currentColor` }} />
        </span>
    );
}

type Props = {
    tool: ActiveTool | null;
    onPick: (tool: ActiveTool) => void;
    magnet: boolean;
    onMagnet: (next: boolean) => void;
    locked: boolean;
    canLock: boolean;
    onToggleLock: () => void;
    hidden: boolean;
    onHideAll: () => void;
    canDelete: boolean;
    onDelete: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    canClear: boolean;
    onClear: () => void;
    label: (key: StringKey) => string;
    /** Extra controls for a group's flyout (e.g. the Elliott auto-count) . */
    renderGroupExtra?: (group: ToolGroup) => ReactNode;
};

/**
 * The vertical drawing rail, docked on the plotting area's inline-start edge so it
 * flips to the right in Arabic. Each group icon opens one flyout at a time; the
 * cursor cluster and the undo/clear cluster sit above and below the groups.
 */
export default function DrawingRail({
    tool,
    onPick,
    magnet,
    onMagnet,
    locked,
    canLock,
    onToggleLock,
    hidden,
    onHideAll,
    canDelete,
    onDelete,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    canClear,
    onClear,
    label,
    renderGroupExtra,
}: Props) {
    const [open, setOpen] = useState<ToolGroup | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(null);
        };
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const clusterBtn = (
        key: string,
        title: string,
        Icon: LucideIcon,
        onClick: () => void,
        { active = false, disabled = false, danger = false }: { active?: boolean; disabled?: boolean; danger?: boolean } = {},
    ) => (
        <button
            key={key}
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={active}
            aria-label={title}
            title={title}
            className={cn('draw-rail-btn', active && 'is-on', danger && 'is-danger')}
        >
            <Icon className="size-[18px]" />
        </button>
    );

    return (
        <div ref={rootRef} role="toolbar" aria-orientation="vertical" aria-label={label('chart.group.lines')} className="draw-rail">
            {/* cursor cluster */}
            <div className="draw-rail-cluster">
                {clusterBtn('select', label('chart.tool.select'), MousePointer2, () => onPick('select'), { active: tool === 'select' })}
                {clusterBtn('measure', label('chart.tool.measure'), Ruler, () => onPick('measure'), { active: tool === 'measure' })}
                {clusterBtn('magnet', label('chart.tool.magnet'), Magnet, () => onMagnet(!magnet), { active: magnet })}
                {clusterBtn(locked ? 'unlock' : 'lock', label(locked ? 'chart.tool.unlock' : 'chart.tool.lock'), locked ? Lock : Unlock, onToggleLock, {
                    active: locked,
                    disabled: !canLock,
                })}
                {clusterBtn('hide', label('chart.tool.hideAll'), hidden ? EyeOff : EyeOff, onHideAll, { active: hidden })}
                {clusterBtn('delete', label('chart.tool.delete'), Trash2, onDelete, { disabled: !canDelete, danger: true })}
            </div>

            <span className="draw-rail-sep" />

            {/* the tool groups */}
            {railGroupsWithTools().map(({ group, label: groupLabel }) => {
                const Icon = GROUP_ICONS[group];
                const isOpen = open === group;
                const groupActive = tool != null && toolsInGroup(group).some((d) => d.tool === tool);
                return (
                    <div key={group} className="relative">
                        <button
                            type="button"
                            onClick={() => setOpen((current) => (current === group ? null : group))}
                            aria-expanded={isOpen}
                            aria-haspopup="menu"
                            aria-label={label(groupLabel)}
                            title={label(groupLabel)}
                            className={cn('draw-rail-btn', (isOpen || groupActive) && 'is-on')}
                        >
                            <Icon className="size-[18px]" />
                        </button>
                        {isOpen && (
                            <>
                                <div className="fixed inset-0 z-20" onClick={() => setOpen(null)} />
                                <div role="menu" aria-label={label(groupLabel)} className="draw-rail-flyout">
                                    {toolsInGroup(group).map((d) => {
                                        const value = d.tool as ActiveTool;
                                        const rowActive = tool === d.tool;
                                        return (
                                            <button
                                                key={d.tool}
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    onPick(value);
                                                    setOpen(null);
                                                }}
                                                className={cn('draw-rail-item', rowActive && 'is-on')}
                                            >
                                                <ToolGlyph tool={d.tool} />
                                                <span>{label(TOOL_LABEL_KEYS[d.tool])}</span>
                                            </button>
                                        );
                                    })}
                                    {renderGroupExtra?.(group)}
                                </div>
                            </>
                        )}
                    </div>
                );
            })}

            <span className="draw-rail-sep" />

            {/* undo / clear cluster */}
            <div className="draw-rail-cluster">
                {clusterBtn('undo', label('chart.tool.undo'), Undo2, onUndo, { disabled: !canUndo })}
                {clusterBtn('redo', label('chart.tool.redo'), Redo2, onRedo, { disabled: !canRedo })}
                {clusterBtn('clear', label('chart.tool.clear'), Eraser, onClear, { disabled: !canClear })}
                {tool && tool !== 'select' && (
                    <button
                        type="button"
                        onClick={() => onPick('select')}
                        aria-label={label('chart.cancel')}
                        title={label('chart.cancel')}
                        className="draw-rail-btn is-danger"
                    >
                        <X className="size-[18px]" />
                    </button>
                )}
            </div>
        </div>
    );
}

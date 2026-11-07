'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { MagnetStrength } from '@/lib/chart-magnet';
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
import { hotkeyForTool, MEASURE_KEY } from '@/lib/chart-hotkeys';
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

/** The strip's own flyout, keyed separately from the tool groups. */
type RailPanel = ToolGroup | 'cursor';

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
    magnetStrength: MagnetStrength;
    onMagnet: () => void;
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
 * flips to the right in Arabic.
 *
 * The strip holds one button per group (the first being the cursor and view
 * controls) plus undo/redo/clear. It scrolls inside its own height rather than
 * growing past the chart, and the flyouts are positioned against the rail's own
 * box — not the scrolling strip — so a long flyout is never clipped and never
 * spills below the panel.
 */
export default function DrawingRail({
    tool,
    onPick,
    magnetStrength,
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
    const [open, setOpen] = useState<RailPanel | null>(null);
    const [flyoutTop, setFlyoutTop] = useState(4);
    const rootRef = useRef<HTMLDivElement>(null);
    const flyoutRef = useRef<HTMLDivElement>(null);

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

    // A flyout opens beside the button that asked for it, then slides back inside the rail when
    // that button sits too close to the panel's edge for the whole flyout to fit below it.
    useEffect(() => {
        const root = rootRef.current;
        const flyout = flyoutRef.current;
        if (!open || !root || !flyout) return;
        const button = root.querySelector<HTMLElement>(`[data-rail-group="${open}"]`);
        if (!button) return;
        const rootBox = root.getBoundingClientRect();
        const buttonBox = button.getBoundingClientRect();
        const room = rootBox.height - flyout.offsetHeight - 4;
        setFlyoutTop(Math.max(4, Math.min(buttonBox.top - rootBox.top - 4, Math.max(4, room))));
    }, [open]);

    const toggle = useCallback((panel: RailPanel) => setOpen((current) => (current === panel ? null : panel)), []);

    const stripBtn = (
        panel: RailPanel,
        title: string,
        Icon: LucideIcon,
        { active = false }: { active?: boolean } = {},
    ) => (
        <button
            key={panel}
            type="button"
            data-rail-group={panel}
            onClick={() => toggle(panel)}
            aria-expanded={open === panel}
            aria-haspopup="menu"
            aria-label={title}
            title={title}
            className={cn('draw-rail-btn', (open === panel || active) && 'is-on')}
        >
            <Icon className="size-[18px]" />
        </button>
    );

    const actionBtn = (
        key: string,
        title: string,
        Icon: LucideIcon,
        onClick: () => void,
        { disabled = false, danger = false }: { disabled?: boolean; danger?: boolean } = {},
    ) => (
        <button
            key={key}
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={title}
            title={title}
            className={cn('draw-rail-btn', danger && 'is-danger')}
        >
            <Icon className="size-[18px]" />
        </button>
    );

    const row = (
        key: string,
        title: string,
        Icon: LucideIcon,
        onClick: () => void,
        {
            active = false,
            disabled = false,
            danger = false,
            glyph,
            checkable = false,
            shortcut: explicit = undefined,
        }: {
            active?: boolean;
            disabled?: boolean;
            danger?: boolean;
            glyph?: ShapeTool;
            checkable?: boolean;
            shortcut?: string | null;
        } = {},
    ) => {
        // The key is shown, not just documented: a trader reads "Trend line   T" once and stops
        // opening the help sheet to remember it.
        const shortcut = explicit !== undefined ? explicit : glyph ? hotkeyForTool(glyph) : null;
        return (
            <button
                key={key}
                type="button"
                role={checkable ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={checkable ? active : undefined}
                onClick={onClick}
                disabled={disabled}
                title={shortcut ? `${title} (${shortcut.toUpperCase()})` : title}
                className={cn('draw-rail-item', active && 'is-on', danger && 'is-danger')}
            >
                {glyph ? <ToolGlyph tool={glyph} /> : <Icon className="size-[16px] shrink-0" />}
                <span className="draw-rail-item-name">{title}</span>
                {shortcut && <kbd className="draw-rail-key">{shortcut.toUpperCase()}</kbd>}
            </button>
        );
    };

    const cursorActive = tool === 'select' || tool === 'measure' || magnetStrength !== 'off' || locked || hidden;

    return (
        <div ref={rootRef} className="draw-rail-root">
            <div
                role="toolbar"
                aria-orientation="vertical"
                aria-label={label('chart.group.cursor')}
                className="draw-rail"
                // A flyout is anchored to the rail, so scrolling the strip would leave it behind.
                onScroll={() => setOpen(null)}
            >
                {stripBtn('cursor', label('chart.group.cursor'), MousePointer2, { active: cursorActive })}

                <span className="draw-rail-sep" />

                {railGroupsWithTools().map(({ group, label: groupLabel }) => {
                    const Icon = GROUP_ICONS[group];
                    const groupActive = tool != null && toolsInGroup(group).some((d) => d.tool === tool);
                    return stripBtn(group, label(groupLabel), Icon, { active: groupActive });
                })}

                <span className="draw-rail-sep" />

                {actionBtn('undo', label('chart.tool.undo'), Undo2, onUndo, { disabled: !canUndo })}
                {actionBtn('redo', label('chart.tool.redo'), Redo2, onRedo, { disabled: !canRedo })}
                {actionBtn('clear', label('chart.tool.clear'), Eraser, onClear, { disabled: !canClear })}
                {tool && tool !== 'select' && actionBtn('cancel', label('chart.cancel'), X, () => onPick('select'), { danger: true })}
            </div>

            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(null)} />
                    <div
                        ref={flyoutRef}
                        role="menu"
                        aria-label={open === 'cursor' ? label('chart.group.cursor') : label(railGroupsWithTools().find((g) => g.group === open)?.label ?? 'chart.group.lines')}
                        className="draw-rail-flyout"
                        style={{ top: flyoutTop }}
                    >
                        {open === 'cursor' ? (
                            <>
                                {row('select', label('chart.tool.select'), MousePointer2, () => {
                                    onPick('select');
                                    setOpen(null);
                                }, { active: tool === 'select' })}
                                {row('measure', label('chart.tool.measure'), Ruler, () => {
                                    onPick('measure');
                                    setOpen(null);
                                }, { active: tool === 'measure', shortcut: MEASURE_KEY })}
                                {row(
                                    'magnet',
                                    label(magnetStrength === 'off' ? 'chart.tool.magnet' : magnetStrength === 'weak' ? 'chart.tool.magnetWeak' : 'chart.tool.magnetStrong'),
                                    Magnet,
                                    onMagnet,
                                    { active: magnetStrength !== 'off', checkable: true },
                                )}
                                {row(locked ? 'unlock' : 'lock', label(locked ? 'chart.tool.unlock' : 'chart.tool.lock'), locked ? Lock : Unlock, onToggleLock, {
                                    active: locked,
                                    disabled: !canLock,
                                    checkable: true,
                                })}
                                {row('hide', label('chart.tool.hideAll'), EyeOff, onHideAll, { active: hidden, checkable: true })}
                                {row('delete', label('chart.tool.delete'), Trash2, onDelete, { disabled: !canDelete, danger: true })}
                            </>
                        ) : (
                            <>
                                {toolsInGroup(open).map((d) => {
                                    const value = d.tool as ActiveTool;
                                    return row(
                                        d.tool,
                                        label(TOOL_LABEL_KEYS[d.tool]),
                                        GROUP_ICONS[open],
                                        () => {
                                            onPick(value);
                                            setOpen(null);
                                        },
                                        { active: tool === d.tool, glyph: d.tool },
                                    );
                                })}
                                {renderGroupExtra?.(open)}
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

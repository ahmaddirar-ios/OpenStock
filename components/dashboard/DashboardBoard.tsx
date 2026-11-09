'use client';

import { useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { saveDashboardLayout } from '@/lib/actions/dashboard.actions';
import {
    DEFAULT_LAYOUT,
    WIDGETS,
    moveWidget,
    toggleWidget,
    visibleWidgets,
    type DashboardLayout,
    type WidgetId,
} from '@/lib/dashboard';
import { tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    layout: DashboardLayout;
    /** The rendered card for each widget — server components handed down as nodes. */
    widgets: Record<WidgetId, React.ReactNode>;
    lang: Lang;
};

/**
 * The overview board: the user's own row of cards above the chart. It owns only the arrangement —
 * each card is a server component rendered before it gets here, so the board never re-fetches to
 * rearrange itself. Every change is saved as it happens; a failed save keeps the old arrangement.
 */
const DashboardBoard = ({ layout, widgets, lang }: Props) => {
    const [current, setCurrent] = useState<DashboardLayout>(layout);
    const [editing, setEditing] = useState(false);
    const [, startTransition] = useTransition();

    const commit = (next: DashboardLayout) => {
        setCurrent(next);
        startTransition(() => {
            void saveDashboardLayout(next).catch(() => setCurrent(current));
        });
    };

    const shown = visibleWidgets(current);
    const hidden = WIDGETS.filter((widget) => current.hidden.includes(widget.id));

    return (
        <section className="board" aria-label={tx(lang, 'board.title')}>
            <div className="board-head">
                <span className="board-title">
                    <SlidersHorizontal className="size-3.5" />
                    {tx(lang, 'board.title')}
                </span>
                <button type="button" className={cn('board-action', editing && 'is-on')} onClick={() => setEditing((value) => !value)}>
                    {editing ? <Check className="size-3.5" /> : <SlidersHorizontal className="size-3.5" />}
                    {tx(lang, editing ? 'board.done' : 'board.edit')}
                </button>
                {editing && (
                    <button type="button" className="board-action" onClick={() => commit({ order: [...DEFAULT_LAYOUT.order], hidden: [] })}>
                        <RotateCcw className="size-3.5" />
                        {tx(lang, 'board.reset')}
                    </button>
                )}
            </div>

            <div className={cn('board-grid', editing && 'is-editing')}>
                {shown.map((id, index) => (
                    <div key={id} className="board-card">
                        {widgets[id]}
                        {editing && (
                            <div className="board-tools">
                                <button type="button" aria-label={tx(lang, 'board.moveUp')} disabled={index === 0} onClick={() => commit(moveWidget(current, id, -1))}>
                                    <ArrowUp />
                                </button>
                                <button type="button" aria-label={tx(lang, 'board.moveDown')} disabled={index === shown.length - 1} onClick={() => commit(moveWidget(current, id, 1))}>
                                    <ArrowDown />
                                </button>
                                <button type="button" aria-label={tx(lang, 'board.hide')} onClick={() => commit(toggleWidget(current, id))}>
                                    <EyeOff />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {editing && hidden.length > 0 && (
                <div className="board-restore">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">{tx(lang, 'board.hidden')}</span>
                    {hidden.map((widget) => (
                        <button key={widget.id} type="button" className="board-action" onClick={() => commit(toggleWidget(current, widget.id))}>
                            <Eye className="size-3.5" />
                            {tx(lang, widget.labelKey)}
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
};

export default DashboardBoard;

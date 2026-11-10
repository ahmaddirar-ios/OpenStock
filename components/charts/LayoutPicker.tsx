'use client';

import { CHART_LAYOUTS, LAYOUT_IDS, type GridLayoutId } from '@/lib/chart/grid';
import { tx, type Lang, type StringKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const LABELS: Record<GridLayoutId, StringKey> = {
    1: 'chart.grid.layout1',
    2: 'chart.grid.layout2',
    3: 'chart.grid.layout3',
    4: 'chart.grid.layout4',
};

/** The shape of a layout, drawn to scale: two columns, a tall left pane, or a four-square grid. */
const Glyph = ({ id }: { id: GridLayoutId }) => (
    <span className="grid h-3.5 w-4 gap-px" aria-hidden="true"
        style={{
            gridTemplateColumns: id === 1 ? '1fr' : '1fr 1fr',
            gridTemplateRows: id === 2 ? '1fr' : '1fr 1fr',
        }}
    >
        <span className="rounded-[2px] bg-current" />
        {id >= 2 && <span className="rounded-[2px] bg-current" />}
        {id === 3 && <span className="rounded-[2px] bg-current" />}
        {id === 4 && (
            <>
                <span className="rounded-[2px] bg-current" />
                <span className="rounded-[2px] bg-current" />
            </>
        )}
    </span>
);

/** Chooses how many panes the screen holds. The pane count is the layout, so one control says it all. */
export default function LayoutPicker({
    value,
    onChange,
    lang,
}: {
    value: GridLayoutId;
    onChange: (id: GridLayoutId) => void;
    lang: Lang;
}) {
    return (
        <div className="flex items-center gap-1" role="group" aria-label={tx(lang, 'chart.grid.layout')}>
            {LAYOUT_IDS.map((id) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => onChange(id)}
                    aria-pressed={value === id}
                    aria-label={tx(lang, LABELS[id])}
                    title={`${tx(lang, LABELS[id])} · ${CHART_LAYOUTS[id].panes}`}
                    className={cn('pill h-7 gap-1.5 px-2 text-[12px]', value === id && 'is-up')}
                >
                    <Glyph id={id} />
                    <span className="num">{CHART_LAYOUTS[id].panes}</span>
                </button>
            ))}
        </div>
    );
}

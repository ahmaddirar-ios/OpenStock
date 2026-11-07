'use client';

import { useMemo, useState } from 'react';
import { Grid3x3 } from 'lucide-react';
import { buildSurface, pickSurfaceAxes, surfaceTone } from '@/lib/strategy-surface';
import type { Objective, OptimizerRow } from '@/lib/custom-strategy';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    /** Every combination the search ran, not just the ranked top. */
    rows: OptimizerRow[];
    /** The strategy's parameter keys, in the order the lab lists them. */
    keys: string[];
    objective: Objective;
    lang: Lang;
    /** Loads one corner's whole parameter set back into the lab. */
    onPick: (values: Record<string, number>) => void;
    /** How the objective reads in a cell, so the surface and the table agree. */
    format: (value: number | null) => string;
};

/**
 * The optimizer as a picture: two parameters on the axes, the objective as colour and number. A
 * ridge says the pair matters, a flat field says it does not, and a cliff says the strategy is
 * fragile at that edge. Clicking a cell loads that combination, the same as the table's Apply.
 */
export default function OptimizerSurface({ rows, keys, objective, lang, onPick, format }: Props) {
    const t = (key: Parameters<typeof tx>[1]) => tx(lang, key);
    const auto = useMemo(() => pickSurfaceAxes(rows, keys), [rows, keys]);
    const [picked, setPicked] = useState<[string, string] | null>(null);
    // A new search can drop a parameter; the automatic pair then takes over again.
    const axes = picked && keys.includes(picked[0]) && keys.includes(picked[1]) ? picked : auto;
    const surface = useMemo(
        () => (axes ? buildSurface(rows, axes[0], axes[1], objective) : null),
        [rows, axes, objective],
    );

    if (!axes || !surface) return null;

    const best = surface.max;
    const select = (value: string, which: 0 | 1) => {
        const next: [string, string] = which === 0 ? [value, axes[1]] : [axes[0], value];
        if (next[0] === next[1]) return;
        setPicked(next);
    };

    return (
        <section className="card flex flex-col gap-2 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                    <Grid3x3 className="size-3.5 text-brand" /> {t('cs.surface')}
                </h3>
                <label className="flex items-center gap-1 text-[10.5px] text-faint">
                    <span className="sr-only">{t('cs.surfaceX')}</span>
                    <select
                        value={axes[0]}
                        onChange={(event) => select(event.target.value, 0)}
                        aria-label={t('cs.surfaceX')}
                        className="h-7 rounded-[6px] bg-page px-1.5 text-[11px] text-foreground shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                    >
                        {keys.map((key) => (
                            <option key={key} value={key} disabled={key === axes[1]}>{key}</option>
                        ))}
                    </select>
                    <span aria-hidden="true">×</span>
                    <select
                        value={axes[1]}
                        onChange={(event) => select(event.target.value, 1)}
                        aria-label={t('cs.surfaceY')}
                        className="h-7 rounded-[6px] bg-page px-1.5 text-[11px] text-foreground shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                    >
                        {keys.map((key) => (
                            <option key={key} value={key} disabled={key === axes[0]}>{key}</option>
                        ))}
                    </select>
                </label>
                <span className="num ms-auto flex items-center gap-1 text-[10.5px] text-faint" dir="ltr">
                    {format(surface.min)}
                    <span
                        aria-hidden="true"
                        className="h-2 w-16 rounded-full"
                        style={{ background: `linear-gradient(90deg, ${surfaceTone(surface.min, surface.min, surface.max)}, ${surfaceTone(surface.max, surface.min, surface.max)})` }}
                    />
                    {format(surface.max)}
                </span>
            </div>
            <p className="text-[10.5px] leading-snug text-faint">{t('cs.surfaceHint')}</p>

            <div className="overflow-x-auto">
                <table className="border-separate border-spacing-[2px] text-[10.5px]">
                    <thead>
                        <tr>
                            <th className="sticky start-0 bg-card px-1 py-0.5 text-[10px] font-medium text-faint" scope="col">
                                <span className="sr-only">{t('cs.surfaceY')}</span>
                            </th>
                            {surface.x.values.map((value) => (
                                <th key={value} scope="col" className="num px-1 py-0.5 text-center font-medium text-faint" dir="ltr">
                                    {arDigits(String(value), lang)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {surface.y.values.map((y, yIndex) => (
                            <tr key={y}>
                                <th scope="row" className="num sticky start-0 bg-card px-1 py-0.5 text-end font-medium text-faint" dir="ltr">
                                    {arDigits(String(y), lang)}
                                </th>
                                {surface.cells[yIndex].map((cell, xIndex) => {
                                    const value = cell.value;
                                    const isBest = value != null && value === best;
                                    return (
                                        <td key={surface.x.values[xIndex]} className="p-0">
                                            <button
                                                type="button"
                                                disabled={!cell.row}
                                                onClick={() => cell.row && onPick(cell.row.values)}
                                                title={`${axes[0]} ${surface.x.values[xIndex]} · ${axes[1]} ${y} · ${format(value)}`}
                                                aria-label={`${axes[0]} ${surface.x.values[xIndex]}, ${axes[1]} ${y}: ${format(value)}`}
                                                className={cn(
                                                    'num grid h-7 min-w-11 place-items-center rounded-[4px] px-1 text-[10.5px] text-foreground transition-shadow',
                                                    cell.row ? 'hover:ring-2 hover:ring-ring' : 'cursor-default text-faint',
                                                    isBest && 'ring-1 ring-brand',
                                                )}
                                                style={value == null ? undefined : { background: surfaceTone(value, surface.min, surface.max) }}
                                                dir="ltr"
                                            >
                                                {value == null ? '·' : format(value)}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

'use client';

import { tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * The intervals, as one track rather than seven separate pills: a segmented control is how a trader
 * reads "these are the same choice, pick one", and it stops the bar from looking like a list of
 * unrelated buttons. Picking is the caller's business; this only names the choice.
 */
export default function ChartPeriods({
    periods,
    active,
    lang,
    onPick,
}: {
    periods: { id: string; label: string }[];
    active: string;
    lang: Lang;
    onPick: (id: string) => void;
}) {
    return (
        <div className="chart-periods" role="group" aria-label={tx(lang, 'chart.period')}>
            {periods.map((period) => (
                <button
                    key={period.id}
                    type="button"
                    onClick={() => onPick(period.id)}
                    aria-pressed={active === period.id}
                    className={cn('chart-tf-pill', active === period.id && 'is-up')}
                >
                    {period.label}
                </button>
            ))}
        </div>
    );
}

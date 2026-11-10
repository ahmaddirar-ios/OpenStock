'use client';

import { Ellipsis } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tx, type Lang } from '@/lib/i18n';

/**
 * The one button a phone gets instead of five rows of chart controls. It exists only under 768px
 * (`.chart-more` is hidden above that); the hiding itself is a media query on the toolbar, so the
 * fold costs no layout code and the desktop toolbar is untouched.
 */
export default function ChartToolbarMore({
    lang,
    open,
    onToggle,
}: {
    lang: Lang;
    open: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={tx(lang, 'chart.more')}
            title={tx(lang, 'chart.more')}
            className={cn('pill chart-more keep-mobile ms-auto h-7 gap-1.5 px-2.5 text-[12px]', open && 'is-up')}
        >
            <Ellipsis className="size-3.5" /> {tx(lang, 'chart.more')}
        </button>
    );
}

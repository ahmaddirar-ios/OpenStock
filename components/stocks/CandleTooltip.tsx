'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import type { BarReadout } from '@/lib/chart/readout';
import { timeLabel, type TimeZoneId } from '@/lib/chart/time';
import { cn } from '@/lib/utils';

// The bar under the cursor, spelled out: the stamp, the four prices, the move against the previous
// close, the bar's own range and the full volume. The legend already carries O/H/L/C and a compact
// volume, so this is the detail a trader reaches for when a candle looks unusual — and it follows
// the pointer, flipping at the pane's edges so it never covers the bar it describes.

type Props = {
    readout: BarReadout | null;
    point: { x: number; y: number } | null;
    lang: Lang;
    zone: TimeZoneId;
};

const GAP = 14;
const EDGE = 8;

export default function CandleTooltip({ readout, point, lang, zone }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        const parent = el?.parentElement;
        if (!el || !parent || !point) {
            setPos(null);
            return;
        }
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        const paneWidth = parent.clientWidth;
        const paneHeight = parent.clientHeight;

        // Right of the cursor by default; left of it when that would run off the pane.
        let left = point.x + GAP;
        if (left + width > paneWidth - EDGE) left = point.x - GAP - width;
        left = Math.max(EDGE, Math.min(left, paneWidth - width - EDGE));

        // Below the cursor by default; above it near the bottom.
        let top = point.y + GAP;
        if (top + height > paneHeight - EDGE) top = point.y - GAP - height;
        top = Math.max(EDGE, Math.min(top, paneHeight - height - EDGE));

        setPos({ left, top });
    }, [point, readout]);

    if (!readout || !point) return null;

    const price = (value: number) => arDigits(value.toFixed(2), lang);
    const signed = readout.change;
    const signedPercent = readout.changePercent;
    const tone = signed == null || signed === 0 ? 'text-muted-foreground' : signed > 0 ? 'text-up' : 'text-down';
    const range = readout.high - readout.low;

    const rows: { key: string; label: string; value: string; tone?: string }[] = [
        { key: 'open', label: tx(lang, 'chart.legend.open'), value: price(readout.open) },
        { key: 'high', label: tx(lang, 'chart.legend.high'), value: price(readout.high) },
        { key: 'low', label: tx(lang, 'chart.legend.low'), value: price(readout.low) },
        { key: 'close', label: tx(lang, 'chart.legend.close'), value: price(readout.close) },
    ];

    return (
        <div
            ref={ref}
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            role="tooltip"
            aria-live="off"
            className={cn(
                'pointer-events-none absolute z-30 w-[196px] rounded-[10px] p-2.5 text-[11.5px] leading-tight',
                'shadow-[0_10px_28px_oklch(0_0_0/0.45)]',
            )}
            style={{
                left: pos?.left ?? 0,
                top: pos?.top ?? 0,
                opacity: pos ? 1 : 0,
                background: 'var(--card)',
                color: 'var(--text)',
                boxShadow: '0 0 0 1px var(--line), 0 10px 28px oklch(0 0 0 / 0.45)',
            }}
        >
            <div className="mb-2 border-b pb-1.5 text-[11px] font-semibold text-faint" style={{ borderColor: 'var(--line)' }}>
                <bdi className="num">{timeLabel(readout.time, zone, lang)}</bdi>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {rows.map((row) => (
                    <div key={row.key} className="flex items-baseline justify-between gap-2">
                        <span className="text-faint">{row.label}</span>
                        <bdi className="num font-semibold">{row.value}</bdi>
                    </div>
                ))}
            </div>

            <div className="mt-2 space-y-1 border-t pt-1.5" style={{ borderColor: 'var(--line)' }}>
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-faint">{tx(lang, 'chart.tip.change')}</span>
                    <bdi className={cn('num font-semibold', tone)}>
                        {signed == null ? '—' : arDigits(signed.toFixed(2), lang)}
                        {signedPercent == null ? null : (
                            <span className="ms-1 font-normal">({arDigits(signedPercent.toFixed(2), lang)}%)</span>
                        )}
                    </bdi>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-faint">{tx(lang, 'chart.tip.range')}</span>
                    <bdi className="num font-semibold">{price(range)}</bdi>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-faint">{tx(lang, 'chart.tip.volume')}</span>
                    <bdi className="num font-semibold">{arDigits(Math.round(readout.volume).toLocaleString('en-US'), lang)}</bdi>
                </div>
            </div>
        </div>
    );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { TIME_ZONES, type TimeZoneId } from '@/lib/chart-time';
import { SCALE_MODES, SCALE_MODE_KEYS, type ScaleMode } from '@/lib/chart-view';

/**
 * The four settings a trader changes once and then forgets — the clock, the price axis, an inverted
 * axis, session gaps. They used to hold four permanent slots on the toolbar, which made the bar read
 * as a list of everything the chart can do. Behind one gear they cost nothing until asked for.
 *
 * The panel only reports; the chart owns the state, so nothing here can drift out of step with it.
 */
export default function ChartSettingsMenu({
    lang,
    timeZone,
    scaleMode,
    invert,
    sessionBreaks,
    onTimeZone,
    onScaleMode,
    onInvert,
    onSessionBreaks,
    className,
}: {
    lang: Lang;
    timeZone: TimeZoneId;
    scaleMode: ScaleMode;
    invert: boolean;
    sessionBreaks: boolean;
    onTimeZone: (zone: TimeZoneId) => void;
    onScaleMode: (mode: ScaleMode) => void;
    onInvert: (value: boolean) => void;
    onSessionBreaks: (value: boolean) => void;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Escape shuts it, and the focus goes back where it came from: a panel the keyboard cannot leave
    // is a trap, not a menu.
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            buttonRef.current?.focus();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    const label = tx(lang, 'chart.settings');

    return (
        <div className={cn('relative', className)}>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={label}
                title={label}
                className={cn('pill h-7 px-2.5 text-[12px]', open && 'is-up')}
            >
                <Settings2 className="size-3.5" />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <div
                        role="dialog"
                        aria-label={label}
                        className="chart-settings absolute end-0 z-30 mt-1 flex w-[19rem] flex-col gap-3 rounded-[12px] bg-card p-3 text-start shadow-[0_0_0_1px_var(--line),0_16px_40px_oklch(0_0_0/0.5)]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[12px] font-semibold text-foreground">{label}</span>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label={tx(lang, 'common.close')}
                                className="icon-btn size-6"
                            >
                                <X className="size-3.5" />
                            </button>
                        </div>

                        <label className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-faint">{tx(lang, 'chart.tz')}</span>
                            <select
                                value={timeZone}
                                onChange={(event) => onTimeZone(event.target.value as TimeZoneId)}
                                aria-label={tx(lang, 'chart.tz')}
                                className="h-8 rounded-[8px] bg-page px-2 text-[12px] text-foreground shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {TIME_ZONES.map((zone) => (
                                    <option key={zone.id} value={zone.id}>{tx(lang, zone.label)}</option>
                                ))}
                            </select>
                        </label>

                        <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-faint">{tx(lang, 'chart.scale')}</span>
                            <div className="chart-periods" role="group" aria-label={tx(lang, 'chart.scale')}>
                                {SCALE_MODES.map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => onScaleMode(mode)}
                                        aria-pressed={scaleMode === mode}
                                        className={cn('chart-tf-pill', scaleMode === mode && 'is-up')}
                                    >
                                        {tx(lang, SCALE_MODE_KEYS[mode])}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label className="flex items-center justify-between gap-3">
                            <span className="text-[12px] text-foreground">{tx(lang, 'chart.scale.invert')}</span>
                            <input
                                type="checkbox"
                                role="checkbox"
                                checked={invert}
                                onChange={(event) => onInvert(event.target.checked)}
                                aria-label={tx(lang, 'chart.scale.invert')}
                                className="chart-switch"
                            />
                        </label>

                        <label className="flex items-center justify-between gap-3">
                            <span className="text-[12px] text-foreground">{tx(lang, 'chart.sessionBreaks')}</span>
                            <input
                                type="checkbox"
                                role="checkbox"
                                checked={sessionBreaks}
                                onChange={(event) => onSessionBreaks(event.target.checked)}
                                aria-label={tx(lang, 'chart.sessionBreaks')}
                                className="chart-switch"
                            />
                        </label>
                    </div>
                </>
            )}
        </div>
    );
}

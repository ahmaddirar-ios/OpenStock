'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Settings2, X } from 'lucide-react';
import { tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { TIME_ZONES, type TimeZoneId } from '@/lib/chart-time';
import { SCALE_MODES, SCALE_MODE_KEYS, type ScaleMode } from '@/lib/chart-view';
import {
    CHART_PALETTE_IDS,
    CHART_PALETTE_KEYS,
    DEFAULT_PALETTE_STATE,
    PALETTE_FIELDS,
    PALETTE_FIELD_KEYS,
    type ChartPalette,
    type ChartPaletteState,
} from '@/lib/chart-palette';

/**
 * The settings a trader changes once and then forgets — the clock, the price axis, an inverted axis,
 * session gaps — and the chart's own colours. They used to hold permanent slots on the toolbar,
 * which made the bar read as a list of everything the chart can do. Behind one gear they cost
 * nothing until asked for.
 *
 * The panel only reports; the chart owns the state, so nothing here can drift out of step with it.
 */
export default function ChartSettingsMenu({
    lang,
    timeZone,
    scaleMode,
    invert,
    sessionBreaks,
    watermark,
    paletteState,
    palette,
    onTimeZone,
    onScaleMode,
    onInvert,
    onSessionBreaks,
    onWatermark,
    onPalette,
    onGoToDate,
    className,
}: {
    lang: Lang;
    timeZone: TimeZoneId;
    scaleMode: ScaleMode;
    invert: boolean;
    sessionBreaks: boolean;
    watermark: boolean;
    /** The preset the trader picked, plus any colour they overrode by hand. */
    paletteState: ChartPaletteState;
    /** The five colours actually on screen — the theme's own when no preset is set. */
    palette: ChartPalette;
    onTimeZone: (zone: TimeZoneId) => void;
    onScaleMode: (mode: ScaleMode) => void;
    onInvert: (value: boolean) => void;
    onSessionBreaks: (value: boolean) => void;
    onWatermark: (value: boolean) => void;
    onPalette: (state: ChartPaletteState) => void;
    /** Jumps the chart to the bar nearest a date the trader typed. */
    onGoToDate: (time: number) => void;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [goDate, setGoDate] = useState('');
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

    // A date input gives a local calendar day; noon UTC lands inside that day for every zone, so a
    // daily bar is never missed by a few hours.
    const goToDate = () => {
        const [year, month, day] = goDate.split('-').map(Number);
        if (!year || !month || !day) return;
        onGoToDate(Date.UTC(year, month - 1, day, 12) / 1000);
        setOpen(false);
    };

    // Editing a colour while on "follow theme" pins the five colours on screen and switches to
    // custom, so the change is visible instead of being swallowed by the theme.
    const setField = (field: keyof ChartPalette, value: string) => {
        if (paletteState.id === 'theme') {
            onPalette({ id: 'custom', custom: { ...palette, [field]: value } });
            return;
        }
        onPalette({ id: paletteState.id, custom: { ...paletteState.custom, [field]: value } });
    };

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
                        className="chart-settings absolute end-0 z-30 mt-1 flex max-h-[min(70vh,34rem)] w-[19rem] flex-col gap-3 overflow-y-auto overscroll-contain rounded-[12px] bg-card p-3 text-start shadow-[0_0_0_1px_var(--line),0_16px_40px_oklch(0_0_0/0.5)]"
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
                            <span className="text-[11px] font-medium text-faint">{tx(lang, 'chart.goTo')}</span>
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="date"
                                    value={goDate}
                                    onChange={(event) => setGoDate(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') goToDate();
                                    }}
                                    aria-label={tx(lang, 'chart.goToDate')}
                                    className="h-8 min-w-0 flex-1 rounded-[8px] bg-page px-2 text-[12px] text-foreground shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                                <button
                                    type="button"
                                    onClick={goToDate}
                                    disabled={!goDate}
                                    className="pill h-8 px-2.5 text-[12px] disabled:opacity-40"
                                >
                                    {tx(lang, 'chart.goToGo')}
                                </button>
                            </div>
                        </div>

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

                        <label className="flex items-center justify-between gap-3">
                            <span className="text-[12px] text-foreground">{tx(lang, 'chart.watermark')}</span>
                            <input
                                type="checkbox"
                                role="checkbox"
                                checked={watermark}
                                onChange={(event) => onWatermark(event.target.checked)}
                                aria-label={tx(lang, 'chart.watermark')}
                                className="chart-switch"
                            />
                        </label>

                        <div className="h-px bg-line" aria-hidden />

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-medium text-faint">{tx(lang, 'chart.palette.title')}</span>
                                <button
                                    type="button"
                                    onClick={() => onPalette(DEFAULT_PALETTE_STATE)}
                                    className="flex items-center gap-1 text-[10.5px] text-faint transition-colors hover:text-foreground"
                                    aria-label={tx(lang, 'chart.palette.reset')}
                                    title={tx(lang, 'chart.palette.reset')}
                                >
                                    <RotateCcw className="size-3" />
                                    {tx(lang, 'chart.palette.reset')}
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-1" role="group" aria-label={tx(lang, 'chart.palette.title')}>
                                {CHART_PALETTE_IDS.map((id) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => onPalette({ id, custom: {} })}
                                        aria-pressed={paletteState.id === id}
                                        className={cn('chart-tf-pill', paletteState.id === id && 'is-up')}
                                    >
                                        {tx(lang, CHART_PALETTE_KEYS[id])}
                                    </button>
                                ))}
                            </div>

                            <div className="flex flex-col gap-1">
                                {PALETTE_FIELDS.map((field) => (
                                    <label key={field} className="flex items-center justify-between gap-2">
                                        <span className="text-[12px] text-foreground">{tx(lang, PALETTE_FIELD_KEYS[field])}</span>
                                        <span className="flex items-center gap-1.5">
                                            <span className="mono text-[10.5px] uppercase text-faint" dir="ltr">{palette[field]}</span>
                                            <input
                                                type="color"
                                                value={palette[field]}
                                                onChange={(event) => setField(field, event.target.value)}
                                                aria-label={`${tx(lang, PALETTE_FIELD_KEYS[field])} — ${tx(lang, 'chart.palette.pick')}`}
                                                className="size-6 cursor-pointer rounded-[6px] border border-line bg-transparent p-0"
                                            />
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

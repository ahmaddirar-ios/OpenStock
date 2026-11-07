"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createAlert } from "@/lib/actions/alert.actions";
import { formatPrice } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { tx, type Lang } from "@/lib/i18n";
import { isAlertCondition, needsCandles, PARAM_BOUNDS, type AlertCondition } from "@/lib/alerts";
import { DRAWING_BAND, DRAWING_CONDITIONS, anchorPriceAt, clampBand, isDrawingCondition, type DrawingAnchor } from "@/lib/drawing-alert";
import { alertConditionLabel } from "@/lib/alert-labels";

interface CreateAlertModalProps {
    symbol: string;
    currentPrice?: number | null;
    currency?: string;
    children?: React.ReactNode;
    lang?: Lang;
    onAlertCreated?: () => void;
    /** When given, the modal opens on the drawing rules for this snapshotted line instead of a price. */
    anchor?: DrawingAnchor | null;
    /** Controlled opening, for a caller that is not a trigger (the chart's object menu). */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

// Labels live in the dictionary; the values are what the server stores. The quick modal offers
// the rules a trader reaches for from a row; the centre offers the same list plus editing.
const CONDITIONS: AlertCondition[] = [
    'ABOVE',
    'BELOW',
    'RSI_BELOW',
    'RSI_ABOVE',
    'PRICE_CROSS_UP_SMA',
    'PRICE_CROSS_DOWN_SMA',
    'VOLUME_SPIKE',
];

export default function CreateAlertModal({ symbol, currentPrice, currency = 'USD', children, lang = 'en', onAlertCreated, anchor, open: controlledOpen, onOpenChange: controlledChange }: CreateAlertModalProps) {
    const [innerOpen, setInnerOpen] = useState(false);
    const open = controlledOpen ?? innerOpen;
    const [condition, setCondition] = useState<AlertCondition>('ABOVE');
    const [targetPrice, setTargetPrice] = useState('');
    const [period, setPeriod] = useState('');
    const [band, setBand] = useState(String(DRAWING_BAND.default));
    const [loading, setLoading] = useState(false);

    const drawing = anchor ?? null;
    const conditions: AlertCondition[] = drawing ? [...DRAWING_CONDITIONS] : CONDITIONS;
    const drawnCondition: AlertCondition = drawing && isDrawingCondition(condition) ? condition : drawing ? 'DRAWING_CROSS_UP' : condition;
    // The line's price right now: a drawing rule has no number to type, only the line it watches.
    const lineNow = drawing ? anchorPriceAt(drawing, Math.floor(Date.now() / 1000)) : null;

    const activeCondition = drawing ? drawnCondition : condition;
    const target = parseFloat(targetPrice);
    const isPriceRule = activeCondition === 'ABOVE' || activeCondition === 'BELOW';
    const hasPrice = !!currentPrice && currentPrice > 0;
    const distance = isPriceRule && hasPrice && Number.isFinite(target) ? ((target - currentPrice!) / currentPrice!) * 100 : null;
    const alreadyMet = distance !== null && (activeCondition === 'ABOVE' ? distance <= 0 : distance >= 0);

    const onOpenChange = (next: boolean) => {
        if (controlledOpen === undefined) setInnerOpen(next);
        controlledChange?.(next);
        if (!next) return;
        if (drawing) {
            setCondition('DRAWING_CROSS_UP');
            return;
        }
        setTargetPrice(isPriceRule && hasPrice ? currentPrice!.toFixed(2) : '');
    };

    const paramsFor = (value: AlertCondition) => {
        const number = Number(period);
        if (value === 'RSI_BELOW' || value === 'RSI_ABOVE') return { period: Number.isFinite(number) && number > 0 ? number : PARAM_BOUNDS.rsiPeriod.default };
        if (value === 'VOLUME_SPIKE') return { window: Number.isFinite(number) && number > 0 ? number : PARAM_BOUNDS.volumeWindow.default };
        return {};
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const rule = drawing ? drawnCondition : condition;
            const price = drawing ? lineNow ?? 0 : target;
            await createAlert({
                symbol,
                targetPrice: price,
                condition: rule,
                ...(rule === 'DRAWING_TOUCH' ? { params: { band: clampBand(band) } } : needsCandles(rule) ? { params: paramsFor(rule) } : {}),
                ...(drawing ? { anchor: drawing } : {}),
            });
            toast.success(tx(lang, 'alertModal.created')
                .replace('{s}', symbol)
                .replace('{c}', `${alertConditionLabel(lang, rule)} ${price}`));
            onOpenChange(false);
            onAlertCreated?.();
        } catch (error) {
            console.error(error);
            toast.error(tx(lang, 'alertModal.failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {children && <DialogTrigger asChild>{children}</DialogTrigger>}
            <DialogContent className="sm:max-w-[420px] gap-5" closeLabel={tx(lang, 'dialog.close')}>
                <div className="flex flex-col gap-5">
                    <div>
                            <p className="kicker text-brand-ink">{tx(lang, 'alertModal.kicker')}</p>
                            <DialogTitle className="mt-1 text-xl font-bold tracking-tight mono">{symbol}</DialogTitle>
                            <DialogDescription className="mt-1 text-[13px] text-faint">
                                {tx(lang, 'alertModal.desc')}
                            </DialogDescription>
                    </div>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <label className="flex flex-col gap-2">
                                <span className="form-label">{tx(lang, 'alertModal.condition')}</span>
                                <select
                                    value={activeCondition}
                                    onChange={(e) => {
                                        const next = e.target.value as AlertCondition;
                                        setCondition(next);
                                        setPeriod(String(next === 'VOLUME_SPIKE' ? PARAM_BOUNDS.volumeWindow.default : PARAM_BOUNDS.rsiPeriod.default));
                                        setTargetPrice(next === 'ABOVE' || next === 'BELOW' ? (hasPrice ? currentPrice!.toFixed(2) : '') : '');
                                    }}
                                    className="h-11 rounded-[11px] border border-line bg-page px-3 text-[14px] font-semibold outline-none focus-visible:border-brand"
                                >
                                    {conditions.map((value) => (
                                        <option key={value} value={value}>{alertConditionLabel(lang, value)}</option>
                                    ))}
                                </select>
                            </label>

                            {needsCandles(condition) && condition !== 'PRICE_CROSS_UP_SMA' && condition !== 'PRICE_CROSS_DOWN_SMA' && (
                                <label className="flex flex-col gap-2">
                                    <span className="form-label">{tx(lang, condition === 'VOLUME_SPIKE' ? 'alerts.param.window' : 'alerts.param.period')}</span>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="1"
                                        value={period}
                                        onChange={(e) => setPeriod(e.target.value)}
                                        className="num h-11 rounded-[11px] border border-line bg-page px-3 text-[15px] font-semibold text-foreground outline-none focus-visible:border-brand"
                                    />
                                </label>
                            )}

                            {drawing && (
                                <div className="flex flex-col gap-2">
                                    <span className="form-label">{tx(lang, 'alertModal.target')}</span>
                                    <span className="flex h-12 items-center gap-2 rounded-[11px] border border-line bg-page px-3">
                                        <span className="mono text-faint">{currency}</span>
                                        <span className="num text-lg font-semibold text-foreground">
                                            {lineNow == null ? tx(lang, 'alertModal.noPrice') : formatPrice(lineNow, currency)}
                                        </span>
                                    </span>
                                    <span className="text-[12.5px] text-faint">{tx(lang, 'alertModal.drawingDesc')}</span>
                                    {drawnCondition === 'DRAWING_TOUCH' && (
                                        <label className="flex flex-col gap-2 pt-1">
                                            <span className="form-label">{tx(lang, 'alertModal.band')}</span>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                step="0.05"
                                                min={DRAWING_BAND.min}
                                                max={DRAWING_BAND.max}
                                                value={band}
                                                onChange={(e) => setBand(e.target.value)}
                                                className="num h-11 rounded-[11px] border border-line bg-page px-3 text-[15px] font-semibold text-foreground outline-none focus-visible:border-brand"
                                            />
                                        </label>
                                    )}
                                </div>
                            )}

                            {!drawing && <label className="flex flex-col gap-2">
                                <span className="form-label">{tx(lang, 'alertModal.target')}</span>
                                <span className="flex h-12 items-center gap-2 rounded-[11px] border border-line bg-page px-3 focus-within:border-brand">
                                    {isPriceRule && <span className="mono text-faint">{currency}</span>}
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        step={isPriceRule ? '0.01' : '1'}
                                        min="1"
                                        required
                                        autoFocus
                                        value={targetPrice}
                                        onChange={(e) => setTargetPrice(e.target.value)}
                                        className="num w-full bg-transparent text-lg font-semibold text-foreground outline-none"
                                    />
                                    {condition === 'VOLUME_SPIKE' && <span className="text-faint">×</span>}
                                </span>
                                <span className={cn('num text-[12.5px]', alreadyMet ? 'text-warn' : 'text-faint')}>
                                    {!isPriceRule
                                        ? ''
                                        : !hasPrice
                                            ? tx(lang, 'alertModal.noPrice')
                                            : alreadyMet
                                                ? tx(lang, condition === 'ABOVE' ? 'alertModal.alreadyAbove' : 'alertModal.alreadyBelow')
                                                : [
                                                    tx(lang, 'alertModal.now').replace('{p}', formatPrice(currentPrice!, currency)),
                                                    ...(distance === null ? [] : [tx(lang, 'alertModal.away').replace('{n}', `${distance > 0 ? '+' : ''}${distance.toFixed(2)}`)]),
                                                ].join(' · ')}
                                </span>
                            </label>}

                            <button type="submit" disabled={loading || (drawing ? lineNow == null : !(target > 0))} className="btn btn-primary h-11">
                                {loading ? tx(lang, 'alertModal.setting') : tx(lang, 'alertModal.set')}
                            </button>
                        </form>
                </div>
            </DialogContent>
        </Dialog>
    );
}

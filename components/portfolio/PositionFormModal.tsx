"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { addPosition } from "@/lib/actions/portfolio.actions";
import { toast } from "sonner";
import { tx, type Lang } from "@/lib/i18n";

export interface PositionDraft {
    symbol: string;
    company: string;
    quantity: number;
    averageCost: number;
}

interface PositionFormModalProps {
    lang: Lang;
    /** Present when editing an existing position; absent when adding a new one. */
    initial?: PositionDraft;
    children: React.ReactNode;
    onSaved?: () => void;
}

const ERROR_KEYS = {
    invalidSymbol: 'pf.errSymbol',
    invalidQuantity: 'pf.errQuantity',
    invalidCost: 'pf.errCost',
    full: 'pf.errFull',
    failed: 'pf.errFailed',
} as const;

export default function PositionFormModal({ lang, initial, children, onSaved }: PositionFormModalProps) {
    const editing = !!initial;
    const [open, setOpen] = useState(false);
    const [symbol, setSymbol] = useState(initial?.symbol ?? '');
    const [company, setCompany] = useState(initial?.company ?? '');
    const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : '');
    const [averageCost, setAverageCost] = useState(initial ? String(initial.averageCost) : '');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const onOpenChange = (next: boolean) => {
        setOpen(next);
        if (next) {
            setSymbol(initial?.symbol ?? '');
            setCompany(initial?.company ?? '');
            setQuantity(initial ? String(initial.quantity) : '');
            setAverageCost(initial ? String(initial.averageCost) : '');
            setError(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const result = await addPosition({ symbol, company, quantity, averageCost });
            if (result && 'error' in result) {
                setError(tx(lang, ERROR_KEYS[result.error as keyof typeof ERROR_KEYS] ?? 'pf.errFailed'));
                return;
            }
            toast.success(tx(lang, editing ? 'pf.edit' : 'pf.add'));
            setOpen(false);
            onSaved?.();
        } catch (err) {
            console.error(err);
            setError(tx(lang, 'pf.errFailed'));
        } finally {
            setLoading(false);
        }
    };

    const canSubmit = symbol.trim() !== '' && quantity.trim() !== '' && averageCost.trim() !== '' && !loading;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[420px] gap-5" closeLabel={tx(lang, 'dialog.close')}>
                <div>
                    <p className="kicker text-brand-ink">{tx(lang, 'pf.title')}</p>
                    <DialogTitle className="mt-1 text-xl font-bold tracking-tight">
                        {tx(lang, editing ? 'pf.editTitle' : 'pf.addTitle')}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-[13px] text-faint">
                        {tx(lang, 'pf.positionsSub')}
                    </DialogDescription>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <label className="flex flex-col gap-2">
                        <span className="form-label">{tx(lang, 'pf.formSymbol')}</span>
                        <input
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                            disabled={editing}
                            required
                            dir="ltr"
                            placeholder={tx(lang, 'pf.formSymbolPlaceholder')}
                            className="mono h-11 w-full rounded-[11px] border border-line bg-page px-3 font-semibold text-foreground outline-none focus:border-brand disabled:opacity-60"
                        />
                    </label>

                    <label className="flex flex-col gap-2">
                        <span className="form-label">{tx(lang, 'pf.formCompany')}</span>
                        <input
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            placeholder={tx(lang, 'pf.formCompanyPlaceholder')}
                            className="h-11 w-full rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand"
                        />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-2">
                            <span className="form-label">{tx(lang, 'pf.formQuantity')}</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                required
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="num h-11 w-full rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand"
                            />
                        </label>
                        <label className="flex flex-col gap-2">
                            <span className="form-label">{tx(lang, 'pf.formCost')}</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                required
                                value={averageCost}
                                onChange={(e) => setAverageCost(e.target.value)}
                                className="num h-11 w-full rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand"
                            />
                        </label>
                    </div>

                    {error && <p role="alert" className="text-[13px] text-warn">{error}</p>}

                    <button type="submit" disabled={!canSubmit} className="btn btn-primary h-11">
                        {loading ? tx(lang, 'pf.saving') : tx(lang, 'pf.save')}
                    </button>
                </form>
            </DialogContent>
        </Dialog>
    );
}

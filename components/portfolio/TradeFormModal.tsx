"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { recordTrade } from "@/lib/actions/portfolio.actions";
import { toast } from "sonner";
import { tx, type Lang } from "@/lib/i18n";

interface TradeFormModalProps {
    lang: Lang;
    /** Pre-fills the symbol when opened from a position row. */
    symbol?: string;
    company?: string;
    children: React.ReactNode;
    onSaved?: () => void;
}

const ERROR_KEYS = {
    invalidSymbol: 'pf.errSymbol',
    invalidSide: 'pf.errSide',
    invalidQuantity: 'pf.errQuantity',
    invalidPrice: 'pf.errPrice',
    invalidFee: 'pf.errFee',
    invalidDate: 'pf.errDate',
    full: 'pf.errTradesFull',
    failed: 'pf.errFailed',
} as const;

const today = () => new Date().toISOString().slice(0, 10);

export default function TradeFormModal({ lang, symbol: initialSymbol, company: initialCompany, children, onSaved }: TradeFormModalProps) {
    const [open, setOpen] = useState(false);
    const [symbol, setSymbol] = useState(initialSymbol ?? '');
    const [company, setCompany] = useState(initialCompany ?? '');
    const [side, setSide] = useState<'buy' | 'sell'>('buy');
    const [quantity, setQuantity] = useState('');
    const [price, setPrice] = useState('');
    const [fee, setFee] = useState('');
    const [tradedAt, setTradedAt] = useState(today());
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const onOpenChange = (next: boolean) => {
        setOpen(next);
        if (next) {
            setSymbol(initialSymbol ?? '');
            setCompany(initialCompany ?? '');
            setSide('buy');
            setQuantity('');
            setPrice('');
            setFee('');
            setTradedAt(today());
            setNote('');
            setError(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const result = await recordTrade({ symbol, company, side, quantity, price, fee, tradedAt, note });
            if (result && 'error' in result) {
                setError(tx(lang, ERROR_KEYS[result.error as keyof typeof ERROR_KEYS] ?? 'pf.errFailed'));
                return;
            }
            toast.success(tx(lang, 'pf.tradeSaved'));
            setOpen(false);
            onSaved?.();
        } catch (err) {
            console.error(err);
            setError(tx(lang, 'pf.errFailed'));
        } finally {
            setLoading(false);
        }
    };

    const canSubmit = symbol.trim() !== '' && quantity.trim() !== '' && price.trim() !== '' && !loading;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[460px] gap-5" closeLabel={tx(lang, 'dialog.close')}>
                <div>
                    <p className="kicker text-brand-ink">{tx(lang, 'pf.ledger')}</p>
                    <DialogTitle className="mt-1 text-xl font-bold tracking-tight">{tx(lang, 'pf.addTradeTitle')}</DialogTitle>
                    <DialogDescription className="mt-1 text-[13px] text-faint">{tx(lang, 'pf.addTradeSub')}</DialogDescription>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-2 rounded-[11px] border border-line bg-page p-1">
                        {(['buy', 'sell'] as const).map((option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => setSide(option)}
                                aria-pressed={side === option}
                                className={`h-9 rounded-[8px] text-[13px] font-semibold transition-colors ${
                                    side === option
                                        ? option === 'buy'
                                            ? 'bg-up/15 text-up'
                                            : 'bg-down/15 text-down'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {tx(lang, option === 'buy' ? 'pf.buy' : 'pf.sell')}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-2">
                            <span className="form-label">{tx(lang, 'pf.formSymbol')}</span>
                            <input
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                required
                                dir="ltr"
                                placeholder={tx(lang, 'pf.formSymbolPlaceholder')}
                                className="mono h-11 w-full rounded-[11px] border border-line bg-page px-3 font-semibold text-foreground outline-none focus:border-brand"
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
                    </div>

                    <div className="grid grid-cols-3 gap-3">
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
                            <span className="form-label">{tx(lang, 'pf.formPrice')}</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                required
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                className="num h-11 w-full rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand"
                            />
                        </label>
                        <label className="flex flex-col gap-2">
                            <span className="form-label">{tx(lang, 'pf.formFee')}</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                value={fee}
                                onChange={(e) => setFee(e.target.value)}
                                placeholder="0"
                                className="num h-11 w-full rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand"
                            />
                        </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-2">
                            <span className="form-label">{tx(lang, 'pf.formDate')}</span>
                            <input
                                type="date"
                                value={tradedAt}
                                max={today()}
                                onChange={(e) => setTradedAt(e.target.value)}
                                className="num h-11 w-full rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand"
                            />
                        </label>
                        <label className="flex flex-col gap-2">
                            <span className="form-label">{tx(lang, 'pf.formNote')}</span>
                            <input
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                maxLength={200}
                                placeholder={tx(lang, 'pf.formNotePlaceholder')}
                                className="h-11 w-full rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand"
                            />
                        </label>
                    </div>

                    {error && <p role="alert" className="text-[13px] text-warn">{error}</p>}

                    <button type="submit" disabled={!canSubmit} className="btn btn-primary h-11">
                        {loading ? tx(lang, 'pf.saving') : tx(lang, 'pf.saveTrade')}
                    </button>
                </form>
            </DialogContent>
        </Dialog>
    );
}

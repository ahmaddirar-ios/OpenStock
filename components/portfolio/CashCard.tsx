"use client";

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Plus, Wallet, X } from 'lucide-react';
import Panel from '@/components/Panel';
import Price from '@/components/Price';
import { setCashBalance } from '@/lib/actions/portfolio.actions';
import { normalizeCurrency } from '@/lib/portfolio';
import { tx, arDigits, type Lang } from '@/lib/i18n';
import { toast } from 'sonner';

type Invested = { currency: string; marketValue: number; costBasis: number };
type Cash = { currency: string; amount: number };

const SUGGESTED = ['SAR', 'USD', 'AED', 'EUR', 'GBP'];

/**
 * Cash and buying power, one currency at a time. Equity is cash plus what the holdings are worth on
 * the same currency — the two are never added across currencies, because that would need an FX rate
 * the app does not keep.
 */
export default function CashCard({
    balances,
    invested,
    lang,
}: {
    balances: Cash[];
    invested: Invested[];
    lang: Lang;
}) {
    const router = useRouter();
    const [editing, setEditing] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [newCurrency, setNewCurrency] = useState('USD');
    const [newAmount, setNewAmount] = useState('');

    const rows = useMemo(() => {
        const codes = [...new Set([...invested.map((entry) => entry.currency), ...balances.map((entry) => entry.currency)])];
        return codes.map((raw) => {
            const currency = normalizeCurrency(raw);
            const cash = balances.find((entry) => normalizeCurrency(entry.currency) === currency)?.amount ?? 0;
            const held = invested.find((entry) => normalizeCurrency(entry.currency) === currency);
            const marketValue = held?.marketValue ?? 0;
            return { currency, cash, marketValue, equity: cash + marketValue };
        });
    }, [balances, invested]);

    const missingCodes = SUGGESTED.filter((code) => !rows.some((row) => row.currency === code));

    const save = async (currency: string, amount: string) => {
        setBusy(currency);
        try {
            const result = await setCashBalance(currency, amount);
            if (result && 'error' in result) {
                toast.error(tx(lang, 'pf.cashErr'));
                return;
            }
            toast.success(tx(lang, 'pf.cashSaved'));
            setEditing(null);
            setDraft('');
            setAdding(false);
            setNewAmount('');
            router.refresh();
        } catch {
            toast.error(tx(lang, 'pf.cashErr'));
        } finally {
            setBusy(null);
        }
    };

    return (
        <Panel title={tx(lang, 'pf.cashTitle')} sub={tx(lang, 'pf.cashSub')} className="self-start">
            <div className="flex flex-col gap-3 px-3.5 py-3">
                {rows.length === 0 ? (
                    <p className="text-[13px] text-faint">{tx(lang, 'pf.cashEmpty')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead>
                                <tr className="text-faint">
                                    <th className="py-1 text-start font-medium">{tx(lang, 'pf.currency')}</th>
                                    <th className="py-1 text-end font-medium">{tx(lang, 'pf.cash')}</th>
                                    <th className="py-1 text-end font-medium">{tx(lang, 'pf.investedValue')}</th>
                                    <th className="py-1 text-end font-medium">{tx(lang, 'pf.totalEquity')}</th>
                                    <th className="w-[56px]" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.currency} className="border-t border-line align-middle">
                                        <td className="py-1.5 text-start font-semibold text-foreground" dir="ltr">{row.currency}</td>
                                        <td className="py-1.5 text-end">
                                            {editing === row.currency ? (
                                                <input
                                                    value={draft}
                                                    onChange={(event) => setDraft(event.target.value)}
                                                    inputMode="decimal"
                                                    autoFocus
                                                    aria-label={`${tx(lang, 'pf.cash')} ${row.currency}`}
                                                    className="num h-7 w-24 rounded-full bg-page px-2 text-end text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none"
                                                />
                                            ) : (
                                                <span className="num font-semibold text-foreground">
                                                    <Price value={row.cash} currency={row.currency} lang={lang} />
                                                </span>
                                            )}
                                        </td>
                                        <td className="num py-1.5 text-end text-muted-foreground">
                                            <Price value={row.marketValue} currency={row.currency} lang={lang} />
                                        </td>
                                        <td className="num py-1.5 text-end font-semibold text-foreground">
                                            <Price value={row.equity} currency={row.currency} lang={lang} />
                                        </td>
                                        <td className="py-1.5">
                                            {editing === row.currency ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => void save(row.currency, draft)}
                                                        disabled={busy === row.currency}
                                                        className="icon-btn"
                                                        aria-label={tx(lang, 'pf.save')}
                                                        title={tx(lang, 'pf.save')}
                                                    >
                                                        <Check className="size-3.5" />
                                                    </button>
                                                    <button type="button" onClick={() => setEditing(null)} className="icon-btn" aria-label={tx(lang, 'pf.cancel')} title={tx(lang, 'pf.cancel')}>
                                                        <X className="size-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setEditing(row.currency); setDraft(String(row.cash || '')); }}
                                                        className="icon-btn"
                                                        aria-label={`${tx(lang, 'pf.edit')} ${row.currency} ${tx(lang, 'pf.cash')}`}
                                                        title={tx(lang, 'pf.edit')}
                                                    >
                                                        <Pencil className="size-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <p className="text-[11.5px] leading-relaxed text-faint">{tx(lang, 'pf.buyingPowerNote')}</p>

                {adding ? (
                    <div className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1">
                            <span className="form-label">{tx(lang, 'pf.currency')}</span>
                            <select
                                aria-label={tx(lang, 'pf.currency')}
                                value={newCurrency}
                                onChange={(event) => setNewCurrency(event.target.value)}
                                className="h-8 rounded-[9px] border border-line bg-page px-2 text-[12px] text-foreground outline-none focus:border-brand"
                            >
                                {(missingCodes.length ? missingCodes : SUGGESTED).map((code) => (
                                    <option key={code} value={code}>{code}</option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="form-label">{tx(lang, 'pf.cash')}</span>
                            <input
                                value={newAmount}
                                onChange={(event) => setNewAmount(event.target.value)}
                                inputMode="decimal"
                                aria-label={tx(lang, 'pf.addCash')}
                                className="num h-8 w-28 rounded-[9px] border border-line bg-page px-2 text-[12px] text-foreground outline-none focus:border-brand"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => void save(newCurrency, newAmount)}
                            disabled={busy === newCurrency}
                            className="btn btn-primary h-8 px-2.5 text-[12px]"
                        >
                            <Check /> {tx(lang, 'pf.save')}
                        </button>
                        <button type="button" onClick={() => setAdding(false)} className="btn btn-ghost h-8 px-2.5 text-[12px]">
                            {tx(lang, 'pf.cancel')}
                        </button>
                    </div>
                ) : (
                    <button type="button" onClick={() => setAdding(true)} className="pill h-8 w-fit px-3 hover:bg-hover hover:text-foreground">
                        <Plus /> {tx(lang, 'pf.addCash')}
                    </button>
                )}

                <div className="flex items-center gap-1.5 border-t border-line pt-2 text-[11.5px] text-faint">
                    <Wallet className="size-3.5" />
                    <span className="num">
                        {tx(lang, 'pf.buyingPower')}: {rows.length === 0 ? '—' : rows.map((row) => `${arDigits(row.cash.toLocaleString('en-US', { maximumFractionDigits: 2 }), lang)} ${row.currency}`).join(' · ')}
                    </span>
                </div>
            </div>
        </Panel>
    );
}

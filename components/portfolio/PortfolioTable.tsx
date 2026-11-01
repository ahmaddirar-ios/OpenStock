"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Wallet } from "lucide-react";
import Panel from "@/components/Panel";
import Price from "@/components/Price";
import ChangePill from "@/components/ChangePill";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { computePositionMetrics, positionWeight, summarizePortfolio, type PortfolioTotals } from "@/lib/portfolio";
import { deletePosition } from "@/lib/actions/portfolio.actions";
import { tx, arDigits, type Lang } from "@/lib/i18n";
import { saudiSymbolNameAr } from "@/lib/saudi-symbols";
import { toast } from "sonner";
import PositionFormModal, { type PositionDraft } from "./PositionFormModal";

export type PortfolioRow = {
    symbol: string;
    company: string;
    quantity: number;
    averageCost: number;
    price: number;
    change: number;
    changePercent: number;
    currency: string;
    logo?: string;
};

const num = (value: number, lang: Lang, digits = 2) =>
    arDigits(value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }), lang);

type ValuedRow = PortfolioRow & { metrics: ReturnType<typeof computePositionMetrics> };

export default function PortfolioTable({ initialRows, lang }: { initialRows: PortfolioRow[]; lang: Lang }) {
    const router = useRouter();
    const [rows, setRows] = useState(initialRows);
    const live = useLiveQuotes(rows.map((r) => r.symbol));

    // A server re-render (after add, edit or delete) replaces the local copy.
    useEffect(() => setRows(initialRows), [initialRows]);

    const valued: ValuedRow[] = rows.map((row) => {
        const q = live[row.symbol];
        const price = q?.c ?? row.price;
        const change = q?.d ?? row.change;
        return {
            ...row,
            price,
            change,
            changePercent: q?.dp ?? row.changePercent,
            metrics: computePositionMetrics({ quantity: row.quantity, averageCost: row.averageCost, price, change }),
        };
    });

    // Currencies are never added together: a SAR total and a USD total mean different money.
    // Totals and weights are grouped per currency, so no headline number silently mixes them.
    const byCurrency = new Map<string, ValuedRow[]>();
    for (const row of valued) {
        const currency = row.currency || 'USD';
        if (!byCurrency.has(currency)) byCurrency.set(currency, []);
        byCurrency.get(currency)!.push(row);
    }
    const groups = [...byCurrency.entries()].map(([currency, list]) => ({
        currency,
        list,
        totals: summarizePortfolio(list.map((r) => r.metrics)),
    }));
    const multiCurrency = groups.length > 1;

    const handleRemove = async (symbol: string) => {
        if (!window.confirm(tx(lang, 'pf.confirmRemove'))) return;
        const result = await deletePosition(symbol);
        if (result && 'error' in result) {
            toast.error(tx(lang, 'pf.errFailed'));
            return;
        }
        setRows((current) => current.filter((r) => r.symbol !== symbol));
        router.refresh();
    };

    const summaryCards = (currency: string, totals: PortfolioTotals) => {
        const tone = (v: number) => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-foreground');
        return [
            { label: tx(lang, 'pf.totalValue'), node: <Price value={totals.marketValue} currency={currency} lang={lang} />, tone: 'text-foreground' },
            {
                label: tx(lang, 'pf.totalPnl'),
                node: (
                    <span className="inline-flex flex-wrap items-baseline gap-2">
                        <Price value={totals.unrealizedPnl} currency={currency} lang={lang} />
                        <span className={tone(totals.unrealizedPnl)}>
                            {totals.unrealizedPnl > 0 ? '+' : ''}{num(totals.unrealizedPnlPercent, lang)}%
                        </span>
                    </span>
                ),
                tone: tone(totals.unrealizedPnl),
            },
            { label: tx(lang, 'pf.invested'), node: <Price value={totals.costBasis} currency={currency} lang={lang} />, tone: 'text-foreground' },
            { label: tx(lang, 'pf.dayPnl'), node: <Price value={totals.dayChangeValue} currency={currency} lang={lang} />, tone: tone(totals.dayChangeValue) },
        ];
    };

    return (
        <>
            {groups.length > 0 && (
                <div className="flex flex-col gap-3">
                    {groups.map(({ currency, totals }) => (
                        <div key={currency}>
                            {multiCurrency && <p className="kicker mb-1.5 text-faint" dir="ltr">{currency}</p>}
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {summaryCards(currency, totals).map((card) => (
                                    <section key={card.label} className="card p-4">
                                        <p className="kicker text-faint">{card.label}</p>
                                        <p className={`num mt-2 text-xl font-bold tracking-tight ${card.tone}`}>{card.node}</p>
                                    </section>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
                <Panel title={tx(lang, 'pf.positions')} sub={tx(lang, 'pf.positionsSub')}>
                    {valued.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-icon"><Wallet className="size-5" /></span>
                            <h3>{tx(lang, 'pf.empty')}</h3>
                            <p className="max-w-sm">{tx(lang, 'pf.emptySub')}</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-[14px]">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>{tx(lang, 'pf.company')}</th>
                                        <th className="is-num">{tx(lang, 'pf.quantity')}</th>
                                        <th className="is-num">{tx(lang, 'pf.avgCost')}</th>
                                        <th className="is-num">{tx(lang, 'pf.price')}</th>
                                        <th className="is-num">{tx(lang, 'pf.marketValue')}</th>
                                        <th className="is-num">{tx(lang, 'pf.pnl')}</th>
                                        <th className="is-num">{tx(lang, 'pf.dayChange')}</th>
                                        <th className="is-num">{tx(lang, 'pf.weight')}</th>
                                        <th className="w-[96px]"><span className="sr-only">{tx(lang, 'pf.actions')}</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groups.flatMap(({ list, totals }) =>
                                        list.map((row) => {
                                            const company = (lang === 'ar' ? saudiSymbolNameAr(row.symbol) : null) ?? row.company;
                                            const draft: PositionDraft = { symbol: row.symbol, company: row.company, quantity: row.quantity, averageCost: row.averageCost };
                                            return (
                                                <tr key={row.symbol}>
                                                    <td className="max-w-[280px]">
                                                        <Link href={`/stocks/${row.symbol}`} className="group flex items-center gap-3">
                                                            {row.logo ? (
                                                                <span className="logo-well"><img src={row.logo} alt="" className="size-full object-contain p-1" /></span>
                                                            ) : (
                                                                <span className="logo-well is-empty">{row.symbol[0]}</span>
                                                            )}
                                                            <span className="min-w-0">
                                                                <span dir="auto" className="block truncate font-semibold text-foreground group-hover:text-brand-ink transition-colors" title={company}>{company}</span>
                                                                <span dir="ltr" className="mono block text-[12px] text-faint">{row.symbol}</span>
                                                            </span>
                                                        </Link>
                                                    </td>
                                                    <td className="is-num text-muted-foreground">{num(row.quantity, lang, 0)}</td>
                                                    <td className="is-num text-muted-foreground"><Price value={row.averageCost} currency={row.currency} lang={lang} /></td>
                                                    <td className="is-num font-semibold text-foreground">{row.metrics.priced ? <Price value={row.price} currency={row.currency} lang={lang} /> : '—'}</td>
                                                    <td className="is-num font-semibold text-foreground">{row.metrics.priced ? <Price value={row.metrics.marketValue} currency={row.currency} lang={lang} /> : '—'}</td>
                                                    <td className="is-num">
                                                        {row.metrics.priced ? (
                                                            <span className="inline-flex items-center justify-end gap-2">
                                                                <span className={row.metrics.unrealizedPnl > 0 ? 'text-up' : row.metrics.unrealizedPnl < 0 ? 'text-down' : 'text-muted-foreground'}>
                                                                    <Price value={row.metrics.unrealizedPnl} currency={row.currency} lang={lang} />
                                                                </span>
                                                                <ChangePill value={row.metrics.unrealizedPnlPercent} lang={lang} />
                                                            </span>
                                                        ) : (
                                                            <span className="text-faint">{tx(lang, 'pf.unpriced')}</span>
                                                        )}
                                                    </td>
                                                    <td className="is-num"><ChangePill value={row.metrics.priced ? row.changePercent : null} lang={lang} /></td>
                                                    <td className="is-num text-muted-foreground">{num(positionWeight(row.metrics.marketValue, totals.marketValue) * 100, lang, 1)}%</td>
                                                    <td>
                                                        <div className="flex items-center justify-end gap-1">
                                                            <PositionFormModal lang={lang} initial={draft} onSaved={() => router.refresh()}>
                                                                <button type="button" className="icon-btn" title={tx(lang, 'pf.edit')} aria-label={tx(lang, 'pf.edit')}>
                                                                    <Pencil />
                                                                </button>
                                                            </PositionFormModal>
                                                            <button type="button" className="icon-btn" onClick={() => handleRemove(row.symbol)} title={tx(lang, 'pf.remove')} aria-label={tx(lang, 'pf.remove')}>
                                                                <Trash2 />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>

                <Panel title={tx(lang, 'pf.allocation')} sub={tx(lang, 'pf.allocationSub')} className="self-start">
                    {valued.length === 0 ? (
                        <p className="px-3.5 py-3 text-[13px] text-faint">{tx(lang, 'pf.emptySub')}</p>
                    ) : (
                        groups.map(({ currency, list, totals }) => (
                            <div key={currency}>
                                {multiCurrency && <p className="side-label" dir="ltr">{currency}</p>}
                                <ul className="row-list">
                                    {[...list]
                                        .sort((a, b) => b.metrics.marketValue - a.metrics.marketValue)
                                        .map((row) => {
                                            const weight = positionWeight(row.metrics.marketValue, totals.marketValue);
                                            return (
                                                <li key={row.symbol} className="flex items-center gap-3 px-3.5 py-3">
                                                    <span className="w-16 shrink-0 mono text-[12px] text-faint" dir="ltr">{row.symbol}</span>
                                                    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-hover">
                                                        <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(2, Math.round(weight * 100))}%` }} />
                                                    </span>
                                                    <span className="num w-14 shrink-0 text-end text-[12.5px] text-muted-foreground">{num(weight * 100, lang, 1)}%</span>
                                                </li>
                                            );
                                        })}
                                </ul>
                            </div>
                        ))
                    )}
                </Panel>
            </div>
        </>
    );
}

"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import Panel from "@/components/Panel";
import Price from "@/components/Price";
import ChangePill from "@/components/ChangePill";
import { deleteTrade, importTradesCsv, type TradeRecord } from "@/lib/actions/portfolio.actions";
import { tradesToCsv, type RealizedSale } from "@/lib/portfolio-ledger";
import { tx, arDigits, type Lang } from "@/lib/i18n";
import { toast } from "sonner";
import TradeFormModal from "./TradeFormModal";

const num = (value: number, lang: Lang, digits = 2) =>
    arDigits(value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }), lang);

const dateLabel = (iso: string, lang: Lang) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return arDigits(
        date.toLocaleDateString(lang === 'ar' ? 'ar-u-nu-arab' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        lang
    );
};

export default function TradeLedger({
    trades,
    sales,
    realized,
    warnings,
    currency,
    currencyBySymbol,
    lang,
}: {
    trades: TradeRecord[];
    sales: RealizedSale[];
    /** Realised profit per currency: a SAR profit and a USD profit are never summed. */
    realized: { currency: string; value: number }[];
    warnings: string[];
    /** The header currency, used only when the ledger has no realised sale to name its own. */
    currency: string;
    currencyBySymbol: Record<string, string>;
    lang: Lang;
}) {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [showAll, setShowAll] = useState(false);

    const visible = showAll ? trades : trades.slice(-12).reverse();
    const tone = (value: number) => (value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-foreground');

    const handleDelete = async (id: string) => {
        if (!window.confirm(tx(lang, 'pf.confirmDeleteTrade'))) return;
        const result = await deleteTrade(id);
        if (result && 'error' in result) {
            toast.error(tx(lang, 'pf.errFailed'));
            return;
        }
        router.refresh();
    };

    const handleExport = () => {
        const blob = new Blob([tradesToCsv(trades)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'openstock-trades.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = async (file: File) => {
        setBusy(true);
        try {
            const text = await file.text();
            const result = await importTradesCsv(text);
            if (!result.ok) {
                toast.error(tx(lang, result.reason === 'tooMany' ? 'pf.importTooMany' : 'pf.importFailed'));
                return;
            }
            if (result.imported === 0) {
                toast.error(tx(lang, 'pf.importNone'));
                return;
            }
            toast.success(tx(lang, 'pf.importDone').replace('{n}', arDigits(result.imported, lang)));
            if (result.skipped > 0) {
                toast.message(tx(lang, 'pf.importSkipped').replace('{n}', arDigits(result.skipped, lang)));
            }
            router.refresh();
        } catch (error) {
            console.error(error);
            toast.error(tx(lang, 'pf.importFailed'));
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <Panel
                title={tx(lang, 'pf.ledger')}
                sub={tx(lang, 'pf.ledgerSub').replace('{n}', arDigits(trades.length, lang))}
                action={
                    <div className="flex flex-wrap items-center gap-1.5">
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="sr-only"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleImport(file);
                            }}
                        />
                        <button type="button" className="btn btn-ghost h-8 px-2.5 text-[12px]" onClick={() => fileRef.current?.click()} disabled={busy}>
                            <Upload /> {tx(lang, 'pf.import')}
                        </button>
                        <button type="button" className="btn btn-ghost h-8 px-2.5 text-[12px]" onClick={handleExport} disabled={trades.length === 0}>
                            <Download /> {tx(lang, 'pf.export')}
                        </button>
                        <TradeFormModal lang={lang} onSaved={() => router.refresh()}>
                            <button type="button" className="btn btn-primary h-8 px-2.5 text-[12px]">
                                <Plus /> {tx(lang, 'pf.addTrade')}
                            </button>
                        </TradeFormModal>
                    </div>
                }
            >
                {trades.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon"><Plus className="size-5" /></span>
                        <h3>{tx(lang, 'pf.ledgerEmpty')}</h3>
                        <p className="max-w-md">{tx(lang, 'pf.ledgerEmptySub')}</p>
                    </div>
                ) : (
                    <>
                        <div className="grid gap-3 border-b border-line px-3.5 py-3 sm:grid-cols-3">
                            <div>
                                <p className="kicker text-faint">{tx(lang, 'pf.realized')}</p>
                                <p className="num mt-1 flex flex-wrap items-baseline gap-x-2 text-lg font-bold">
                                    {realized.length === 0 ? (
                                        <Price value={0} currency={currency} lang={lang} />
                                    ) : (
                                        realized.map((entry) => (
                                            <span key={entry.currency} className={tone(entry.value)}>
                                                <Price value={entry.value} currency={entry.currency} lang={lang} />
                                            </span>
                                        ))
                                    )}
                                </p>
                            </div>
                            <div>
                                <p className="kicker text-faint">{tx(lang, 'pf.closedTrades')}</p>
                                <p className="num mt-1 text-lg font-bold text-foreground">{arDigits(sales.length, lang)}</p>
                            </div>
                            <div>
                                <p className="kicker text-faint">{tx(lang, 'pf.winRate')}</p>
                                <p className="num mt-1 text-lg font-bold text-foreground">
                                    {sales.length === 0
                                        ? '—'
                                        : `${num((sales.filter((s) => s.pnl > 0).length / sales.length) * 100, lang, 0)}%`}
                                </p>
                            </div>
                        </div>

                        {warnings.length > 0 && (
                            <p className="border-b border-line px-3.5 py-2 text-[12px] text-warn" dir="auto">
                                {warnings.slice(0, 3).join(' · ')}
                            </p>
                        )}

                        <div className="overflow-x-auto rounded-[14px]">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>{tx(lang, 'pf.formDate')}</th>
                                        <th>{tx(lang, 'pf.company')}</th>
                                        <th>{tx(lang, 'pf.side')}</th>
                                        <th className="is-num">{tx(lang, 'pf.quantity')}</th>
                                        <th className="is-num">{tx(lang, 'pf.formPrice')}</th>
                                        <th className="is-num">{tx(lang, 'pf.formFee')}</th>
                                        <th className="w-[52px]"><span className="sr-only">{tx(lang, 'pf.actions')}</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((trade) => (
                                        <tr key={trade.id}>
                                            <td className="num whitespace-nowrap text-muted-foreground">{dateLabel(trade.tradedAt, lang)}</td>
                                            <td className="max-w-[220px]">
                                                <span dir="auto" className="block truncate font-semibold text-foreground">{trade.company || trade.symbol}</span>
                                                <span dir="ltr" className="mono block text-[12px] text-faint">{trade.symbol}</span>
                                            </td>
                                            <td>
                                                <span className={`pill ${trade.side === 'buy' ? 'is-up' : 'is-down'}`}>
                                                    {tx(lang, trade.side === 'buy' ? 'pf.buy' : 'pf.sell')}
                                                </span>
                                            </td>
                                            <td className="is-num text-muted-foreground">{num(trade.quantity, lang, 0)}</td>
                                            <td className="is-num font-semibold text-foreground"><Price value={trade.price} currency={currencyBySymbol[trade.symbol] ?? currency} lang={lang} /></td>
                                            <td className="is-num text-muted-foreground">{trade.fee > 0 ? <Price value={trade.fee} currency={currencyBySymbol[trade.symbol] ?? currency} lang={lang} /> : '—'}</td>
                                            <td>
                                                <div className="flex justify-end">
                                                    <button
                                                        type="button"
                                                        className="icon-btn"
                                                        onClick={() => handleDelete(trade.id)}
                                                        title={tx(lang, 'pf.remove')}
                                                        aria-label={tx(lang, 'pf.remove')}
                                                    >
                                                        <Trash2 />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {trades.length > 12 && (
                            <div className="flex justify-center border-t border-line px-3.5 py-2.5">
                                <button type="button" className="btn btn-ghost h-8 px-3 text-[12px]" onClick={() => setShowAll((v) => !v)}>
                                    {tx(lang, showAll ? 'pf.showLess' : 'pf.showAll')}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </Panel>

            {sales.length > 0 && (
                <Panel title={tx(lang, 'pf.realizedTrades')} sub={tx(lang, 'pf.realizedTradesSub')}>
                    <div className="overflow-x-auto rounded-[14px]">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>{tx(lang, 'pf.formDate')}</th>
                                    <th>{tx(lang, 'pf.company')}</th>
                                    <th className="is-num">{tx(lang, 'pf.quantity')}</th>
                                    <th className="is-num">{tx(lang, 'pf.proceeds')}</th>
                                    <th className="is-num">{tx(lang, 'pf.costBasis')}</th>
                                    <th className="is-num">{tx(lang, 'pf.realized')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sales.slice(0, 20).map((sale, index) => (
                                    <tr key={`${sale.symbol}-${sale.tradedAt}-${index}`}>
                                        <td className="num whitespace-nowrap text-muted-foreground">{dateLabel(sale.tradedAt, lang)}</td>
                                        <td className="max-w-[220px]">
                                            <span dir="auto" className="block truncate font-semibold text-foreground">{sale.company}</span>
                                            <span dir="ltr" className="mono block text-[12px] text-faint">{sale.symbol}</span>
                                        </td>
                                        <td className="is-num text-muted-foreground">{num(sale.quantity, lang, 0)}</td>
                                        <td className="is-num text-muted-foreground"><Price value={sale.proceeds} currency={currencyBySymbol[sale.symbol] ?? currency} lang={lang} /></td>
                                        <td className="is-num text-muted-foreground"><Price value={sale.cost} currency={currencyBySymbol[sale.symbol] ?? currency} lang={lang} /></td>
                                        <td className="is-num">
                                            <span className="inline-flex items-center justify-end gap-2">
                                                <span className={tone(sale.pnl)}><Price value={sale.pnl} currency={currencyBySymbol[sale.symbol] ?? currency} lang={lang} /></span>
                                                <ChangePill value={sale.pnlPercent} lang={lang} />
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}
        </div>
    );
}

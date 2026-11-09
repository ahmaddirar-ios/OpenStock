"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Download, Pencil, Search, Star, Upload } from "lucide-react";
import CreateAlertModal from "./CreateAlertModal";
import WatchlistItemModal from "./WatchlistItemModal";
import WatchlistButton from "@/components/WatchlistButton";
import ChangePill from "@/components/ChangePill";
import PriceFlash from "@/components/PriceFlash";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { SearchButton } from "@/components/SearchCommand";
import { formatNumber } from "@/lib/utils";
import { alertSource } from "@/lib/alerts";
import { tx, type Lang } from "@/lib/i18n";
import { arDigits } from "@/lib/i18n";
import { saudiSymbolNameAr } from "@/lib/market/saudi-symbols";
import { DEFAULT_GROUP, groupNames, normalizeGroup, watchlistToCsv, type WatchlistMeta } from "@/lib/watchlist";
import { importWatchlistCsv, type WatchlistItemRecord } from "@/lib/actions/watchlist.actions";
import type { getWatchlistData } from "@/lib/actions/finnhub.actions";
import Price from "@/components/Price";
import { toast } from "sonner";

type Row = Awaited<ReturnType<typeof getWatchlistData>>[number];
const SUGGESTIONS = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN'];

export default function WatchlistTable({
    initialRows,
    items,
    lang,
}: {
    initialRows: Row[];
    items: WatchlistItemRecord[];
    lang: Lang;
}) {
    const router = useRouter();
    const [baseRows, setBaseRows] = useState(initialRows);
    const [meta, setMeta] = useState(items);
    const [group, setGroup] = useState<string>('all');
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const live = useLiveQuotes(baseRows.map((r) => r.symbol));

    // Server re-renders (after add/remove) replace the local copy
    useEffect(() => setBaseRows(initialRows), [initialRows]);
    useEffect(() => setMeta(items), [items]);

    const metaBySymbol = useMemo(() => new Map(meta.map((item) => [item.symbol, item])), [meta]);
    const groups = useMemo(() => groupNames(meta), [meta]);

    const rows = baseRows.map((r) => {
        const q = live[r.symbol];
        return q?.c ? { ...r, price: q.c, change: q.d ?? r.change, changePercent: q.dp ?? r.changePercent } : r;
    });

    const visible = group === 'all' ? rows : rows.filter((row) => normalizeGroup(metaBySymbol.get(row.symbol)?.group) === group);

    const handleExport = () => {
        const payload: WatchlistMeta[] = rows.map((row) => {
            const item = metaBySymbol.get(row.symbol);
            return {
                symbol: row.symbol,
                company: item?.company || row.name,
                group: normalizeGroup(item?.group),
                note: item?.note ?? '',
                tags: item?.tags ?? [],
            };
        });
        const blob = new Blob([watchlistToCsv(payload)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'openstock-watchlist.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = async (file: File) => {
        setBusy(true);
        try {
            const result = await importWatchlistCsv(await file.text());
            if (!result.ok) {
                toast.error(tx(lang, result.reason === 'tooMany' ? 'wl.importTooMany' : 'wl.importFailed'));
                return;
            }
            if (result.imported === 0 && result.updated === 0) {
                toast.error(tx(lang, 'wl.importNone'));
                return;
            }
            toast.success(
                tx(lang, 'wl.importDone')
                    .replace('{n}', arDigits(result.imported, lang))
                    .replace('{u}', arDigits(result.updated, lang))
            );
            if (result.skipped > 0) toast.message(tx(lang, 'wl.importSkipped').replace('{n}', arDigits(result.skipped, lang)));
            router.refresh();
        } catch (error) {
            console.error(error);
            toast.error(tx(lang, 'wl.importFailed'));
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    if (rows.length === 0) {
        return (
            <div className="empty-state">
                <span className="empty-icon"><Star className="size-5" /></span>
                <h3>{tx(lang, 'wl.empty')}</h3>
                <p className="max-w-sm">{tx(lang, 'wl.emptySub')}</p>
                <SearchButton className="btn btn-primary mt-3"><Search /> {tx(lang, 'wl.search')}</SearchButton>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                    {SUGGESTIONS.map((s) => (
                        <Link key={s} href={`/stocks/${s}`} dir="ltr" className="pill mono h-7 px-3 hover:bg-hover hover:text-foreground">{s}</Link>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3.5 py-2.5">
                <button
                    type="button"
                    onClick={() => setGroup('all')}
                    aria-pressed={group === 'all'}
                    className={`pill h-7 px-2.5 text-[12px] ${group === 'all' ? 'is-brand' : 'hover:bg-hover hover:text-foreground'}`}
                >
                    {tx(lang, 'wl.allGroups')} <span className="num opacity-70">{arDigits(rows.length, lang)}</span>
                </button>
                {groups.map((name) => {
                    const count = meta.filter((item) => normalizeGroup(item.group) === name).length;
                    return (
                        <button
                            key={name}
                            type="button"
                            onClick={() => setGroup(name)}
                            aria-pressed={group === name}
                            className={`pill h-7 px-2.5 text-[12px] ${group === name ? 'is-brand' : 'hover:bg-hover hover:text-foreground'}`}
                        >
                            <span dir="auto">{name}</span> <span className="num opacity-70">{arDigits(count, lang)}</span>
                        </button>
                    );
                })}
                <span className="ms-auto flex items-center gap-1.5">
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
                    <button type="button" className="btn btn-ghost h-7 px-2 text-[12px]" onClick={() => fileRef.current?.click()} disabled={busy}>
                        <Upload /> {tx(lang, 'wl.import')}
                    </button>
                    <button type="button" className="btn btn-ghost h-7 px-2 text-[12px]" onClick={handleExport}>
                        <Download /> {tx(lang, 'wl.export')}
                    </button>
                </span>
            </div>

            {visible.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-[13px] text-faint">{tx(lang, 'wl.groupEmpty')}</p>
            ) : (
                <div className="overflow-x-auto rounded-[14px]">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{tx(lang, 'wl.company')}</th>
                                <th className="is-num">{tx(lang, 'wl.price')}</th>
                                <th className="is-num">{tx(lang, 'wl.today')}</th>
                                <th className="is-num">{tx(lang, 'wl.change')}</th>
                                <th className="is-num">{tx(lang, 'wl.mcap')}</th>
                                <th className="w-[120px]"><span className="sr-only">{tx(lang, 'wl.actions')}</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((row) => {
                                // The Saudi table carries the Arabic name; the quote feed is English-only.
                                const company = (lang === 'ar' ? saudiSymbolNameAr(row.symbol) : null) ?? row.name;
                                const item = metaBySymbol.get(row.symbol);
                                const itemGroup = normalizeGroup(item?.group);
                                return (
                                    <tr key={row.symbol}>
                                        <td className="max-w-[320px]">
                                            <Link href={`/stocks/${row.symbol}`} className="group flex items-center gap-3">
                                                {row.logo ? (
                                                    <span className="logo-well"><img src={row.logo} alt="" className="size-full object-contain p-1" /></span>
                                                ) : (
                                                    <span className="logo-well is-empty">{row.symbol[0]}</span>
                                                )}
                                                <span className="min-w-0">
                                                    <span dir="auto" className="block truncate font-semibold text-foreground group-hover:text-brand-ink transition-colors" title={company}>{company}</span>
                                                    <span className="flex flex-wrap items-center gap-1.5">
                                                        <span dir="ltr" className="mono block text-[12px] text-faint">{row.symbol}</span>
                                                        {itemGroup !== DEFAULT_GROUP && <span className="pill is-brand text-[10px]" dir="auto">{itemGroup}</span>}
                                                        {(item?.tags ?? []).slice(0, 3).map((tag) => (
                                                            <span key={tag} className="pill text-[10px]" dir="ltr">#{tag}</span>
                                                        ))}
                                                    </span>
                                                    {item?.note && (
                                                        <span dir="auto" className="mt-0.5 block truncate text-[11.5px] text-muted-foreground" title={item.note}>{item.note}</span>
                                                    )}
                                                </span>
                                            </Link>
                                        </td>
                                        <td className="is-num font-semibold text-foreground">
                                            <PriceFlash value={row.price} className="px-1">{row.price ? <Price value={row.price} currency={row.currency} lang={lang} /> : '—'}</PriceFlash>
                                        </td>
                                        <td className="is-num"><ChangePill value={row.price ? row.changePercent : null} lang={lang} /></td>
                                        <td className="is-num text-muted-foreground">{row.price ? `${row.change > 0 ? '+' : ''}${arDigits(row.change.toFixed(2), lang)}` : '—'}</td>
                                        <td className="is-num text-muted-foreground">{row.marketCap ? formatNumber(row.marketCap, lang) : '—'}</td>
                                        <td>
                                            <div className="flex items-center justify-end gap-1">
                                                <WatchlistItemModal
                                                    lang={lang}
                                                    item={{
                                                        symbol: row.symbol,
                                                        company: item?.company || row.name,
                                                        group: itemGroup,
                                                        note: item?.note ?? '',
                                                        tags: item?.tags ?? [],
                                                    }}
                                                    groups={groups}
                                                    onSaved={() => router.refresh()}
                                                >
                                                    <button type="button" className="icon-btn" title={tx(lang, 'wl.organise')} aria-label={tx(lang, 'wl.organise')}>
                                                        <Pencil />
                                                    </button>
                                                </WatchlistItemModal>
                                                {alertSource(row.symbol) ? (
                                                    <CreateAlertModal symbol={row.symbol} currentPrice={row.price} currency={row.currency} lang={lang}>
                                                        <button type="button" className="icon-btn" title={`Set a price alert for ${row.symbol}`} aria-label={`Set a price alert for ${row.symbol}`}>
                                                            <Bell />
                                                        </button>
                                                    </CreateAlertModal>
                                                ) : (
                                                    <span className="icon-btn opacity-40" title={tx(lang, 'alert.tooltipUnpriced')}><Bell /></span>
                                                )}
                                                <WatchlistButton
                                                    symbol={row.symbol}
                                                    company={row.name}
                                                    isInWatchlist
                                                    variant="icon"
                                                    lang={lang}
                                                    onWatchlistChange={(sym, added) => {
                                                        if (!added) setBaseRows((current) => current.filter((r) => r.symbol !== sym));
                                                    }}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

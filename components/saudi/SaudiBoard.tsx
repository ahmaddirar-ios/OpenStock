'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Activity } from "lucide-react";
import ChangePill from "@/components/ChangePill";
import Price from "@/components/Price";
import DataFreshness from "@/components/DataFreshness";
import { isQuoteLive } from "@/lib/market-data";
import { saudiSymbolNameAr } from "@/lib/saudi-symbols";
import { sectorLabel, tx, arDigits, type Lang } from "@/lib/i18n";
import type { SaudiBoardPayload } from "@/lib/saudi-board";
import type { SaudiQuote } from "@/lib/tradingview-scanner";

const compact = (value: number) =>
    value >= 1e9 ? `${(value / 1e9).toFixed(1)}B` : value >= 1e6 ? `${(value / 1e6).toFixed(0)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(0)}K` : `${Math.round(value)}`;

const appHref = (symbol: string) => `/stocks/${encodeURIComponent(symbol)}`;

const nameFor = (quote: SaudiQuote, lang: Lang) => (lang === 'ar' ? saudiSymbolNameAr(quote.symbol) ?? quote.name : quote.name);
const ticker = (symbol: string) => symbol.replace('.SR', '');

/** One ranked list: symbol, name, price, change. Ranking is done on the server; this only draws it. */
function QuoteList({ rows, lang, tone }: { rows: SaudiQuote[]; lang: Lang; tone: 'up' | 'down' | 'flat' }) {
    if (rows.length === 0) return <p className="px-1 py-6 text-[13px] text-faint">{tx(lang, 'saudi.empty')}</p>;
    return (
        <ul className="flex flex-col">
            {rows.map((quote) => (
                <li key={quote.symbol}>
                    <Link href={appHref(quote.symbol)} className="flex items-center gap-3 rounded-lg px-1.5 py-2 transition-colors hover:bg-hover/60">
                        <span className={`bento-ico size-7 shrink-0 ${tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-red-400' : ''}`}>
                            {tone === 'up' ? <ArrowUpRight className="size-3.5" /> : tone === 'down' ? <ArrowDownRight className="size-3.5" /> : <Activity className="size-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold">{nameFor(quote, lang)}</span>
                            <span className="mono block text-[11px] text-faint">{ticker(quote.symbol)}</span>
                        </span>
                        <span className="text-end">
                            <span className="num block text-[13px]"><Price value={quote.price} currency="SAR" lang={lang} /></span>
                            <span className="num block text-[11px] text-faint"><ChangePill value={quote.changePercent} lang={lang} /></span>
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}

export default function SaudiBoard({ initial, lang }: { initial: SaudiBoardPayload; lang: Lang }) {
    const [board, setBoard] = useState(initial);

    // Poll while Riyadh is trading, exactly at the pace the server is willing to refresh.
    useEffect(() => {
        if (!isQuoteLive(['2222.SR'])) return;
        let cancelled = false;
        const load = async () => {
            if (document.visibilityState !== 'visible') return;
            try {
                const res = await fetch('/api/saudi/market');
                if (res.ok && !cancelled) setBoard(await res.json());
            } catch { /* keep the last good board */ }
        };
        const onVisible = () => { if (document.visibilityState === 'visible') load(); };
        const id = setInterval(load, 60_000);
        document.addEventListener('visibilitychange', onVisible);
        return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
    }, []);

    const { index, breadth, total } = board;
    const up = total > 0 ? (breadth.advancers / total) * 100 : 0;
    const down = total > 0 ? (breadth.decliners / total) * 100 : 0;

    return (
        <div className="flex flex-col gap-3">
            {board.stale && (
                <p role="status" className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
                    {tx(lang, 'saudi.stale')}
                </p>
            )}
            {/* The index, then the breadth of the whole market under it. */}
            <div className="bento grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                <div className="bento-tile">
                    <div className="bento-head">
                        <span className="bento-ico"><Activity /></span>
                        <span className="truncate">{tx(lang, 'saudi.tasi')}</span>
                        <span className="mono ms-auto text-xs text-faint">TASI</span>
                    </div>
                    <p className="bento-value self-start num">
                        {index ? arDigits(index.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), lang) : '—'}
                    </p>
                    <div className="bento-foot">
                        <ChangePill value={index?.changePercent} lang={lang} />
                        <DataFreshness tradeTime={Math.floor(board.asOf / 1000)} delayed lang={lang} />
                    </div>
                </div>

                <div className="bento-tile">
                    <div className="bento-head">
                        <span className="bento-ico"><Activity /></span>
                        <span className="truncate">{tx(lang, 'saudi.breadth')}</span>
                        <span className="mono ms-auto text-xs text-faint">{arDigits(total, lang)} {tx(lang, 'saudi.companies')}</span>
                    </div>
                    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/10">
                        <span className="h-full bg-emerald-400" style={{ width: `${up}%` }} />
                        <span className="h-full bg-red-400" style={{ width: `${down}%` }} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div>
                            <p className="num text-[18px] font-bold text-emerald-400">{arDigits(breadth.advancers, lang)}</p>
                            <p className="text-[11px] text-faint">{tx(lang, 'saudi.advancers')}</p>
                        </div>
                        <div>
                            <p className="num text-[18px] font-bold">{arDigits(breadth.unchanged, lang)}</p>
                            <p className="text-[11px] text-faint">{tx(lang, 'saudi.unchanged')}</p>
                        </div>
                        <div>
                            <p className="num text-[18px] font-bold text-red-400">{arDigits(breadth.decliners, lang)}</p>
                            <p className="text-[11px] text-faint">{tx(lang, 'saudi.decliners')}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bento grid gap-3 lg:grid-cols-3">
                <div className="bento-tile">
                    <div className="bento-head"><ArrowUpRight className="size-4 text-emerald-400" /><span className="truncate">{tx(lang, 'saudi.gainers')}</span></div>
                    <QuoteList rows={board.gainers} lang={lang} tone="up" />
                </div>
                <div className="bento-tile">
                    <div className="bento-head"><ArrowDownRight className="size-4 text-red-400" /><span className="truncate">{tx(lang, 'saudi.losers')}</span></div>
                    <QuoteList rows={board.losers} lang={lang} tone="down" />
                </div>
                <div className="bento-tile">
                    <div className="bento-head"><Activity className="size-4" /><span className="truncate">{tx(lang, 'saudi.active')}</span></div>
                    {board.active.length === 0
                        ? <p className="px-1 py-6 text-[13px] text-faint">{tx(lang, 'saudi.empty')}</p>
                        : (
                            <ul className="flex flex-col">
                                {board.active.map(({ quote, value }) => (
                                    <li key={quote.symbol}>
                                        <Link href={appHref(quote.symbol)} className="flex items-center gap-3 rounded-lg px-1.5 py-2 transition-colors hover:bg-hover/60">
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[13px] font-semibold">{nameFor(quote, lang)}</span>
                                                <span className="mono block text-[11px] text-faint">{ticker(quote.symbol)}</span>
                                            </span>
                                            <span className="text-end">
                                                <span className="num block text-[13px]">{compact(value)} <span className="text-[10px] text-faint">SAR</span></span>
                                                <span className="num block text-[11px] text-faint"><ChangePill value={quote.changePercent} lang={lang} /></span>
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                </div>
            </div>

            {/* Sectors, busiest first: the ones that explain the index. */}
            <div className="bento-tile">
                <div className="bento-head"><span className="truncate">{tx(lang, 'saudi.sectors')}</span><span className="ms-auto text-[11px] text-faint">{tx(lang, 'saudi.avgChange')}</span></div>
                <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="text-start text-[11px] uppercase tracking-wide text-faint">
                                <th className="py-2 text-start font-semibold">{tx(lang, 'saudi.sector')}</th>
                                <th className="py-2 text-end font-semibold">{tx(lang, 'saudi.companies')}</th>
                                <th className="py-2 text-end font-semibold">{tx(lang, 'saudi.value')}</th>
                                <th className="py-2 text-end font-semibold">{tx(lang, 'saudi.avgChange')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {board.sectors.map((row) => (
                                <tr key={row.sector} className="border-t border-white/5">
                                    <td className="py-2 pe-2">{sectorLabel(lang, row.sector)}</td>
                                    <td className="num py-2 text-end text-faint">{arDigits(row.count, lang)}</td>
                                    <td className="num py-2 text-end text-faint">{compact(row.valueTraded)}</td>
                                    <td className="num py-2 text-end"><ChangePill value={row.avgChange} lang={lang} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

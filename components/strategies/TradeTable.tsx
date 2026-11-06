'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download } from 'lucide-react';
import { toCsv, type Trade } from '@/lib/strategies';
import { tx, arDigits, type Lang } from '@/lib/i18n';
import { num, pct } from '@/components/strategies/format';
import { cn } from '@/lib/utils';

const PAGE = 50;

type SortKey = 'entry' | 'pnl' | 'bars' | 'reason';

/** The trade log: sortable, paged, and exportable — the evidence behind every metric above it. */
export default function TradeTable({ trades, lang, fileStem }: { trades: Trade[]; lang: Lang; fileStem: string }) {
    const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'entry', dir: 'desc' });
    const [page, setPage] = useState(0);

    const sorted = useMemo(() => {
        const value = (trade: Trade) =>
            sort.key === 'entry' ? trade.entryTime : sort.key === 'pnl' ? trade.pnl : sort.key === 'bars' ? trade.bars : trade.reason;
        const list = [...trades].sort((a, b) => {
            const av = value(a);
            const bv = value(b);
            if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv));
            return av - bv;
        });
        return sort.dir === 'asc' ? list : list.reverse();
    }, [trades, sort]);

    const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
    const current = Math.min(page, pages - 1);
    const rows = sorted.slice(current * PAGE, current * PAGE + PAGE);

    const header = (key: SortKey, label: string) => (
        <th scope="col" className="px-2 py-1.5 text-start font-medium">
            <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-fg"
                onClick={() => {
                    setSort((state) => ({ key, dir: state.key === key && state.dir === 'desc' ? 'asc' : 'desc' }));
                    setPage(0);
                }}
            >
                {label}
                {sort.key === key && (sort.dir === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
            </button>
        </th>
    );

    const download = () => {
        const blob = new Blob([toCsv(sorted, lang)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileStem}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <section className="card flex flex-col">
            <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                <h3 className="text-[13px] font-semibold">{tx(lang, 'strat.log.title')}</h3>
                <span className="num text-[11.5px] text-faint">{arDigits(String(trades.length), lang)}</span>
                <button type="button" onClick={download} disabled={trades.length === 0} className="pill ms-auto h-7 gap-1.5 px-2.5 text-[11.5px] disabled:opacity-40">
                    <Download className="size-3.5" /> {tx(lang, 'strat.log.csv')}
                </button>
            </header>

            {trades.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12.5px] text-faint">{tx(lang, 'strat.log.empty')}</p>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] border-collapse text-[12px]">
                            <thead className="text-[11px] uppercase text-faint">
                                <tr className="border-b border-line">
                                    {header('entry', tx(lang, 'strat.log.date'))}
                                    <th scope="col" className="px-2 py-1.5 text-start font-medium">{tx(lang, 'strat.log.entry')}</th>
                                    <th scope="col" className="px-2 py-1.5 text-start font-medium">{tx(lang, 'strat.log.exit')}</th>
                                    {header('pnl', tx(lang, 'strat.log.pnl'))}
                                    <th scope="col" className="px-2 py-1.5 text-start font-medium">{tx(lang, 'strat.log.pnlPct')}</th>
                                    {header('bars', tx(lang, 'strat.log.bars'))}
                                    {header('reason', tx(lang, 'strat.log.reason'))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((trade) => (
                                    <tr key={`${trade.entryIndex}-${trade.exitIndex}`} className="border-b border-line/60 last:border-0">
                                        <td className="mono px-2 py-1.5 text-[11.5px] text-muted-foreground" dir="ltr">
                                            {new Date(trade.entryTime * 1000).toISOString().slice(0, 10)}
                                        </td>
                                        <td className="num px-2 py-1.5" dir="ltr">{num(trade.entryPrice, lang)}</td>
                                        <td className="num px-2 py-1.5" dir="ltr">
                                            {num(trade.exitPrice, lang)}
                                            <span className="mono ms-1 text-[10.5px] text-faint">
                                                {new Date(trade.exitTime * 1000).toISOString().slice(0, 10)}
                                            </span>
                                        </td>
                                        <td className={cn('num px-2 py-1.5', trade.pnl >= 0 ? 'text-up' : 'text-down')} dir="ltr">
                                            {num(trade.pnl, lang)}
                                        </td>
                                        <td className={cn('num px-2 py-1.5', trade.pnlPct >= 0 ? 'text-up' : 'text-down')} dir="ltr">
                                            {pct(trade.pnlPct / 100, lang)}
                                        </td>
                                        <td className="num px-2 py-1.5 text-muted-foreground" dir="ltr">{arDigits(String(trade.bars), lang)}</td>
                                        <td className="px-2 py-1.5">
                                            <span className={cn('pill h-5 px-1.5 text-[10.5px]', trade.reason === 'signal' && 'text-muted-foreground', trade.reason === 'stop' && 'text-down', trade.reason === 'target' && 'text-up', trade.reason === 'trail' && 'text-warn')}>
                                                {tx(lang, `strat.reason.${trade.reason}` as const)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {pages > 1 && (
                        <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2 text-[11.5px] text-faint">
                            <button type="button" className="pill h-7 px-2.5" disabled={current === 0} onClick={() => setPage(current - 1)}>
                                {tx(lang, 'strat.log.prev')}
                            </button>
                            <span className="num">
                                {tx(lang, 'strat.log.page')
                                    .replace('{a}', arDigits(String(current + 1), lang))
                                    .replace('{b}', arDigits(String(pages), lang))}
                            </span>
                            <button type="button" className="pill h-7 px-2.5" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                                {tx(lang, 'strat.log.next')}
                            </button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

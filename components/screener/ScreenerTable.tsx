"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Download, FlaskConical, RefreshCw, X } from "lucide-react";
import Price from "@/components/Price";
import ChangePill from "@/components/ChangePill";
import { sectorLabel } from "@/lib/i18n";
import { criteriaToQuery, filterRows, sortRows, toCsv, type ScreenerCriteria, type ScreenerRow, type ScreenerSortKey, type SortDirection } from "@/lib/screener";
import { tx, arDigits, type Lang, type StringKey } from "@/lib/i18n";
import { MAX_SCREEN_SYMBOLS, screenBatches } from "@/lib/screener-formula";
import { checkFormula, describeFormulaError } from "@/lib/formula";
import { screenFormula } from "@/lib/actions/screener.actions";
import { CANDLE_INTERVALS } from "@/lib/yahoo-candles";
import { INTERVAL_LABEL_KEYS } from "@/lib/chart-grid";
import { toast } from "sonner";
import { runRefresh, type RefreshState } from "./runRefresh";

type Form = {
    q: string;
    market: string;
    sector: string;
    index: string;
    min: string;
    max: string;
    minValue: string;
    minMcap: string;
    maxPe: string;
};

const numberOrNull = (value: string): number | null => {
    const t = value.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
};

const COLUMNS: { key: ScreenerSortKey; label: StringKey; numeric?: boolean }[] = [
    { key: 'name', label: 'scr.company' },
    { key: 'sector', label: 'scr.sector' },
    { key: 'price', label: 'scr.price', numeric: true },
    { key: 'change', label: 'scr.change', numeric: true },
    { key: 'value', label: 'scr.value', numeric: true },
    { key: 'marketCap', label: 'scr.mcap', numeric: true },
    { key: 'pe', label: 'scr.pe', numeric: true },
];

// Billions and millions the way a trader reads them, in whatever language the interface is in.
// The one example the formula filter offers: it reads as a sentence and returns 0 or 1, which is
// exactly what the screen wants from a formula.
const SCREEN_EXAMPLE = 'close > sma(close, 50) and volume > sma(volume, 20)';

const compact = (value: number) => (value >= 1e9 ? `${(value / 1e9).toFixed(1)}B` : value >= 1e6 ? `${(value / 1e6).toFixed(0)}M` : value > 0 ? `${Math.round(value / 1e3)}K` : '—');

export default function ScreenerTable({ rows, criteria, sectors, total, lang }: {
    rows: ScreenerRow[];
    criteria: ScreenerCriteria;
    sectors: string[];
    total: number;
    lang: Lang;
}) {
    const router = useRouter();
    const [form, setForm] = useState<Form>({
        q: criteria.q,
        market: criteria.market,
        sector: criteria.sector,
        index: criteria.index,
        min: criteria.minChange === null ? '' : String(criteria.minChange),
        max: criteria.maxChange === null ? '' : String(criteria.maxChange),
        minValue: criteria.minValue === null ? '' : String(criteria.minValue),
        minMcap: criteria.minMarketCap === null ? '' : String(criteria.minMarketCap),
        maxPe: criteria.maxPe === null ? '' : String(criteria.maxPe),
    });
    const [sortKey, setSortKey] = useState<ScreenerSortKey>('symbol');
    const [sortDir, setSortDir] = useState<SortDirection>('asc');
    const [refresh, setRefresh] = useState<RefreshState>({ done: 0, total: 0, priced: 0, running: false });
    // The formula filter is the one criterion that has to run: it reads history, not the snapshot.
    const [formula, setFormula] = useState('');
    const [formulaInterval, setFormulaInterval] = useState('1d');
    const [screen, setScreen] = useState<{ running: boolean; done: number; total: number } | null>(null);
    const [matches, setMatches] = useState<Map<string, number | null> | null>(null);

    const activeCriteria: ScreenerCriteria = useMemo(() => ({
        q: form.q,
        market: form.market === 'us' || form.market === 'sa' ? form.market : 'all',
        sector: form.sector,
        index: form.index === 'SP500' || form.index === 'NDX100' ? form.index : 'all',
        minChange: numberOrNull(form.min),
        maxChange: numberOrNull(form.max),
        minValue: numberOrNull(form.minValue),
        minMarketCap: numberOrNull(form.minMcap),
        maxPe: numberOrNull(form.maxPe),
    }), [form]);

    // Keep the address bar in step, so a filtered screen can be shared or bookmarked.
    useEffect(() => {
        const query = criteriaToQuery(activeCriteria);
        router.replace(query ? `/screener?${query}` : '/screener', { scroll: false });
    }, [activeCriteria, router]);

    const narrowed = useMemo(() => filterRows(rows, activeCriteria), [rows, activeCriteria]);
    const results = useMemo(() => {
        const base = sortRows(narrowed, sortKey, sortDir);
        return matches ? base.filter((row) => matches.has(row.symbol)) : base;
    }, [narrowed, sortKey, sortDir, matches]);

    const formulaCheck = useMemo(() => (formula.trim() ? checkFormula(formula) : null), [formula]);
    const formulaError = formulaCheck && !formulaCheck.ok ? describeFormulaError(formulaCheck.error, lang) : null;
    const screened = narrowed.slice(0, MAX_SCREEN_SYMBOLS);
    const capped = narrowed.length > MAX_SCREEN_SYMBOLS;

    const runScreen = async () => {
        if (!formula.trim() || formulaError || screen?.running) return;
        setScreen({ running: true, done: 0, total: screened.length });
        setMatches(null);
        const hit = new Map<string, number | null>();
        let done = 0;
        try {
            for (const batch of screenBatches(screened.map((row) => row.symbol))) {
                const hits = await screenFormula(batch, formula.trim(), formulaInterval);
                for (const entry of hits) if (entry.match) hit.set(entry.symbol, entry.value);
                done += batch.length;
                setScreen({ running: true, done, total: screened.length });
            }
            setMatches(hit);
        } catch (error) {
            console.error(error);
            toast.error(tx(lang, 'scr.formulaFailed'));
            setMatches(hit);
        } finally {
            setScreen(null);
        }
    };

    const clearScreen = () => {
        setMatches(null);
        setFormula('');
    };

    const toggleSort = (key: ScreenerSortKey) => {
        if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortKey(key); setSortDir('asc'); }
    };

    const exportCsv = () => {
        const blob = new Blob([toCsv(results)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'openstock-screener.csv';
        a.click();
        URL.revokeObjectURL(url);
        toast.success(tx(lang, 'scr.exported'));
    };

    const onRefresh = async () => {
        if (refresh.running) return;
        setRefresh({ done: 0, total, priced: 0, running: true });
        await runRefresh(setRefresh);
        router.refresh();
    };

    const companyLabel = (row: ScreenerRow) => (lang === 'ar' ? row.nameAr : null) ?? row.name;
    const marketLabel = (row: ScreenerRow) => (row.market === 'sa' ? tx(lang, 'scr.sa') : tx(lang, 'scr.us'));

    return (
        <>
            <div className="card flex flex-wrap items-end gap-3 p-4">
                <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                    <span className="form-label">{tx(lang, 'scr.search')}</span>
                    <input
                        value={form.q}
                        onChange={(e) => setForm((f) => ({ ...f, q: e.target.value }))}
                        placeholder={tx(lang, 'scr.searchPlaceholder')}
                        className="h-10 w-full rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand"
                    />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="form-label">{tx(lang, 'scr.market')}</span>
                    <select value={form.market} onChange={(e) => setForm((f) => ({ ...f, market: e.target.value }))} className="h-10 rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand">
                        <option value="all">{tx(lang, 'scr.all')}</option>
                        <option value="us">{tx(lang, 'scr.us')}</option>
                        <option value="sa">{tx(lang, 'scr.sa')}</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="form-label">{tx(lang, 'scr.sector')}</span>
                    <select value={form.sector} onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))} className="h-10 max-w-[220px] rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand">
                        <option value="">{tx(lang, 'scr.anySector')}</option>
                        {sectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="form-label">{tx(lang, 'scr.index')}</span>
                    <select value={form.index} onChange={(e) => setForm((f) => ({ ...f, index: e.target.value }))} className="h-10 rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand">
                        <option value="all">{tx(lang, 'scr.all')}</option>
                        <option value="SP500">S&amp;P 500</option>
                        <option value="NDX100">Nasdaq-100</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="form-label">{tx(lang, 'scr.minChange')}</span>
                    <input type="number" step="any" value={form.min} onChange={(e) => setForm((f) => ({ ...f, min: e.target.value }))} placeholder="%" className="num h-10 w-20 rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand" />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="form-label">{tx(lang, 'scr.maxChange')}</span>
                    <input type="number" step="any" value={form.max} onChange={(e) => setForm((f) => ({ ...f, max: e.target.value }))} placeholder="%" className="num h-10 w-20 rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand" />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="form-label">{tx(lang, 'scr.minValue')}</span>
                    <input type="number" step="any" value={form.minValue} onChange={(e) => setForm((f) => ({ ...f, minValue: e.target.value }))} placeholder={tx(lang, 'scr.millions')} className="num h-10 w-24 rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand" />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="form-label">{tx(lang, 'scr.minMcap')}</span>
                    <input type="number" step="any" value={form.minMcap} onChange={(e) => setForm((f) => ({ ...f, minMcap: e.target.value }))} placeholder={tx(lang, 'scr.millions')} className="num h-10 w-24 rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand" />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="form-label">{tx(lang, 'scr.maxPe')}</span>
                    <input type="number" step="any" value={form.maxPe} onChange={(e) => setForm((f) => ({ ...f, maxPe: e.target.value }))} placeholder="P/E" className="num h-10 w-20 rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand" />
                </label>
            </div>

            <div className="card flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-end gap-2">
                    <label className="flex min-w-[240px] flex-1 flex-col gap-1.5">
                        <span className="form-label flex items-center gap-1.5">
                            <FlaskConical className="size-3.5 text-brand" /> {tx(lang, 'scr.formula')}
                        </span>
                        <input
                            value={formula}
                            onChange={(e) => setFormula(e.target.value)}
                            placeholder={tx(lang, 'scr.formulaPlaceholder')}
                            dir="ltr"
                            spellCheck={false}
                            className="mono h-10 w-full rounded-[11px] border border-line bg-page px-3 text-[13px] text-foreground outline-none focus:border-brand"
                        />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="form-label">{tx(lang, 'scr.formulaInterval')}</span>
                        <select value={formulaInterval} onChange={(e) => setFormulaInterval(e.target.value)} className="h-10 rounded-[11px] border border-line bg-page px-3 text-foreground outline-none focus:border-brand">
                            {CANDLE_INTERVALS.map((interval) => (
                                <option key={interval.id} value={interval.id}>{tx(lang, INTERVAL_LABEL_KEYS[interval.id] ?? 'chart.tf.1d')}</option>
                            ))}
                        </select>
                    </label>
                    <button
                        type="button"
                        onClick={() => void runScreen()}
                        disabled={!formula.trim() || formulaError !== null || screen !== null || narrowed.length === 0}
                        className="btn btn-primary h-10 px-3.5 text-[13px] disabled:opacity-50"
                    >
                        {screen ? tx(lang, 'scr.formulaRunning') : tx(lang, 'scr.formulaApply')}
                    </button>
                    {(matches || formula) && (
                        <button type="button" onClick={clearScreen} className="pill h-10 px-3">
                            <X /> {tx(lang, 'scr.formulaClear')}
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                    {formulaError ? (
                        <span className="text-down">{formulaError}</span>
                    ) : matches ? (
                        <span className="num text-muted-foreground">
                            {tx(lang, 'scr.formulaMatched').replace('{n}', arDigits(String(matches.size), lang)).replace('{total}', arDigits(String(screened.length), lang))}
                        </span>
                    ) : (
                        <span className="text-faint">{tx(lang, 'scr.formulaNote')}</span>
                    )}
                    {screen && (
                        <span className="num text-faint">
                            {arDigits(String(screen.done), lang)} / {arDigits(String(screen.total), lang)}
                        </span>
                    )}
                    {capped && <span className="text-warn">{tx(lang, 'scr.formulaCapped').replace('{n}', arDigits(String(MAX_SCREEN_SYMBOLS), lang))}</span>}
                    <span className="text-faint">{tx(lang, 'scr.formulaExample')}</span>
                    <button
                        type="button"
                        onClick={() => setFormula(SCREEN_EXAMPLE)}
                        className="mono rounded-[4px] bg-page px-1.5 py-0.5 text-[10.5px] text-brand hover:underline"
                        dir="ltr"
                    >
                        {SCREEN_EXAMPLE}
                    </button>
                </div>
            </div>

            <section className="hatch">
                <div className="section-head">
                    <div className="min-w-0">
                        <h2 className="section-title">{tx(lang, 'scr.results')}</h2>
                        <p className="section-sub num">
                            {arDigits(results.length, lang)} {tx(lang, 'scr.of')} {arDigits(rows.length, lang)} · {tx(lang, 'scr.coverage').replace('{n}', arDigits(total, lang))}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={onRefresh} disabled={refresh.running} className="pill h-8 px-3 hover:bg-hover hover:text-foreground disabled:opacity-50">
                            <RefreshCw className={refresh.running ? 'animate-spin' : ''} /> {tx(lang, refresh.running ? 'scr.refreshing' : 'scr.refresh')}
                        </button>
                        <button type="button" onClick={exportCsv} disabled={results.length === 0} className="pill h-8 px-3 hover:bg-hover hover:text-foreground disabled:opacity-50">
                            <Download /> {tx(lang, 'scr.export')}
                        </button>
                    </div>
                </div>
                <div className="card overflow-x-auto rounded-[14px]">
                    <table className="data-table">
                        <thead>
                            <tr>
                                {COLUMNS.map((col) => (
                                    <th key={col.key} className={col.numeric ? 'is-num' : undefined} aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                        <button type="button" onClick={() => toggleSort(col.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                                            {tx(lang, col.label)}
                                            {sortKey === col.key ? (sortDir === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />) : null}
                                        </button>
                                    </th>
                                ))}
                                <th>{tx(lang, 'scr.exchange')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.length === 0 ? (
                                <tr><td colSpan={8} className="p-6 text-center text-[13px] text-faint">{tx(lang, 'scr.empty')}</td></tr>
                            ) : results.map((row) => (
                                <tr key={row.symbol}>
                                    <td className="max-w-[320px]">
                                        <Link href={`/stocks/${row.symbol}`} className="group block min-w-0">
                                            <span dir="auto" className="block truncate font-semibold text-foreground group-hover:text-brand-ink transition-colors">{companyLabel(row)}</span>
                                            <span dir="ltr" className="mono block text-[12px] text-faint">{row.symbol} · {marketLabel(row)}</span>
                                        </Link>
                                    </td>
                                    <td className="text-muted-foreground">{row.sector ? sectorLabel(lang, row.sector) : '—'}</td>
                                    <td className="is-num font-semibold text-foreground">{row.price > 0 ? <Price value={row.price} currency={row.currency} lang={lang} /> : '—'}</td>
                                    <td className="is-num"><ChangePill value={row.price > 0 ? row.changePercent : null} lang={lang} /></td>
                                    <td className="is-num text-muted-foreground">{row.valueTraded > 0 ? <>{arDigits(compact(row.valueTraded), lang)} <span className="text-[10px] text-faint">{row.currency}</span></> : '—'}</td>
                                    <td className="is-num text-muted-foreground">{row.marketCap > 0 ? <>{arDigits(compact(row.marketCap), lang)} <span className="text-[10px] text-faint">{row.currency}</span></> : '—'}</td>
                                    <td className="is-num text-muted-foreground">{row.peRatio != null ? arDigits(row.peRatio.toFixed(1), lang) : '—'}</td>
                                    <td className="text-muted-foreground" dir="ltr">{row.exchange}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    );
}

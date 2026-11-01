'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Play, RotateCcw } from 'lucide-react';
import { backtest, barsPerYear, DEFAULT_COSTS, metrics as computeMetrics, type Backtest, type Metrics, type Params } from '@/lib/strategies';
import { getStrategyCandles } from '@/lib/actions/yahoo-candles.actions';
import { compareYahooSymbol } from '@/lib/compare';
import { CANDLE_INTERVALS } from '@/lib/yahoo-candles';
import { INTERVAL_LABEL_KEYS } from '@/lib/chart-grid';
import type { StrategyDoc } from '@/lib/strategy-library';
import { tx, arDigits, type Lang } from '@/lib/i18n';
import KpiGrid from '@/components/strategies/KpiGrid';
import ResultCharts from '@/components/strategies/ResultCharts';
import TradeTable from '@/components/strategies/TradeTable';
import { cn } from '@/lib/utils';

type Run = {
    symbol: string;
    intervalId: string;
    bars: number;
    result: Backtest;
    metrics: Metrics;
};

const initialParams = (doc: StrategyDoc): Params => {
    const out: Params = {};
    for (const field of doc.paramFields) out[field.key] = doc.defaults[field.key];
    return out;
};

/**
 * The lab: pick a symbol, an interval, the parameters and the costs, then run the engine over a
 * deeper series than the chart keeps. Nothing is computed until the trader asks, and the previous
 * result stays on screen behind a progress line while the next one loads.
 */
export default function StrategyLab({ doc, lang, initialSymbol }: { doc: StrategyDoc; lang: Lang; initialSymbol?: string }) {
    const [symbol, setSymbol] = useState(initialSymbol ?? '2222.SR');
    const [intervalId, setIntervalId] = useState('1d');
    const [params, setParams] = useState<Params>(() => initialParams(doc));
    const [costs, setCosts] = useState({ ...DEFAULT_COSTS });
    const [riskFree, setRiskFree] = useState(0);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<'badSymbol' | 'noCandles' | null>(null);
    const [run, setRun] = useState<Run | null>(null);

    const t = (key: Parameters<typeof tx>[1]) => tx(lang, key);
    const fileStem = useMemo(() => `strategy-${doc.id}-${(run?.symbol ?? symbol).replace(/[^\w.-]/g, '')}-${run?.intervalId ?? intervalId}`, [doc.id, run, symbol, intervalId]);

    const clamp = (value: number, field: { min: number; max: number }): number =>
        Math.min(field.max, Math.max(field.min, Number.isFinite(value) ? value : field.min));

    const execute = async () => {
        const resolved = compareYahooSymbol(symbol);
        if (!resolved) {
            setError('badSymbol');
            return;
        }
        setRunning(true);
        setError(null);
        try {
            const clean: Params = {};
            for (const field of doc.paramFields) clean[field.key] = clamp(params[field.key] ?? doc.defaults[field.key], field);
            const set = await getStrategyCandles(resolved, intervalId);
            if (!set || set.candles.length < 2) {
                setError('noCandles');
                setRunning(false);
                return;
            }
            const result = backtest(set.candles, doc.id, clean, costs);
            if (!result) {
                setError('noCandles');
                setRunning(false);
                return;
            }
            const perYear = barsPerYear(intervalId);
            setRun({
                symbol: resolved,
                intervalId,
                bars: set.candles.length,
                result,
                metrics: computeMetrics(result, perYear, riskFree / 100),
            });
        } catch (cause) {
            console.error(cause);
            setError('noCandles');
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <section className="card relative overflow-hidden">
                {running && (
                    <span className="absolute inset-x-0 top-0 z-10 h-px overflow-hidden bg-line" aria-hidden="true">
                        <span className="block h-full w-1/3 animate-pulse bg-brand" />
                    </span>
                )}

                <div className="flex flex-col gap-3 p-3">
                    <div className="flex flex-wrap items-end gap-1.5">
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] text-faint">{t('strat.lab.symbol')}</span>
                            <input
                                value={symbol}
                                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                                dir="ltr"
                                className="mono h-8 w-32 rounded-[8px] bg-page px-2 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] text-faint">{t('strat.lab.interval')}</span>
                            <select
                                value={intervalId}
                                onChange={(event) => setIntervalId(event.target.value)}
                                className="h-8 rounded-[8px] bg-page px-2 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                            >
                                {CANDLE_INTERVALS.map((interval) => (
                                    <option key={interval.id} value={interval.id}>
                                        {t(INTERVAL_LABEL_KEYS[interval.id] ?? 'chart.tf.1d')}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="flex items-end gap-1.5">
                            <label className="flex flex-col gap-1">
                                <span className="text-[11px] text-faint">{t('strat.lab.commission')}</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={200}
                                    step={1}
                                    value={costs.commissionBps}
                                    onChange={(event) => setCosts((state) => ({ ...state, commissionBps: Math.max(0, Number(event.target.value) || 0) }))}
                                    dir="ltr"
                                    className="num h-8 w-20 rounded-[8px] bg-page px-2 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[11px] text-faint">{t('strat.lab.slippage')}</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={200}
                                    step={1}
                                    value={costs.slippageBps}
                                    onChange={(event) => setCosts((state) => ({ ...state, slippageBps: Math.max(0, Number(event.target.value) || 0) }))}
                                    dir="ltr"
                                    className="num h-8 w-20 rounded-[8px] bg-page px-2 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[11px] text-faint">{t('strat.lab.riskFree')}</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={30}
                                    step={0.25}
                                    value={riskFree}
                                    onChange={(event) => setRiskFree(Math.max(0, Number(event.target.value) || 0))}
                                    dir="ltr"
                                    className="num h-8 w-20 rounded-[8px] bg-page px-2 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                />
                            </label>
                        </div>

                        <button type="button" onClick={execute} disabled={running} className="btn btn-primary h-8 gap-1.5 px-3 text-[12.5px] disabled:opacity-60">
                            <Play className="size-3.5" /> {running ? t('strat.lab.running') : t('strat.lab.run')}
                        </button>
                    </div>

                    <details className="rounded-[10px] bg-page/60 px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--line)]">
                        <summary className="cursor-pointer text-[12px] text-muted-foreground">{t('strat.lab.params')}</summary>
                        <div className="mt-2 flex flex-wrap items-end gap-1.5">
                            {doc.paramFields.map((field) => (
                                <label key={field.key} className="flex flex-col gap-1">
                                    <span className="text-[11px] text-faint">{lang === 'ar' ? field.label.ar : field.label.en}</span>
                                    <input
                                        type="number"
                                        min={field.min}
                                        max={field.max}
                                        step={field.step}
                                        value={params[field.key] ?? doc.defaults[field.key]}
                                        onChange={(event) => {
                                            const next = Number(event.target.value);
                                            setParams((state) => ({ ...state, [field.key]: Number.isFinite(next) ? next : state[field.key] }));
                                        }}
                                        dir="ltr"
                                        className="num h-8 w-24 rounded-[8px] bg-page px-2 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </label>
                            ))}
                            <button type="button" onClick={() => setParams(initialParams(doc))} className="pill h-8 gap-1.5 px-2.5 text-[11.5px]">
                                <RotateCcw className="size-3.5" /> {t('strat.lab.defaults')}
                            </button>
                        </div>
                    </details>

                    {error && (
                        <p role="alert" className="text-[12.5px] text-down">
                            {error === 'badSymbol' ? t('strat.lab.badSymbol') : t('strat.lab.noCandles').replace('{s}', symbol)}
                        </p>
                    )}
                </div>
            </section>

            {run && (
                <div className="flex flex-col gap-3" aria-live="polite">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-0.5">
                        <h2 className="text-[14px] font-semibold">{run.symbol}</h2>
                        <span className="pill h-6 px-2 text-[11px]">{t(INTERVAL_LABEL_KEYS[run.intervalId] ?? 'chart.tf.1d')}</span>
                        <span className="num text-[11.5px] text-faint">
                            {t('strat.lab.bars').replace('{n}', arDigits(String(run.bars), lang))}
                        </span>
                        <Link
                            href={`/stocks/${encodeURIComponent(run.symbol)}?strategy=${doc.id}`}
                            className="pill ms-auto h-7 gap-1 px-2.5 text-[11.5px]"
                        >
                            {t('strat.stock.openLab')} <ArrowUpRight className="size-3.5" />
                        </Link>
                    </div>

                    {run.metrics.trades < 3 && (
                        <p className="rounded-[10px] bg-page px-3 py-2 text-[12px] text-warn shadow-[inset_0_0_0_1px_var(--line)]">
                            {t('strat.lab.insufficient')}
                        </p>
                    )}
                    {barsPerYear(run.intervalId) === 0 && (
                        <p className="rounded-[10px] bg-page px-3 py-2 text-[12px] text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)]">
                            {t('strat.lab.shortHistory')}
                        </p>
                    )}

                    <KpiGrid metrics={run.metrics} lang={lang} />
                    <ResultCharts equity={run.result.equity} drawdown={run.result.drawdown} lang={lang} />
                    <TradeTable trades={run.result.trades} lang={lang} fileStem={fileStem} />
                    <p className={cn('px-0.5 text-[11px] text-faint')}>{t('strat.disclaimer')}</p>
                </div>
            )}
        </div>
    );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Play, Plus, RotateCcw, Save, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react';
import {
    DEFAULT_CUSTOM_STRATEGY,
    MAX_CUSTOM_PARAMS,
    OBJECTIVES,
    backtestCustom,
    checkRule,
    customMetrics,
    optimize,
    paramValues,
    parseCustomStrategy,
    serializeStrategy,
    sourcePosition,
    walkForward,
    type CustomStrategy,
    type Objective,
    type OptimizerResult,
    type StrategyDirection,
    type WalkForwardResult,
} from '@/lib/custom-strategy';
import {
    MAX_SAVED_STRATEGIES,
    addSavedStrategy,
    loadSavedStrategies,
    mergeStrategies,
    removeSavedStrategy,
    storeSavedStrategies,
    type SavedStrategy,
} from '@/lib/strategy-library-custom';
import { loadStrategies, saveStrategies } from '@/lib/actions/strategy.actions';
import { getStrategyCandles } from '@/lib/actions/yahoo-candles.actions';
import { compareYahooSymbol } from '@/lib/compare';
import { CANDLE_INTERVALS, type Candle } from '@/lib/yahoo-candles';
import { INTERVAL_LABEL_KEYS } from '@/lib/chart-grid';
import { DEFAULT_COSTS, barsPerYear, type Backtest, type Costs, type Metrics } from '@/lib/strategies';
import { describeFormulaError } from '@/lib/formula';
import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import KpiGrid from '@/components/strategies/KpiGrid';
import ResultCharts from '@/components/strategies/ResultCharts';
import TradeTable from '@/components/strategies/TradeTable';
import RuleEditor from '@/components/strategies/RuleEditor';
import { num, pct } from '@/components/strategies/format';
import { cn } from '@/lib/utils';

// The custom strategy studio: a name, two rules in the formula language, the parameters those rules
// may use, and the risk settings — then the same execution model as the six published strategies.
// The rules are the source of truth; the builder writes them, the parameters rewrite them, and the
// engine only ever sees the result.

type Run = { symbol: string; intervalId: string; bars: number; result: Backtest; metrics: Metrics };
type Account = 'checking' | 'ready' | 'local';
type Notice = 'savedAccount' | 'savedLocal' | 'saveFailed' | 'invalid' | 'full' | 'importFailed' | 'nameRequired' | 'loadFailed' | null;

const NOTICE_KEY: Record<Exclude<Notice, null>, StringKey> = {
    savedAccount: 'cs.notice.account',
    savedLocal: 'cs.notice.local',
    saveFailed: 'cs.notice.failed',
    invalid: 'cs.notice.invalid',
    full: 'cs.notice.full',
    importFailed: 'cs.notice.importFailed',
    nameRequired: 'cs.notice.name',
    loadFailed: 'cs.notice.loadFailed',
};

const NOTICE_TONE: Record<Exclude<Notice, null>, string> = {
    savedAccount: 'text-up',
    savedLocal: 'text-faint',
    saveFailed: 'text-down',
    invalid: 'text-down',
    full: 'text-down',
    importFailed: 'text-down',
    nameRequired: 'text-down',
    loadFailed: 'text-down',
};

const DIRECTIONS: StrategyDirection[] = ['long', 'short', 'reversal'];
const DIRECTION_KEY: Record<StrategyDirection, StringKey> = {
    long: 'cs.dir.long',
    short: 'cs.dir.short',
    reversal: 'cs.dir.reversal',
};

const OBJECTIVE_KEY: Record<Objective, StringKey> = {
    sharpe: 'cs.obj.sharpe',
    totalReturn: 'cs.obj.return',
    profitFactor: 'cs.obj.profitFactor',
    expectancy: 'cs.obj.expectancy',
};

const downloadText = (text: string, filename: string, type: string) => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
};

export default function CustomStrategyStudio({ lang, initialSymbol }: { lang: Lang; initialSymbol?: string }) {
    const t = (key: StringKey) => tx(lang, key);

    const [strategy, setStrategy] = useState<CustomStrategy>(() => ({ ...DEFAULT_CUSTOM_STRATEGY, params: DEFAULT_CUSTOM_STRATEGY.params.map((param) => ({ ...param })) }));
    const [symbol, setSymbol] = useState(initialSymbol ?? '2222.SR');
    const [intervalId, setIntervalId] = useState('1d');
    const [costs, setCosts] = useState<Costs>({ ...DEFAULT_COSTS });
    const [riskFree, setRiskFree] = useState(0);

    const [running, setRunning] = useState(false);
    const [error, setError] = useState<'badSymbol' | 'noCandles' | null>(null);
    const [run, setRun] = useState<Run | null>(null);

    const [optimizer, setOptimizer] = useState<OptimizerResult | null>(null);
    const [optimizing, setOptimizing] = useState(false);
    const [objective, setObjective] = useState<Objective>('sharpe');
    const [walk, setWalk] = useState<WalkForwardResult | null>(null);
    const [walking, setWalking] = useState(false);
    const [folds, setFolds] = useState(4);

    const [saved, setSaved] = useState<SavedStrategy[]>([]);
    const [account, setAccount] = useState<Account>('checking');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);
    const importRef = useRef<HTMLInputElement>(null);

    // The rules are checked against the values their placeholders will have, exactly as the engine
    // will see them — so a rule that only looks broken is not marked broken.
    const checks = useMemo(() => {
        const values = paramValues(strategy);
        const entry = checkRule(strategy.entry, values);
        const exit = checkRule(strategy.exit, values);
        return {
            values,
            entry,
            exit,
            entryError: entry.ok ? null : describeFormulaError(entry.error, lang),
            exitError: exit.ok ? null : describeFormulaError(exit.error, lang),
            entryPosition: entry.ok ? null : sourcePosition(strategy.entry, values, entry.position),
            exitPosition: exit.ok ? null : sourcePosition(strategy.exit, values, exit.position),
            valid: entry.ok && exit.ok,
        };
    }, [strategy, lang]);

    // Opening the studio reads the shelf: the browser copy first, then the account's, then the union.
    useEffect(() => {
        const local = loadSavedStrategies();
        setSaved(local);
        let cancelled = false;
        loadStrategies()
            .then((result) => {
                if (cancelled) return;
                if (!result.ok) {
                    setAccount('local');
                    return;
                }
                setAccount('ready');
                const merged = mergeStrategies(local, result.items);
                setSaved(merged);
                storeSavedStrategies(merged);
                if (JSON.stringify(merged) !== JSON.stringify(result.items)) void saveStrategies(merged);
            })
            .catch(() => {
                if (!cancelled) setAccount('local');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const patch = (next: Partial<CustomStrategy>) => {
        setStrategy((current) => ({ ...current, ...next }));
        setNotice(null);
    };

    const updateParam = (index: number, next: Partial<CustomStrategy['params'][number]>) => {
        setStrategy((current) => ({
            ...current,
            params: current.params.map((param, i) => (i === index ? { ...param, ...next } : param)),
        }));
        setNotice(null);
    };

    const addParam = () => {
        if (strategy.params.length >= MAX_CUSTOM_PARAMS) return;
        const used = new Set(strategy.params.map((param) => param.key));
        let index = 1;
        while (used.has(`p${index}`)) index += 1;
        patch({ params: [...strategy.params, { key: `p${index}`, value: 10, min: 1, max: 100, step: 1 }] });
    };

    const removeParam = (index: number) => {
        patch({ params: strategy.params.filter((_, i) => i !== index) });
    };

    const fileStem = useMemo(
        () => `strategy-custom-${(run?.symbol ?? symbol).replace(/[^\w.-]/g, '')}-${run?.intervalId ?? intervalId}`,
        [run, symbol, intervalId],
    );

    const loadCandles = async (): Promise<{ symbol: string; intervalId: string; candles: Candle[] } | null> => {
        const resolved = compareYahooSymbol(symbol);
        if (!resolved) {
            setError('badSymbol');
            return null;
        }
        try {
            const set = await getStrategyCandles(resolved, intervalId);
            if (!set || set.candles.length < 2) {
                setError('noCandles');
                return null;
            }
            return { symbol: resolved, intervalId, candles: set.candles };
        } catch (cause) {
            console.error(cause);
            setError('noCandles');
            return null;
        }
    };

    const execute = async () => {
        if (!checks.valid) {
            setNotice('invalid');
            return;
        }
        setRunning(true);
        setError(null);
        setNotice(null);
        try {
            const data = await loadCandles();
            if (!data) return;
            const result = backtestCustom(data.candles, strategy, costs);
            if (!result) {
                setError('noCandles');
                return;
            }
            setRun({
                symbol: data.symbol,
                intervalId: data.intervalId,
                bars: data.candles.length,
                result,
                metrics: customMetrics(result, data.intervalId, riskFree / 100),
            });
            setOptimizer(null);
            setWalk(null);
        } finally {
            setRunning(false);
        }
    };

    const runOptimizer = async () => {
        if (!checks.valid) {
            setNotice('invalid');
            return;
        }
        setOptimizing(true);
        setError(null);
        try {
            const data = await loadCandles();
            if (!data) return;
            // Let the spinner paint before a grid that can be a couple of thousand runs.
            await new Promise((resolve) => setTimeout(resolve, 30));
            setOptimizer(optimize(data.candles, strategy, objective, costs, data.intervalId));
        } finally {
            setOptimizing(false);
        }
    };

    const runWalk = async () => {
        if (!checks.valid) {
            setNotice('invalid');
            return;
        }
        setWalking(true);
        setError(null);
        try {
            const data = await loadCandles();
            if (!data) return;
            await new Promise((resolve) => setTimeout(resolve, 30));
            setWalk(walkForward(data.candles, strategy, folds, objective, costs, data.intervalId));
        } finally {
            setWalking(false);
        }
    };

    const applyBest = (values: Record<string, number>) => {
        setStrategy((current) => ({
            ...current,
            params: current.params.map((param) => ({ ...param, value: values[param.key] ?? param.value })),
        }));
        setNotice(null);
    };

    const save = async () => {
        if (!strategy.name.trim()) {
            setNotice('nameRequired');
            return;
        }
        if (!checks.valid) {
            setNotice('invalid');
            return;
        }
        const next = addSavedStrategy(saved, strategy);
        if (next === saved) {
            setNotice('full');
            return;
        }
        setSaved(next);
        storeSavedStrategies(next);
        if (account !== 'ready') {
            setNotice('savedLocal');
            return;
        }
        setBusy(true);
        try {
            const result = await saveStrategies(next);
            setNotice(result.ok ? 'savedAccount' : 'saveFailed');
        } catch {
            setNotice('saveFailed');
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: string) => {
        const next = removeSavedStrategy(saved, id);
        setSaved(next);
        storeSavedStrategies(next);
        if (account === 'ready') {
            try {
                await saveStrategies(next);
            } catch {
                // The browser copy is already correct; the next open retries the account.
            }
        }
    };

    const loadOne = (entry: SavedStrategy) => {
        setStrategy({ ...entry.strategy, params: entry.strategy.params.map((param) => ({ ...param })) });
        setRun(null);
        setOptimizer(null);
        setWalk(null);
        setNotice(null);
    };

    const exportJson = () => {
        downloadText(serializeStrategy(strategy), `${fileStem}.json`, 'application/json;charset=utf-8');
    };

    const importJson = async (file: File | undefined) => {
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            const candidate = Array.isArray(parsed) ? parsed[0]?.strategy : parsed;
            const next = parseCustomStrategy(candidate);
            if (!next) {
                setNotice('importFailed');
                return;
            }
            setStrategy(next);
            setRun(null);
            setOptimizer(null);
            setWalk(null);
            setNotice(null);
        } catch {
            setNotice('importFailed');
        }
    };

    const reset = () => {
        setStrategy({ ...DEFAULT_CUSTOM_STRATEGY, params: DEFAULT_CUSTOM_STRATEGY.params.map((param) => ({ ...param })) });
        setRun(null);
        setOptimizer(null);
        setWalk(null);
        setNotice(null);
    };

    const paramKeys = strategy.params.map((param) => param.key);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
                <Link href="/strategies" className="pill h-7 gap-1 px-2 text-[11.5px]">
                    <ArrowLeft className="size-3.5 rtl:rotate-180" /> {t('nav.strategies')}
                </Link>
                <span className="num text-[11px] text-faint">
                    {account === 'checking' ? t('cs.syncing') : account === 'ready' ? t('cs.account') : t('cs.local')}
                    <span> · {arDigits(saved.length, lang)} / {arDigits(MAX_SAVED_STRATEGIES, lang)}</span>
                </span>
                <div className="ms-auto flex flex-wrap items-center gap-1.5">
                    <input
                        ref={importRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(event) => void importJson(event.target.files?.[0])}
                    />
                    <button type="button" onClick={() => importRef.current?.click()} className="pill h-7 gap-1 px-2 text-[11.5px]">
                        <Upload className="size-3.5" /> {t('cs.import')}
                    </button>
                    <button type="button" onClick={exportJson} className="pill h-7 gap-1 px-2 text-[11.5px]">
                        <Download className="size-3.5" /> {t('cs.export')}
                    </button>
                    <button type="button" onClick={reset} className="pill h-7 gap-1 px-2 text-[11.5px]">
                        <RotateCcw className="size-3.5" /> {t('strat.lab.defaults')}
                    </button>
                </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:items-start">
                <div className="flex min-w-0 flex-col gap-3">
                    <section className="card flex flex-col gap-3 p-3">
                        <div className="flex flex-wrap items-end gap-1.5">
                            <label className="flex min-w-40 flex-1 flex-col gap-1">
                                <span className="text-[11px] text-faint">{t('cs.name')}</span>
                                <input
                                    value={strategy.name}
                                    onChange={(event) => patch({ name: event.target.value.slice(0, 40) })}
                                    maxLength={40}
                                    placeholder={t('cs.namePlaceholder')}
                                    className="h-8 rounded-[8px] bg-page px-2 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                />
                            </label>
                            <div className="flex flex-col gap-1">
                                <span className="text-[11px] text-faint">{t('cs.direction')}</span>
                                <div className="flex rounded-[8px] bg-page p-0.5" role="group" aria-label={t('cs.direction')}>
                                    {DIRECTIONS.map((direction) => (
                                        <button
                                            key={direction}
                                            type="button"
                                            aria-pressed={strategy.direction === direction}
                                            onClick={() => patch({ direction })}
                                            className={cn('pill h-7 px-2 text-[11.5px]', strategy.direction === direction && 'is-brand')}
                                        >
                                            {t(DIRECTION_KEY[direction])}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <RuleEditor
                            lang={lang}
                            label={t('cs.entry')}
                            value={strategy.entry}
                            onChange={(entry) => patch({ entry })}
                            error={checks.entryError}
                            errorPosition={checks.entryPosition}
                            paramKeys={paramKeys}
                            hint={t('cs.entryHint')}
                        />

                        <RuleEditor
                            lang={lang}
                            label={t('cs.exit')}
                            value={strategy.exit}
                            onChange={(exit) => patch({ exit })}
                            error={checks.exitError}
                            errorPosition={checks.exitPosition}
                            paramKeys={paramKeys}
                            hint={t('cs.exitHint')}
                        />

                        {strategy.direction === 'reversal' && (
                            <p className="rounded-[8px] bg-page px-2 py-1.5 text-[11px] leading-snug text-faint shadow-[inset_0_0_0_1px_var(--line)]">
                                {t('cs.reversalHint')}
                            </p>
                        )}

                        <details className="rounded-[10px] bg-page/60 px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--line)]" open>
                            <summary className="cursor-pointer text-[12px] text-muted-foreground">
                                {t('cs.params')} <span className="num text-faint">· {arDigits(strategy.params.length, lang)} / {arDigits(MAX_CUSTOM_PARAMS, lang)}</span>
                            </summary>
                            <p className="mt-1 text-[10.5px] leading-snug text-faint">{t('cs.paramsHint')}</p>
                            <div className="mt-2 flex flex-col gap-1.5 overflow-x-auto">
                                {strategy.params.length === 0 && <p className="text-[11.5px] text-faint">{t('cs.noParams')}</p>}
                                {strategy.params.length > 0 && (
                                    <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,3.2rem))_auto] gap-1 text-[10px] uppercase tracking-wide text-faint">
                                        <span>{t('cs.param.key')}</span>
                                        <span>{t('cs.param.value')}</span>
                                        <span>{t('cs.param.min')}</span>
                                        <span>{t('cs.param.max')}</span>
                                        <span>{t('cs.param.step')}</span>
                                        <span />
                                    </div>
                                )}
                                {strategy.params.map((param, index) => (
                                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,3.2rem))_auto] items-center gap-1">
                                        <input
                                            value={param.key}
                                            onChange={(event) => updateParam(index, { key: event.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) })}
                                            dir="ltr"
                                            aria-label={t('cs.param.key')}
                                            className="mono h-7 min-w-0 rounded-[6px] bg-page px-1.5 text-[11.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                        />
                                        {(['value', 'min', 'max', 'step'] as const).map((field) => (
                                            <input
                                                key={field}
                                                type="number"
                                                step="any"
                                                value={param[field]}
                                                onChange={(event) => updateParam(index, { [field]: Number(event.target.value) })}
                                                dir="ltr"
                                                aria-label={t(`cs.param.${field}` as StringKey)}
                                                className="num h-7 min-w-0 rounded-[6px] bg-page px-1.5 text-[11.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                            />
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => removeParam(index)}
                                            aria-label={`${t('cs.removeParam')} ${param.key}`}
                                            title={t('cs.removeParam')}
                                            className="icon-btn is-danger"
                                        >
                                            <Trash2 />
                                        </button>
                                    </div>
                                ))}
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={addParam}
                                        disabled={strategy.params.length >= MAX_CUSTOM_PARAMS}
                                        className="pill h-7 gap-1 px-2 text-[11px] disabled:opacity-50"
                                    >
                                        <Plus className="size-3" /> {t('cs.addParam')}
                                    </button>
                                    {paramKeys.length > 0 && (
                                        <span className="flex flex-wrap items-center gap-1 text-[10px] text-faint">
                                            {t('cs.placeholders')}
                                            {paramKeys.map((key) => (
                                                <code key={key} className="mono rounded-[4px] bg-page px-1 py-0.5 text-[10px]">{`{${key}}`}</code>
                                            ))}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </details>

                        <details className="rounded-[10px] bg-page/60 px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--line)]" open>
                            <summary className="cursor-pointer text-[12px] text-muted-foreground">{t('cs.risk')}</summary>
                            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                {([
                                    ['stopPct', 'cs.stop'],
                                    ['targetPct', 'cs.target'],
                                    ['trailingPct', 'cs.trail'],
                                    ['riskPct', 'cs.riskPct'],
                                ] as const).map(([field, key]) => (
                                    <label key={field} className="flex flex-col gap-1">
                                        <span className="text-[10.5px] text-faint">{t(key)}</span>
                                        <input
                                            type="number"
                                            min={0}
                                            step="0.5"
                                            value={strategy[field]}
                                            onChange={(event) => patch({ [field]: Math.max(0, Number(event.target.value) || 0) } as Partial<CustomStrategy>)}
                                            dir="ltr"
                                            className="num h-7 rounded-[6px] bg-page px-1.5 text-[11.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                        />
                                    </label>
                                ))}
                            </div>
                            <p className="mt-1.5 text-[10.5px] leading-snug text-faint">{t('cs.riskHint')}</p>
                        </details>

                        <details className="rounded-[10px] bg-page/60 px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--line)]">
                            <summary className="cursor-pointer text-[12px] text-muted-foreground">{t('cs.market')}</summary>
                            <div className="mt-2 flex flex-wrap items-end gap-1.5">
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10.5px] text-faint">{t('strat.lab.symbol')}</span>
                                    <input
                                        value={symbol}
                                        onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                                        dir="ltr"
                                        className="mono h-7 w-28 rounded-[6px] bg-page px-1.5 text-[11.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10.5px] text-faint">{t('strat.lab.interval')}</span>
                                    <select
                                        value={intervalId}
                                        onChange={(event) => setIntervalId(event.target.value)}
                                        className="h-7 rounded-[6px] bg-page px-1.5 text-[11.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        {CANDLE_INTERVALS.map((interval) => (
                                            <option key={interval.id} value={interval.id}>
                                                {t(INTERVAL_LABEL_KEYS[interval.id] ?? 'chart.tf.1d')}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10.5px] text-faint">{t('strat.lab.commission')}</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={200}
                                        value={costs.commissionBps}
                                        onChange={(event) => setCosts((state) => ({ ...state, commissionBps: Math.max(0, Number(event.target.value) || 0) }))}
                                        dir="ltr"
                                        className="num h-7 w-16 rounded-[6px] bg-page px-1.5 text-[11.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10.5px] text-faint">{t('strat.lab.slippage')}</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={200}
                                        value={costs.slippageBps}
                                        onChange={(event) => setCosts((state) => ({ ...state, slippageBps: Math.max(0, Number(event.target.value) || 0) }))}
                                        dir="ltr"
                                        className="num h-7 w-16 rounded-[6px] bg-page px-1.5 text-[11.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10.5px] text-faint">{t('strat.lab.riskFree')}</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={30}
                                        step={0.25}
                                        value={riskFree}
                                        onChange={(event) => setRiskFree(Math.max(0, Number(event.target.value) || 0))}
                                        dir="ltr"
                                        className="num h-7 w-16 rounded-[6px] bg-page px-1.5 text-[11.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </label>
                            </div>
                        </details>

                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => void execute()}
                                disabled={running || !checks.valid}
                                className="btn btn-primary h-8 gap-1.5 px-3 text-[12.5px] disabled:opacity-60"
                            >
                                <Play className="size-3.5" /> {running ? t('strat.lab.running') : t('strat.lab.run')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void save()}
                                disabled={busy || !strategy.name.trim() || !checks.valid}
                                className="pill h-8 gap-1 px-2.5 text-[12px] disabled:opacity-50"
                            >
                                <Save className="size-3.5" /> {t('cs.save')}
                            </button>
                            {!checks.valid && <span className="text-[11px] text-down">{t('cs.fixRules')}</span>}
                        </div>

                        {error && (
                            <p role="alert" className="text-[12px] text-down">
                                {error === 'badSymbol' ? t('strat.lab.badSymbol') : t('strat.lab.noCandles').replace('{s}', symbol)}
                            </p>
                        )}
                        {notice && <p className={cn('text-[11px]', NOTICE_TONE[notice])}>{t(NOTICE_KEY[notice])}</p>}
                    </section>

                    <section className="card flex flex-col gap-2 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-[12.5px] font-semibold">{t('cs.saved')}</h3>
                            <span className="num text-[10.5px] text-faint">{arDigits(saved.length, lang)} / {arDigits(MAX_SAVED_STRATEGIES, lang)}</span>
                        </div>
                        {saved.length === 0 ? (
                            <p className="text-[11.5px] text-faint">{t('cs.savedEmpty')}</p>
                        ) : (
                            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                                {saved.map((entry) => (
                                    <div key={entry.id} className="flex items-center gap-1 rounded-[7px] bg-page px-1.5 py-1">
                                        <button type="button" onClick={() => loadOne(entry)} className="min-w-0 flex-1 text-start" title={entry.strategy.entry}>
                                            <span className="block truncate text-[11.5px] font-medium text-foreground">{entry.name}</span>
                                            <span className="mono block truncate text-[10px] text-faint" dir="ltr">{entry.strategy.entry}</span>
                                        </button>
                                        <span className="pill h-5 px-1.5 text-[9.5px] text-faint">{t(DIRECTION_KEY[entry.strategy.direction])}</span>
                                        <button
                                            type="button"
                                            onClick={() => void remove(entry.id)}
                                            aria-label={`${t('cs.delete')} ${entry.name}`}
                                            title={t('cs.delete')}
                                            className="icon-btn is-danger shrink-0"
                                        >
                                            <Trash2 />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                    {run ? (
                        <div className="flex flex-col gap-3" aria-live="polite">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-0.5">
                                <h2 className="text-[14px] font-semibold">{run.symbol}</h2>
                                <span className="pill h-6 px-2 text-[11px]">{t(INTERVAL_LABEL_KEYS[run.intervalId] ?? 'chart.tf.1d')}</span>
                                <span className="num text-[11.5px] text-faint">{t('strat.lab.bars').replace('{n}', arDigits(String(run.bars), lang))}</span>
                                <span className="pill h-6 px-2 text-[11px] text-faint">{t('cs.result')}</span>
                            </div>

                            {run.metrics.trades < 3 && (
                                <p className="rounded-[10px] bg-page px-3 py-2 text-[12px] text-warn shadow-[inset_0_0_0_1px_var(--line)]">{t('strat.lab.insufficient')}</p>
                            )}
                            {barsPerYear(run.intervalId) === 0 && (
                                <p className="rounded-[10px] bg-page px-3 py-2 text-[12px] text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)]">{t('strat.lab.shortHistory')}</p>
                            )}

                            <KpiGrid metrics={run.metrics} lang={lang} />
                            <ResultCharts equity={run.result.equity} drawdown={run.result.drawdown} lang={lang} />
                            <TradeTable trades={run.result.trades} lang={lang} fileStem={fileStem} />

                            <section className="card flex flex-col gap-2 p-3">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                                        <Wand2 className="size-3.5 text-brand" /> {t('cs.optimizer')}
                                    </h3>
                                    <label className="flex items-center gap-1 text-[10.5px] text-faint">
                                        {t('cs.objective')}
                                        <select
                                            value={objective}
                                            onChange={(event) => setObjective(event.target.value as Objective)}
                                            className="h-7 rounded-[6px] bg-page px-1.5 text-[11px] text-foreground shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                        >
                                            {OBJECTIVES.map((entry) => (
                                                <option key={entry} value={entry}>{t(OBJECTIVE_KEY[entry])}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => void runOptimizer()}
                                        disabled={optimizing || strategy.params.length === 0}
                                        className="pill h-7 gap-1 px-2.5 text-[11px] disabled:opacity-50"
                                    >
                                        <Sparkles className="size-3" /> {optimizing ? t('cs.working') : t('cs.runOptimizer')}
                                    </button>
                                    <Link href="/strategies" className="ms-auto text-[10.5px] text-faint hover:text-fg">{t('cs.learn')}</Link>
                                </div>
                                <p className="text-[10.5px] leading-snug text-faint">{t('cs.optimizerHint')}</p>
                                {optimizer && (
                                    optimizer.rows.length === 0 ? (
                                        <p className="text-[11.5px] text-faint">{t('cs.optimizerEmpty')}</p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full min-w-[560px] border-collapse text-[11.5px]">
                                                <thead>
                                                    <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                                                        <th className="px-1.5 py-1 text-start font-medium">#</th>
                                                        {strategy.params.map((param) => (
                                                            <th key={param.key} className="px-1.5 py-1 text-start font-medium">{param.key}</th>
                                                        ))}
                                                        <th className="px-1.5 py-1 text-end font-medium">{t('strat.m.totalReturn')}</th>
                                                        <th className="px-1.5 py-1 text-end font-medium">{t('strat.m.sharpe')}</th>
                                                        <th className="px-1.5 py-1 text-end font-medium">{t('strat.m.trades')}</th>
                                                        <th className="px-1.5 py-1" />
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {optimizer.rows.map((row, index) => (
                                                        <tr key={index} className="border-b border-line/60 last:border-0">
                                                            <td className="num px-1.5 py-1 text-faint">{arDigits(index + 1, lang)}</td>
                                                            {strategy.params.map((param) => (
                                                                <td key={param.key} className="num px-1.5 py-1" dir="ltr">{num(row.values[param.key], lang)}</td>
                                                            ))}
                                                            <td className={cn('num px-1.5 py-1 text-end', (row.metrics.totalReturn ?? 0) >= 0 ? 'text-up' : 'text-down')} dir="ltr">{pct(row.metrics.totalReturn, lang)}</td>
                                                            <td className="num px-1.5 py-1 text-end" dir="ltr">{num(row.metrics.sharpe, lang)}</td>
                                                            <td className="num px-1.5 py-1 text-end" dir="ltr">{arDigits(String(row.metrics.trades), lang)}</td>
                                                            <td className="px-1.5 py-1 text-end">
                                                                <button type="button" onClick={() => applyBest(row.values)} className="pill h-6 px-2 text-[10.5px]">{t('cs.apply')}</button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            <p className="num mt-1 text-[10.5px] text-faint">
                                                {t('cs.tried').replace('{n}', arDigits(String(optimizer.tried), lang))}
                                                {optimizer.truncated && <span className="text-warn"> · {t('cs.truncated')}</span>}
                                            </p>
                                        </div>
                                    )
                                )}
                            </section>

                            <section className="card flex flex-col gap-2 p-3">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <h3 className="text-[12.5px] font-semibold">{t('cs.walk')}</h3>
                                    <label className="flex items-center gap-1 text-[10.5px] text-faint">
                                        {t('cs.folds')}
                                        <input
                                            type="number"
                                            min={2}
                                            max={8}
                                            value={folds}
                                            onChange={(event) => setFolds(Math.max(2, Math.min(8, Math.floor(Number(event.target.value) || 2))))}
                                            dir="ltr"
                                            className="num h-7 w-12 rounded-[6px] bg-page px-1.5 text-[11px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:ring-2 focus:ring-ring"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => void runWalk()}
                                        disabled={walking || strategy.params.length === 0}
                                        className="pill h-7 px-2.5 text-[11px] disabled:opacity-50"
                                    >
                                        {walking ? t('cs.working') : t('cs.runWalk')}
                                    </button>
                                </div>
                                <p className="text-[10.5px] leading-snug text-faint">{t('cs.walkHint')}</p>
                                {walk && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[520px] border-collapse text-[11.5px]">
                                            <thead>
                                                <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                                                    <th className="px-1.5 py-1 text-start font-medium">{t('cs.fold')}</th>
                                                    <th className="px-1.5 py-1 text-start font-medium">{t('cs.train')}</th>
                                                    <th className="px-1.5 py-1 text-start font-medium">{t('cs.test')}</th>
                                                    {strategy.params.map((param) => (
                                                        <th key={param.key} className="px-1.5 py-1 text-start font-medium">{param.key}</th>
                                                    ))}
                                                    <th className="px-1.5 py-1 text-end font-medium">{t('strat.m.totalReturn')}</th>
                                                    <th className="px-1.5 py-1 text-end font-medium">{t('strat.m.sharpe')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {walk.folds.map((fold) => (
                                                    <tr key={fold.index} className="border-b border-line/60 last:border-0">
                                                        <td className="num px-1.5 py-1">{arDigits(fold.index, lang)}</td>
                                                        <td className="num px-1.5 py-1 text-faint" dir="ltr">
                                                            {arDigits(fold.trainFrom, lang)}–{arDigits(fold.trainTo, lang)}
                                                        </td>
                                                        <td className="num px-1.5 py-1 text-faint" dir="ltr">
                                                            {arDigits(fold.testFrom, lang)}–{arDigits(fold.testTo, lang)}
                                                        </td>
                                                        {strategy.params.map((param) => (
                                                            <td key={param.key} className="num px-1.5 py-1" dir="ltr">{num(fold.params[param.key], lang)}</td>
                                                        ))}
                                                        <td className={cn('num px-1.5 py-1 text-end', (fold.test.totalReturn ?? 0) >= 0 ? 'text-up' : 'text-down')} dir="ltr">
                                                            {pct(fold.test.totalReturn, lang)}
                                                        </td>
                                                        <td className="num px-1.5 py-1 text-end" dir="ltr">{num(fold.test.sharpe, lang)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <p className="mt-1 flex flex-wrap gap-x-3 text-[10.5px] text-faint">
                                            <span>{t('cs.oosReturn')}: <span className={cn('num', (walk.oosReturn ?? 0) >= 0 ? 'text-up' : 'text-down')}>{pct(walk.oosReturn, lang)}</span></span>
                                            <span>{t('cs.oosSharpe')}: <span className="num">{num(walk.oosSharpe, lang)}</span></span>
                                        </p>
                                    </div>
                                )}
                            </section>

                            <p className="px-0.5 text-[11px] text-faint">{t('strat.disclaimer')}</p>
                        </div>
                    ) : (
                        <section className="card flex flex-col items-center justify-center gap-2 p-8 text-center">
                            <Wand2 className="size-6 text-faint" aria-hidden="true" />
                            <p className="text-[13px] font-medium text-foreground">{t('cs.emptyTitle')}</p>
                            <p className="max-w-sm text-[12px] leading-relaxed text-faint">{t('cs.emptyBody')}</p>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}

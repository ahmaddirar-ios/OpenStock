'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, FlaskConical, X } from 'lucide-react';
import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts';
import { backtest, barsPerYear, DEFAULT_COSTS, metrics as computeMetrics, type Metrics, type StrategyId } from '@/lib/strategy/strategies';
import { STRATEGY_LIBRARY } from '@/lib/strategy/library';
import { getStrategyCandles } from '@/lib/actions/yahoo-candles.actions';
import { token } from '@/lib/chart/candle-host';
import { tx, arDigits, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type StrategyStats = Pick<Metrics, 'trades' | 'winRate' | 'totalReturn' | 'maxDrawdown'>;

type Props = {
    symbol: string;
    intervalId: string;
    lang: Lang;
    /** Markers to draw on the price series, and the numbers to show beside the control. */
    onChange: (markers: SeriesMarker<UTCTimestamp>[] | null, stats: StrategyStats | null) => void;
    /** A strategy to arm as soon as the chart opens (the lab links back with one). */
    initial?: StrategyId | null;
};

/**
 * The strategy control on the chart: arm a rule and see its fills on the candles. The signals are
 * computed from the lab's deeper series, so a 200-bar rule has the history it needs — the chart's own
 * six months are untouched, and the markers are drawn only where a trade actually happened.
 */
export default function StrategyMenu({ symbol, intervalId, lang, onChange, initial = null }: Props) {
    const [open, setOpen] = useState(false);
    const [armed, setArmed] = useState<StrategyId | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<'none' | null>(null);
    const [stats, setStats] = useState<StrategyStats | null>(null);
    const emit = useRef(onChange);
    emit.current = onChange;

    const t = (key: Parameters<typeof tx>[1]) => tx(lang, key);
    const doc = useMemo(() => STRATEGY_LIBRARY.find((item) => item.id === armed) ?? null, [armed]);

    // A different symbol or interval is a different chart: the old arm and its markers must not survive.
    useEffect(() => {
        setArmed(null);
        setStats(null);
        setError(null);
        setOpen(false);
        emit.current(null, null);
    }, [symbol, intervalId]);

    const run = useCallback(
        async (id: StrategyId) => {
            setArmed(id);
            setOpen(false);
            setLoading(true);
            setError(null);
            setStats(null);
            emit.current(null, null);
            try {
                const set = await getStrategyCandles(symbol, intervalId);
                if (!set || set.candles.length < 2) {
                    setError('none');
                    setLoading(false);
                    return;
                }
                const result = backtest(set.candles, id, {}, DEFAULT_COSTS);
                if (!result) {
                    setError('none');
                    setLoading(false);
                    return;
                }
                const up = token('--up', '#4ade80');
                const down = token('--down', '#f87171');
                const markers: SeriesMarker<UTCTimestamp>[] = result.trades.flatMap((trade) => [
                    { time: trade.entryTime as UTCTimestamp, position: 'belowBar' as const, color: up, shape: 'arrowUp' as const },
                    { time: trade.exitTime as UTCTimestamp, position: 'aboveBar' as const, color: trade.pnl >= 0 ? up : down, shape: 'arrowDown' as const },
                ]);
                const m = computeMetrics(result, barsPerYear(intervalId), 0);
                const next: StrategyStats = {
                    trades: m.trades,
                    winRate: m.winRate,
                    totalReturn: m.totalReturn,
                    maxDrawdown: m.maxDrawdown,
                };
                setStats(next);
                emit.current(markers, next);
            } catch (cause) {
                console.error(cause);
                setError('none');
            } finally {
                setLoading(false);
            }
        },
        [symbol, intervalId],
    );

    // Only once, and only when the link asked for it.
    const autoRan = useRef(false);
    useEffect(() => {
        if (!initial || autoRan.current) return;
        autoRan.current = true;
        void run(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initial]);

    const clear = () => {
        setArmed(null);
        setStats(null);
        setError(null);
        emit.current(null, null);
    };

    const pctText = (value: number | null | undefined) =>
        value == null || !Number.isFinite(value) ? '—' : arDigits(`${(value * 100).toFixed(1)}%`, lang);

    return (
        <div className="relative flex items-center gap-1.5">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                aria-label={doc ? (lang === 'ar' ? doc.nameAr : doc.name) : t('strat.stock.menu')}
                className={cn('pill h-7 gap-1.5 px-2.5 text-[12px]', (armed || open) && 'is-up')}
                title={t('strat.stock.menu')}
            >
                <FlaskConical className="size-3.5" />
                {/* The name is a luxury on a narrow pane: the flask says what the control is, and
                    the tooltip names it when the bar runs out of room. */}
                <span className="chart-toolbar-label">
                    {doc ? (lang === 'ar' ? doc.nameAr : doc.name) : t('strat.stock.menu')}
                </span>
                <ChevronDown className="size-3" />
            </button>

            {loading && <span className="text-[11px] text-faint">{t('strat.stock.loading')}</span>}
            {error && <span className="text-[11px] text-down">{t('strat.stock.noData')}</span>}

            {armed && !loading && stats && (
                <span
                    title={tx(lang, 'strat.stock.markersNote')}
                    className="flex items-center gap-1.5 rounded-[8px] bg-page px-2 py-1 text-[11px] text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)]"
                >
                    <span>{t('strat.m.trades')} <b className="num text-fg">{arDigits(String(stats.trades), lang)}</b></span>
                    <span className="text-faint">·</span>
                    <span>{t('strat.m.winRate')} <b className="num text-fg">{pctText(stats.winRate)}</b></span>
                    <span className="text-faint">·</span>
                    <span>{t('strat.m.totalReturn')} <b className={cn('num', (stats.totalReturn ?? 0) >= 0 ? 'text-up' : 'text-down')}>{pctText(stats.totalReturn)}</b></span>
                    <span className="text-faint">·</span>
                    <span>{t('strat.m.maxDD')} <b className="num text-down">{pctText(stats.maxDrawdown == null ? null : -stats.maxDrawdown)}</b></span>
                    {armed && (
                        <Link href={`/strategies/${armed}?symbol=${encodeURIComponent(symbol)}`} className="ms-1 text-brand hover:underline">
                            {t('strat.stock.openLab')}
                        </Link>
                    )}
                    <button type="button" onClick={clear} className="icon-btn size-5" aria-label={t('strat.stock.clear')} title={t('strat.stock.clear')}>
                        <X className="size-3" />
                    </button>
                </span>
            )}

            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <div className="absolute end-0 top-full z-30 mt-1 flex max-h-[22rem] w-64 flex-col gap-0.5 overflow-y-auto rounded-[12px] bg-card p-1.5 shadow-[0_0_0_1px_var(--line),0_16px_40px_oklch(0_0_0/0.5)]">
                        {STRATEGY_LIBRARY.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => void run(item.id)}
                                className={cn(
                                    'flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-start text-[12px] hover:bg-hover',
                                    armed === item.id && 'bg-hover',
                                )}
                            >
                                <span className="min-w-0 flex-1 truncate">{lang === 'ar' ? item.nameAr : item.name}</span>
                                <span className="text-[10.5px] text-faint">{t(`strat.cat.${item.category}` as const)}</span>
                            </button>
                        ))}
                        {armed && (
                            <button type="button" onClick={clear} className="mt-1 rounded-[8px] px-2 py-1.5 text-start text-[12px] text-down hover:bg-hover">
                                {t('strat.stock.clear')}
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

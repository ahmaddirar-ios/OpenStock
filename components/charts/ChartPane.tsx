'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowUpRight,
    ChevronDown,
    Loader2,
    RefreshCw,
    X,
} from 'lucide-react';
import {
    type LogicalRange,
    type MouseEventParams,
    type UTCTimestamp,
} from 'lightweight-charts';
import { createCandleHost, type CandleHost, type IndicatorFlags } from '@/lib/candle-host';
import { sessionChange, universeName } from '@/lib/chart-grid';
import { getStrategyCandles, getSymbolCandles } from '@/lib/actions/yahoo-candles.actions';
import type { Candle, CandleSet } from '@/lib/yahoo-candles';
import Price from '@/components/Price';
import PaneSearch from '@/components/charts/PaneSearch';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { clipToCursor } from '@/lib/chart-grid';
import ChartLegend from '@/components/stocks/ChartLegend';
import type { BarReadout } from '@/lib/chart-readout';

export type CrosshairSync = { time: number; price: number };
export type RangeSync = { from: number; to: number };

type Props = {
    lang: Lang;
    /** Empty until the trader picks one, in which case the pane shows its empty state. */
    symbol: string;
    paneIndex: number;
    /** Every symbol on the screen, so a duplicate can be refused by name. */
    symbols: string[];
    watchlist: string[];
    intervalId: string;
    indicators: IndicatorFlags;
    /** Bumped by the refresh button to reload every pane. */
    refreshNonce: number;
    crosshair: { from: number; value: CrosshairSync | null } | null;
    range: { from: number; value: RangeSync } | null;
    onCrosshair: (value: CrosshairSync | null) => void;
    onRange: (value: RangeSync) => void;
    onSymbol: (symbol: string) => void;
    onClear: () => void;
    /** Grid replay: every pane shows only the bars up to one shared cursor time. */
    replay: boolean;
    cursorTime: number | null;
    /** Reports this pane's deep series, so the grid can size the shared cursor around all panes. */
    onReplaySeries: (symbol: string, candles: readonly Candle[]) => void;
    className?: string;
};

const isTimeVisible = (intervalId: string) => intervalId !== '1d' && intervalId !== '1wk';

/**
 * One pane of the grid: a chart plus its symbol header. The host is created once and updated in
 * place, so switching the interval or an indicator never resets the trader's zoom. Crosshair and
 * range are published outwards and applied inwards behind a short ignore window, which is what keeps
 * four panes in step without an echo loop.
 */
export default function ChartPane({
    lang,
    symbol,
    paneIndex,
    symbols,
    watchlist,
    intervalId,
    indicators,
    refreshNonce,
    crosshair,
    range,
    onCrosshair,
    onRange,
    onSymbol,
    onClear,
    replay,
    cursorTime,
    onReplaySeries,
    className,
}: Props) {
    const elRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<CandleHost | null>(null);
    const [set, setSet] = useState<CandleSet | null>(null);
    /** Today's candles, kept apart from the chart's interval so the header pill always means today. */
    const [daySet, setDaySet] = useState<CandleSet | null>(null);
    const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [picking, setPicking] = useState(false);
    const [nonce, setNonce] = useState(0);
    const loadedSymbol = useRef('');
    const fitted = useRef('');
    const interacted = useRef(false);
    /** True once this pane holds bars. A view is never published or accepted before that, because a
     *  logical range means different things on an empty chart and would poison the other panes. */
    const ready = useRef(false);
    // Replay reads the lab's deep history instead of the chart's light payload, and clips it.
    const [deepSet, setDeepSet] = useState<CandleSet | null>(null);
    // The pane's own legend: the bar under this pane's crosshair, or the last bar it drew.
    const [readout, setReadout] = useState<BarReadout | null>(null);
    /** Set while this pane applies someone else's view, so it does not publish the echo back. */
    const ignoreUntil = useRef(0);

    const publishCrosshair = useRef(onCrosshair);
    const publishRange = useRef(onRange);
    publishCrosshair.current = onCrosshair;
    publishRange.current = onRange;

    // One host for the pane's life: data, indicators and the axis move through it.
    useEffect(() => {
        const el = elRef.current;
        if (!el) return;

        const host = createCandleHost(el, { timeVisible: false });
        hostRef.current = host;

        const handleCrosshair = (param: MouseEventParams) => {
            if (performance.now() < ignoreUntil.current) return;
            if (!param.point || param.time == null) {
                publishCrosshair.current(null);
                return;
            }
            const bar = param.seriesData.get(host.price) as { close?: number } | undefined;
            const price =
                typeof bar?.close === 'number' ? bar.close : host.price.coordinateToPrice(param.point.y);
            publishCrosshair.current(
                typeof price === 'number' ? { time: Number(param.time), price } : null,
            );
        };

        const handleRange = (next: LogicalRange | null) => {
            // Only a view the trader set is worth sharing: an initial fit is each pane's own business,
            // and broadcasting it (or applying one to a pane still loading) is what skews a grid.
            if (!ready.current || !interacted.current) return;
            if (performance.now() < ignoreUntil.current) return;
            if (!next) return;
            publishRange.current({ from: next.from, to: next.to });
        };

        const unsubscribeReadout = host.subscribeReadout(setReadout);
        host.chart.subscribeCrosshairMove(handleCrosshair);
        host.chart.timeScale().subscribeVisibleLogicalRangeChange(handleRange);

        // A pane is fitted the moment its candles arrive, which can be before the grid has given it a
        // width. Watching the element's size lets that fit be redone at the real width (the bars then
        // fill the pane instead of hugging its left edge), and keeps re-fitting as the layout
        // changes — until the trader zooms or drags, from then on the view is theirs.
        const observer = new ResizeObserver(() => {
            if (!fitted.current || interacted.current) return;
            if (el.clientWidth < 40) return;
            host.fit();
        });
        observer.observe(el);

        // Capture phase: the chart's own wheel/drag handlers sit on the canvas and stop the event
        // there, so a bubble-phase listener would never learn that the trader took over the view.
        const takeOver = () => {
            interacted.current = true;
        };
        el.addEventListener('wheel', takeOver, { passive: true, capture: true });
        el.addEventListener('pointerdown', takeOver, { capture: true });

        return () => {
            unsubscribeReadout();
            observer.disconnect();
            el.removeEventListener('wheel', takeOver, { capture: true });
            el.removeEventListener('pointerdown', takeOver, { capture: true });
            host.chart.unsubscribeCrosshairMove(handleCrosshair);
            host.chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRange);
            hostRef.current = null;
            host.destroy();
        };
    }, []);

    // Candles for this symbol at the shared interval. An interval change keeps the old bars on screen
    // behind a thin progress line; a symbol change starts clean, because it is a different chart.
    useEffect(() => {
        if (!symbol) {
            setSet(null);
            setDeepSet(null);
            setStatus('idle');
            loadedSymbol.current = '';
            ready.current = false;
            return;
        }
        let cancelled = false;
        if (loadedSymbol.current !== symbol) setSet(null);
        setStatus('loading');
        void (async () => {
            // In replay a pane needs the deep history (ten years daily, cached an hour): the chart's
            // own six months would not reach back far enough to replay, and the shared cursor has to
            // mean the same thing on every pane.
            const result = replay
                ? await getStrategyCandles(symbol, intervalId)
                : await getSymbolCandles(symbol, intervalId);
            if (cancelled) return;
            if (!result || result.candles.length === 0) {
                setSet(null);
                setDeepSet(null);
                setStatus('error');
                ready.current = false;
                return;
            }
            if (replay) {
                setDeepSet(result);
                onReplaySeries(symbol, result.candles);
            } else {
                setSet(result);
                setDeepSet(null);
            }
            loadedSymbol.current = symbol;
            ready.current = true;
            setStatus('ready');
        })();
        return () => {
            cancelled = true;
        };
    }, [symbol, intervalId, refreshNonce, nonce, replay, onReplaySeries]);

    // What the host draws: the light payload, or the deep one clipped to the shared cursor.
    const view = useMemo(() => {
        if (!replay) return set;
        // Until the deep series lands the pane keeps the bars it already had, rather than blinking
        // empty: the same rule as an interval change, where the old bars wait behind a progress line.
        if (!deepSet) return set;
        return { candles: clipToCursor(deepSet.candles, cursorTime), currency: deepSet.currency };
    }, [replay, set, deepSet, cursorTime]);

    useEffect(() => {
        hostRef.current?.setData(view);
    }, [view]);

    // The header pill is a day change, so it is read from daily bars even when the pane charts weeks
    // or months — otherwise a weekly bar would quietly redefine "today". The daily set is the same
    // server call the symbol page makes, behind the same one-minute cache.
    useEffect(() => {
        if (!symbol || intervalId === '1d') {
            setDaySet(null);
            return;
        }
        let cancelled = false;
        void (async () => {
            const result = await getSymbolCandles(symbol, '1d');
            if (!cancelled) setDaySet(result);
        })();
        return () => {
            cancelled = true;
        };
    }, [symbol, intervalId, refreshNonce, nonce]);

    useEffect(() => {
        hostRef.current?.setIndicators(indicators);
    }, [indicators]);

    useEffect(() => {
        hostRef.current?.setTimeVisible(isTimeVisible(intervalId));
    }, [intervalId]);

    // A new symbol or interval arrives framed to its own bars; the trader's zoom is kept otherwise.
    useEffect(() => {
        if (!set || !symbol) return;
        const host = hostRef.current;
        if (!host) return;
        const key = `${symbol}|${intervalId}`;
        if (fitted.current === key) return;
        fitted.current = key;
        ignoreUntil.current = performance.now() + 150;
        // After the commit is painted, and only once the pane has a real width: a fit at zero width
        // leaves the bars squeezed against the axis, which is worse than no fit at all.
        let tries = 0;
        let frame = 0;
        const attempt = () => {
            const el = elRef.current;
            if (!el) return;
            if (el.clientWidth < 40 && tries < 30) {
                tries += 1;
                frame = requestAnimationFrame(attempt);
                return;
            }
            host.fit();
        };
        frame = requestAnimationFrame(attempt);
        return () => cancelAnimationFrame(frame);
    }, [set, symbol, intervalId]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host || !crosshair || crosshair.from === paneIndex) return;
        if (!ready.current) return;
        ignoreUntil.current = performance.now() + 150;
        if (crosshair.value) {
            host.chart.setCrosshairPosition(
                crosshair.value.price,
                crosshair.value.time as UTCTimestamp,
                host.price,
            );
        } else {
            host.chart.clearCrosshairPosition();
        }
    }, [crosshair, paneIndex]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host || !range || range.from === paneIndex) return;
        if (!ready.current) return;
        ignoreUntil.current = performance.now() + 150;
        host.chart.timeScale().setVisibleLogicalRange({ from: range.value.from, to: range.value.to });
    }, [range, paneIndex]);

    const change = sessionChange((intervalId === '1d' ? set?.candles : daySet?.candles) ?? []);
    const name = symbol ? universeName(symbol, lang) : null;
    const busy = status === 'loading';
    const quotedCurrency = (intervalId === '1d' ? set : daySet)?.currency ?? 'USD';

    return (
        <section
            className={cn('card relative flex min-h-[320px] flex-col overflow-hidden', className)}
            aria-label={symbol ? `${symbol} chart` : tx(lang, 'chart.grid.empty')}
        >
            {/* A refresh in flight never blanks the pane: a hairline at the top says it is working. */}
            {busy && (
                <span className="absolute inset-x-0 top-0 z-10 h-px overflow-hidden bg-line" aria-hidden="true">
                    <span className="block h-full w-1/3 animate-pulse bg-brand" />
                </span>
            )}

            <header className="relative z-20 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-2.5 py-1.5">
                {symbol ? (
                    <>
                        <button
                            type="button"
                            onClick={() => setPicking((value) => !value)}
                            aria-expanded={picking}
                            className="pill mono h-6 gap-1 px-2 text-[12px] font-semibold"
                            title={tx(lang, 'chart.grid.pickSymbol')}
                            dir="ltr"
                        >
                            {symbol}
                            <ChevronDown className="size-3" />
                        </button>
                        {name && (
                            <span className="min-w-0 flex-1 truncate text-[11.5px] text-faint" title={name}>
                                {name}
                            </span>
                        )}
                        {change && (
                            <span className="ms-auto flex items-baseline gap-1.5" dir="ltr">
                                <Price value={change.price} currency={quotedCurrency} lang={lang} className="num text-[12.5px] font-semibold" />
                                <span
                                    className={cn(
                                        'num rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold',
                                        change.change > 0 && 'bg-up-soft text-up',
                                        change.change < 0 && 'bg-down-soft text-down',
                                        change.change === 0 && 'text-faint',
                                    )}
                                >
                                    {change.change > 0 ? '+' : ''}
                                    {arDigits(change.percent.toFixed(2), lang)}%
                                </span>
                            </span>
                        )}
                        <a
                            href={`/stocks/${encodeURIComponent(symbol)}`}
                            className="icon-btn"
                            aria-label={tx(lang, 'chart.grid.open')}
                            title={tx(lang, 'chart.grid.open')}
                        >
                            <ArrowUpRight />
                        </a>
                        <button
                            type="button"
                            onClick={onClear}
                            className="icon-btn"
                            aria-label={tx(lang, 'chart.grid.clear')}
                            title={tx(lang, 'chart.grid.clear')}
                        >
                            <X />
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        onClick={() => setPicking(true)}
                        aria-expanded={picking}
                        className="pill h-6 px-2 text-[11.5px]"
                    >
                        {tx(lang, 'chart.grid.pickSymbol')}
                    </button>
                )}

                {picking && (
                    <PaneSearch
                        lang={lang}
                        symbols={symbols}
                        paneIndex={paneIndex}
                        watchlist={watchlist}
                        onPick={(picked) => {
                            setPicking(false);
                            onSymbol(picked);
                        }}
                        onClose={() => setPicking(false)}
                    />
                )}
            </header>

            <div className="relative min-h-0 flex-1">
                {/* The canvas host stays mounted so the chart survives every state change. */}
                <div ref={elRef} data-chart="pane" className="absolute inset-0" dir="ltr" />

                {symbol && status === 'ready' && <ChartLegend lang={lang} readout={readout} />}

                {!symbol && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-card/80 p-4 text-center backdrop-blur-[1px]">
                        <p className="text-[13px] font-semibold">{tx(lang, 'chart.grid.empty')}</p>
                        <p className="max-w-56 text-[11.5px] text-faint">{tx(lang, 'chart.grid.emptyHint')}</p>
                        <button type="button" onClick={() => setPicking(true)} className="pill mt-1 h-7 px-2.5 text-[11.5px]">
                            {tx(lang, 'chart.grid.pickSymbol')}
                        </button>
                    </div>
                )}

                {symbol && status === 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-card/85 p-4 text-center">
                        <p className="text-[12.5px] text-faint">
                            {tx(lang, 'chart.grid.noCandles').replace('{s}', symbol)}
                        </p>
                        <button
                            type="button"
                            onClick={() => setNonce((value) => value + 1)}
                            className="pill h-7 gap-1.5 px-2.5 text-[11.5px]"
                        >
                            <RefreshCw className="size-3" /> {tx(lang, 'chart.grid.retry')}
                        </button>
                    </div>
                )}

                {symbol && !set && status === 'loading' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-card/60">
                        <Loader2 className="size-4 animate-spin text-faint" aria-label={tx(lang, 'chart.loading')} />
                    </div>
                )}
            </div>
        </section>
    );
}

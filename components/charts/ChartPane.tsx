'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowUpRight,
    ChevronDown,
    Eye,
    EyeOff,
    List,
    Loader2,
    Lock,
    MousePointer2,
    Pencil,
    Redo2,
    RefreshCw,
    Trash2,
    Undo2,
    Unlock,
    X,
} from 'lucide-react';
import {
    type LogicalRange,
    type MouseEventParams,
    type UTCTimestamp,
} from 'lightweight-charts';
import { createCandleHost, type CandleHost } from '@/lib/candle-host';
import { readChartType } from '@/lib/chart-view';
import type { StudyConfig } from '@/lib/chart-studies';
import { sessionChange, universeName } from '@/lib/chart-grid';
import { getCompareCandles, getStrategyCandles, getSymbolCandles } from '@/lib/actions/yahoo-candles.actions';
import type { Candle, CandleSet } from '@/lib/yahoo-candles';
import Price from '@/components/Price';
import PaneSearch from '@/components/charts/PaneSearch';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { clipToCursor } from '@/lib/chart-grid';
import ChartLegend from '@/components/stocks/ChartLegend';
import ChartDrawings, { type ActiveTool } from '@/components/stocks/ChartDrawings';
import ToolPalette from '@/components/stocks/ToolPalette';
import type { ToolEntry } from '@/lib/tools/catalog';
import {
    carriesText,
    drawingColor,
    isColorKey,
    loadDrawings,
    nearestTime,
    nextColor,
    saveDrawings,
    toolDef,
    translateDrawing,
    visibleOn,
    withPoint,
    withText,
    type DrawPoint,
    type Drawing,
    type ScreenPoint,
} from '@/lib/chart-drawings';
import { TOOL_LABEL_KEYS } from '@/lib/drawing-groups';
import { applyHistory, canRedo, canUndo, checkpointHistory, createHistory, redoHistory, undoHistory, type History } from '@/lib/chart-history';
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
    studies: StudyConfig[];
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
    studies,
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

    // The pane's own drawings. They are the same shapes the symbol page keeps — same storage key,
    // same tools — so a trendline drawn in the grid is there when the symbol is opened alone, and
    // the other way round. The history is per pane: undo in one pane must not rewind another.
    const [timeline, setTimeline] = useState<History<Drawing[]>>(() => createHistory<Drawing[]>([]));
    const drawings = timeline.present;
    const [selectedIds, setSelectedId] = useState<string[]>([]);
    const [tool, setTool] = useState<ActiveTool | null>(null);
    const [noteText, setNoteText] = useState('');
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [listOpen, setListOpen] = useState(false);
    const [editRequest, setEditRequest] = useState<{ id: string; nonce: number } | null>(null);
    const [drawingsHidden, setDrawingsHidden] = useState(false);
    // A resize moves the chart's coordinates without changing its visible range; this counter is
    // what repaints the drawings layer so a shape stays under the pointer after the pane resizes.
    const [, setFrame] = useState(0);
    const gestureStart = useRef<Drawing[] | null>(null);
    const bodyAnchor = useRef<Map<string, DrawPoint[]> | null>(null);

    const setDrawings = useCallback((updater: Drawing[] | ((list: Drawing[]) => Drawing[])) => {
        setTimeline((history) => applyHistory(history, typeof updater === 'function' ? updater(history.present) : updater));
    }, []);

    // A symbol change is a different chart: its own shapes, its own history, nothing selected.
    useEffect(() => {
        setTimeline(createHistory(symbol ? loadDrawings(symbol) : []));
        setSelectedId([]);
        setTool(null);
        setNoteText('');
        setListOpen(false);
        setEditRequest(null);
    }, [symbol]);

    // Every edit is written straight through, so a reload or a trip to the symbol page keeps it.
    useEffect(() => {
        if (!symbol) return;
        saveDrawings(symbol, drawings);
    }, [symbol, drawings]);

    const fromScreen = useCallback((x: number, y: number): DrawPoint | null => {
        const host = hostRef.current;
        if (!host) return null;
        const time = host.chart.timeScale().coordinateToTime(x);
        const price = host.price.coordinateToPrice(y);
        if (time == null || price == null) return null;
        return { time: Number(time), price: Number(price) };
    }, []);

    const beginGesture = useCallback(() => {
        setTimeline((history) => {
            gestureStart.current = history.present;
            return history;
        });
    }, []);
    const endGesture = useCallback(() => {
        const before = gestureStart.current;
        gestureStart.current = null;
        if (!before) return;
        setTimeline((history) => checkpointHistory(history, before));
    }, []);
    const undo = useCallback(() => {
        setTimeline((history) => undoHistory(history));
        setSelectedId([]);
    }, []);
    const redo = useCallback(() => {
        setTimeline((history) => redoHistory(history));
        setSelectedId([]);
    }, []);
    const beginBodyDrag = (ids: string[]) => {
        const anchors = new Map(
            drawings
                .filter((item) => ids.includes(item.id))
                .map((item) => [item.id, item.points.map((point) => ({ ...point }))] as const),
        );
        if (anchors.size === 0) return;
        beginGesture();
        bodyAnchor.current = anchors;
    };
    const moveBody = (ids: string[], delta: { time: number; price: number }) => {
        const anchors = bodyAnchor.current;
        if (!anchors || anchors.size === 0) return;
        const moving = new Set(ids);
        setTimeline((history) => ({
            ...history,
            present: history.present.map((item) => {
                if (!moving.has(item.id)) return item;
                const points = anchors.get(item.id);
                return points ? translateDrawing({ ...item, points }, delta) : item;
            }),
        }));
    };
    const moveHandle = (id: string, index: number, point: DrawPoint) =>
        setTimeline((history) => ({
            ...history,
            present: history.present.map((item) => (item.id === id ? withPoint(item, index, point) : item)),
        }));
    const editText = (id: string, text: string) => setDrawings((list) => list.map((item) => (item.id === id ? withText(item, text) : item)));
    const deleteSelected = () => {
        if (selectedIds.length === 0) return;
        const gone = new Set(selectedIds);
        setDrawings((list) => list.filter((item) => !gone.has(item.id)));
        setSelectedId([]);
    };
    const selectOnly = (id: string | null) => setSelectedId(id ? [id] : []);
    const removeDrawing = (id: string) => {
        setDrawings((list) => list.filter((item) => item.id !== id));
        setSelectedId((current) => current.filter((selected) => selected !== id));
    };
    const cycleColor = (id: string) =>
        setDrawings((list) =>
            list.map((item) =>
                item.id === id ? { ...item, color: nextColor(isColorKey(item.color) ? item.color : toolDef(item.tool).defaultColor) } : item,
            ),
        );
    const toggleLock = (id: string) => setDrawings((list) => list.map((item) => (item.id === id ? { ...item, locked: !item.locked } : item)));
    const toggleHidden = (id: string) => setDrawings((list) => list.map((item) => (item.id === id ? { ...item, hidden: !item.hidden } : item)));
    // The same two toggles for the whole selection, so a group can be hidden or locked in one click.
    const toggleLockSelected = () => {
        if (selectedIds.length === 0) return;
        const chosen = new Set(selectedIds);
        const lock = !drawings.filter((item) => chosen.has(item.id)).every((item) => item.locked);
        setDrawings((list) => list.map((item) => (chosen.has(item.id) ? { ...item, locked: lock } : item)));
    };
    const toggleHiddenSelected = () => {
        if (selectedIds.length === 0) return;
        const chosen = new Set(selectedIds);
        const hide = !drawings.filter((item) => chosen.has(item.id)).every((item) => item.hidden);
        setDrawings((list) => list.map((item) => (chosen.has(item.id) ? { ...item, hidden: hide } : item)));
    };
    const summary = (drawing: Drawing) => {
        if (carriesText(drawing.tool)) return drawing.text ?? '';
        const prices = drawing.points.map((point) => point.price.toFixed(2));
        return prices.length === 1 ? prices[0] : `${prices[0]} → ${prices[prices.length - 1]}`;
    };
    const toolLabel = (drawing: Drawing) => tx(lang, TOOL_LABEL_KEYS[drawing.tool]);
    const insertTool = (entry: ToolEntry) => {
        setPaletteOpen(false);
        if (entry.family !== 'drawing') return;
        setTool(entry.key as ActiveTool);
    };
    const visibleDrawings = useMemo(() => drawings.filter((drawing) => visibleOn(drawing, intervalId)), [drawings, intervalId]);

    const publishCrosshair = useRef(onCrosshair);
    const publishRange = useRef(onRange);
    publishCrosshair.current = onCrosshair;
    publishRange.current = onRange;

    // One host for the pane's life: data, indicators and the axis move through it.
    useEffect(() => {
        const el = elRef.current;
        if (!el) return;

        // The grid draws whatever type the chart is set to: the /charts panes used to always be
        // candles, which made the same symbol look different on the two pages.
        const host = createCandleHost(el, {
            timeVisible: false,
            chartType: readChartType(window.localStorage),
            // A study that names a symbol draws only when the pane can fetch it; the grid uses the
            // same action and cache as the symbol page rather than a second data path. The interval
            // arrives through setInterval below, because this host outlives it.
            loadSymbol: getCompareCandles,
            onRangeChange: () => setFrame((frame) => frame + 1),
        });
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

    // The bars on screen, so a drawing stored on another interval can snap to the nearest one.
    const barTimes = useMemo(() => view?.candles.map((candle) => candle.time) ?? [], [view]);

    const toScreen = useCallback(
        (point: DrawPoint): ScreenPoint | null => {
            const host = hostRef.current;
            if (!host) return null;
            const time = nearestTime(barTimes, point.time);
            if (time == null) return null;
            const x = host.chart.timeScale().timeToCoordinate(time as UTCTimestamp);
            const y = host.price.priceToCoordinate(point.price);
            return x == null || y == null ? null : { x, y };
        },
        [barTimes],
    );

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
        hostRef.current?.setStudies(studies);
    }, [studies]);

    useEffect(() => {
        hostRef.current?.setTimeVisible(isTimeVisible(intervalId));
        hostRef.current?.setInterval(intervalId);
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
            className={cn(
                'card relative flex min-h-[320px] flex-col overflow-hidden',
                // The tool palette hangs below the header, over the chart and often over the pane
                // beneath it. While it is open this pane has to sit above its siblings and stop
                // clipping, or the next pane's header paints over the list.
                paletteOpen && 'z-30 overflow-visible',
                className,
            )}
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
                        {/* The pane's drawing controls: the same tools as the symbol page, folded into
                            a row of glyphs so a grid of four panes still has room for its charts. */}
                        {status === 'ready' && !replay && (
                            <div className="relative flex items-center gap-0.5" role="group" aria-label={tx(lang, 'chart.drawings')}>
                                <button
                                    type="button"
                                    onClick={() => setPaletteOpen((value) => !value)}
                                    aria-expanded={paletteOpen}
                                    aria-label={tx(lang, 'chart.draw')}
                                    title={tx(lang, 'chart.draw')}
                                    className={cn('icon-btn size-6', (paletteOpen || (tool && tool !== 'select')) && 'is-up')}
                                >
                                    <Pencil className="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTool((current) => (current === 'select' ? null : 'select'))}
                                    aria-pressed={tool === 'select'}
                                    aria-label={tx(lang, 'chart.select')}
                                    title={tx(lang, 'chart.select')}
                                    className={cn('icon-btn size-6', tool === 'select' && 'is-up')}
                                >
                                    <MousePointer2 className="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={undo}
                                    disabled={!canUndo(timeline)}
                                    aria-label={tx(lang, 'chart.undo')}
                                    title={tx(lang, 'chart.undo')}
                                    className="icon-btn size-6 disabled:opacity-40"
                                >
                                    <Undo2 className="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={redo}
                                    disabled={!canRedo(timeline)}
                                    aria-label={tx(lang, 'chart.redo')}
                                    title={tx(lang, 'chart.redo')}
                                    className="icon-btn size-6 disabled:opacity-40"
                                >
                                    <Redo2 className="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={deleteSelected}
                                    disabled={selectedIds.length === 0}
                                    aria-label={tx(lang, 'chart.delete')}
                                    title={tx(lang, 'chart.delete')}
                                    className="icon-btn size-6 disabled:opacity-40"
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDrawingsHidden((value) => !value)}
                                    aria-pressed={drawingsHidden}
                                    aria-label={tx(lang, drawingsHidden ? 'chart.showDrawings' : 'chart.hideDrawings')}
                                    title={tx(lang, drawingsHidden ? 'chart.showDrawings' : 'chart.hideDrawings')}
                                    className={cn('icon-btn size-6', drawingsHidden && 'is-up')}
                                >
                                    {drawingsHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setListOpen((value) => !value)}
                                    disabled={drawings.length === 0}
                                    aria-expanded={listOpen}
                                    aria-label={tx(lang, 'chart.list')}
                                    title={tx(lang, 'chart.list')}
                                    className={cn('icon-btn size-6 disabled:opacity-40', listOpen && 'is-up')}
                                >
                                    <List className="size-3.5" />
                                </button>
                                {listOpen && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => setListOpen(false)} />
                                        {/* A dropdown rather than a strip: a grid pane has no height to spare,
                                            and the list is a reference, not part of the chart. */}
                                        <div className="absolute end-0 top-full z-30 mt-1 w-64 rounded-[10px] border border-line bg-card p-1 shadow-[0_12px_32px_oklch(0_0_0/0.45)]">
                                            <div className="flex items-center gap-2 px-2 py-1">
                                                <span className="flex-1 text-[11px] font-semibold text-faint">
                                                    {tx(lang, 'chart.list')} · {arDigits(drawings.length, lang)}
                                                </span>
                                                {selectedIds.length > 0 && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={toggleHiddenSelected}
                                                            className="text-[10.5px] font-semibold text-faint hover:text-foreground"
                                                        >
                                                            {tx(lang, 'chart.hide')} · {arDigits(selectedIds.length, lang)}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={toggleLockSelected}
                                                            className="text-[10.5px] font-semibold text-faint hover:text-foreground"
                                                        >
                                                            {tx(lang, 'chart.tool.lock')} · {arDigits(selectedIds.length, lang)}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                                                {drawings.map((drawing) => (
                                                    <div
                                                        key={drawing.id}
                                                        className={cn(
                                                            'flex items-center gap-1.5 rounded-[8px] px-1.5 py-1 text-[12px]',
                                                            selectedIds.includes(drawing.id) && 'bg-hover',
                                                        )}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => cycleColor(drawing.id)}
                                                            title={tx(lang, 'chart.color')}
                                                            aria-label={`${tx(lang, 'chart.color')}: ${drawingColor(drawing)}`}
                                                            className="size-3.5 shrink-0 rounded-full border border-line-strong"
                                                            style={{ backgroundColor: drawingColor(drawing) }}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={(event) => {
                                                                // Shift (or a command key) adds to the selection, the same
                                                                // rule the canvas follows, so the two views agree.
                                                                if (event.shiftKey || event.metaKey || event.ctrlKey) {
                                                                    setSelectedId((current) =>
                                                                        current.includes(drawing.id)
                                                                            ? current.filter((id) => id !== drawing.id)
                                                                            : [...current, drawing.id],
                                                                    );
                                                                } else {
                                                                    selectOnly(drawing.id);
                                                                }
                                                            }}
                                                            className="flex min-w-0 flex-1 items-center gap-1.5 text-start"
                                                        >
                                                            <span className="shrink-0 font-semibold">{toolLabel(drawing)}</span>
                                                            <span className="mono num truncate text-[11px] text-faint">{summary(drawing)}</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleHidden(drawing.id)}
                                                            aria-pressed={!!drawing.hidden}
                                                            title={tx(lang, drawing.hidden ? 'chart.show' : 'chart.hide')}
                                                            aria-label={tx(lang, drawing.hidden ? 'chart.show' : 'chart.hide')}
                                                            className={cn('icon-btn size-5', drawing.hidden && 'text-warn')}
                                                        >
                                                            {drawing.hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleLock(drawing.id)}
                                                            aria-pressed={!!drawing.locked}
                                                            title={tx(lang, drawing.locked ? 'chart.tool.unlock' : 'chart.tool.lock')}
                                                            aria-label={tx(lang, drawing.locked ? 'chart.tool.unlock' : 'chart.tool.lock')}
                                                            className={cn('icon-btn size-5', drawing.locked && 'text-warn')}
                                                        >
                                                            {drawing.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                                                        </button>
                                                        {carriesText(drawing.tool) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditRequest({ id: drawing.id, nonce: Date.now() })}
                                                                title={tx(lang, 'chart.editText')}
                                                                aria-label={tx(lang, 'chart.editText')}
                                                                className="icon-btn size-5"
                                                            >
                                                                <Pencil className="size-3" />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => removeDrawing(drawing.id)}
                                                            title={tx(lang, 'chart.delete')}
                                                            aria-label={tx(lang, 'chart.delete')}
                                                            className="icon-btn is-danger size-5"
                                                        >
                                                            <Trash2 className="size-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                                {paletteOpen && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => setPaletteOpen(false)} />
                                        <ToolPalette lang={lang} onInsert={insertTool} onClose={() => setPaletteOpen(false)} />
                                    </>
                                )}
                            </div>
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

                {symbol && status === 'ready' && !replay && !drawingsHidden && (
                    <ChartDrawings
                        drawings={visibleDrawings}
                        selectedIds={selectedIds}
                        tool={tool}
                        text={noteText}
                        editRequest={editRequest}
                        barTimes={barTimes}
                        candles={view?.candles ?? []}
                        toScreen={toScreen}
                        fromScreen={fromScreen}
                        onCommit={(drawing) => setDrawings((list) => [...list, drawing])}
                        onSelect={setSelectedId}
                        onMoveHandle={moveHandle}
                        onMoveBody={moveBody}
                        onMoveBodyStart={beginBodyDrag}
                        onGestureStart={beginGesture}
                        onGestureEnd={endGesture}
                        onEditText={editText}
                        onToolConsumed={() => setTool(null)}
                        label={(key) => tx(lang, key)}
                    />
                )}

                {symbol && status === 'ready' && <ChartLegend lang={lang} readout={readout} studies={studies} />}

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

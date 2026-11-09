'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Copy, Link2, Pause, Play, RefreshCw, Shuffle, SkipBack, SkipForward, X } from 'lucide-react';
import ChartPane, { type CrosshairSync, type RangeSync } from '@/components/charts/ChartPane';
import LayoutPicker from '@/components/charts/LayoutPicker';
import ChartStudiesMenu from '@/components/stocks/ChartStudiesMenu';
import {
    CHART_LAYOUTS,
    INTERVAL_LABEL_KEYS,
    MAX_PANES,
    paneDrawingKey,
    paneSymbols,
    parseGridState,
    serializeGridState,
    randomReplayTime,
    replayAnchor,
    replayEndTime,
    replayStartTime,
    serializeGridSymbols,
    stepReplayTime,
    type GridLayoutId,
    type GridState,
} from '@/lib/chart/grid';
import { CANDLE_INTERVALS, type Candle } from '@/lib/market/yahoo-candles';
import type { StudyConfig } from '@/lib/chart/studies';
import { readPaneStudies, readStudies, writePaneStudies } from '@/lib/chart/studies-storage';

import { REPLAY_SPEEDS, type ReplaySpeed } from '@/lib/chart/replay';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** The last workspace this browser opened, used only when the URL carries no state of its own. */
const STORAGE_KEY = 'openstock:charts-workspace';

type Props = {
    lang: Lang;
    /** Parsed on the server from the query string, so the first paint is the right screen. */
    initial: GridState;
    /** True when the URL itself said something; a shared link then beats the remembered workspace. */
    fromUrl: boolean;
    watchlist: string[];
};

const sameCrosshair = (a: CrosshairSync | null, b: CrosshairSync | null) => {
    if (!a || !b) return a === b;
    return a.time === b.time && Math.abs(a.price - b.price) < 1e-6;
};

const sameRange = (a: RangeSync, b: RangeSync) =>
    Math.abs(a.from - b.from) < 1e-6 && Math.abs(a.to - b.to) < 1e-6;

/**
 * The screen that keeps several charts in view. Every pane owns its symbol, its interval, its
 * indicators and its drawings; the crosshair and the visible range still travel between panes, so
 * four timeframes of one company read the same moment without any pane owning another.
 *
 * `linked` is the old behaviour kept as a choice: while it is on the interval buttons and the
 * indicators menu speak to the whole screen, and the drawings stay per pane either way.
 */
export default function ChartGrid({ lang, initial, fromUrl, watchlist }: Props) {
    const router = useRouter();
    const pathname = usePathname();

    const [layout, setLayout] = useState<GridLayoutId>(initial.layout);
    const [symbols, setSymbols] = useState<string[]>(initial.symbols);
    const [intervals, setIntervals] = useState<string[]>(initial.intervals);
    const [focused, setFocused] = useState(0);
    // A screen that arrives with different timeframes is already independent; a uniform one starts
    // linked, which is the behaviour the grid shipped with.
    const [linked, setLinked] = useState(() => initial.intervals.every((value) => value === initial.intervals[0]));
    // One study list per pane, the same lists the symbol page uses. A study screen wants a
    // different indicator on the weekly pane than on the five-minute one.
    const [studiesByPane, setStudiesByPane] = useState<StudyConfig[][]>(() =>
        Array.from({ length: MAX_PANES }, () => [] as StudyConfig[]),
    );
    const updateStudies = (next: StudyConfig[]) => {
        setStudiesByPane((current) => {
            const panes = Array.from({ length: MAX_PANES }, (_, index) => current[index] ?? []);
            const targets = linked ? panes.map((_, index) => index) : [focused];
            targets.forEach((index) => {
                panes[index] = next;
            });
            writePaneStudies(window.localStorage, panes);
            return panes;
        });
    };
    // The lists belong to the browser, not the page: read them after mount so the server and the
    // first client render agree on an empty chart, then the trader's own indicators.
    useEffect(() => {
        const stored = readPaneStudies(window.localStorage);
        if (stored.length > 0) {
            setStudiesByPane(Array.from({ length: MAX_PANES }, (_, index) => stored[index] ?? []));
            return;
        }
        const seed = readStudies(window.localStorage);
        setStudiesByPane(Array.from({ length: MAX_PANES }, () => seed));
    }, []);

    const [refreshNonce, setRefreshNonce] = useState(0);
    const [crosshair, setCrosshair] = useState<{ from: number; value: CrosshairSync | null } | null>(null);
    const [range, setRange] = useState<{ from: number; value: RangeSync } | null>(null);
    // Replay across the panes: one cursor time for the whole screen, stepped on the longest pane's
    // scale. The paper account stays on the symbol page — the grid is for watching, not for trading
    // four symbols out of one account.
    const [replay, setReplay] = useState(false);
    const [cursorTime, setCursorTime] = useState<number | null>(null);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState<ReplaySpeed>(2);
    const seriesRef = useRef<Map<string, readonly Candle[]>>(new Map());
    // The cursor lives in a ref as well as in state: playback ticks faster than React can re-render
    // two TradingView panes, so the next tick must start from the bar the last tick reached, not
    // from the last painted state.
    const cursorTimeRef = useRef<number | null>(null);
    // Until the trader touches the transport the start may still move: a pane that reports late can
    // carry a later warm-up bar, and the untouched replay should begin where every pane is warm.
    const cursorTouched = useRef(false);
    const [seriesVersion, setSeriesVersion] = useState(0);

    const t = useCallback((key: Parameters<typeof tx>[1]) => tx(lang, key), [lang]);

    // The remembered workspace is read after mount: the server has no storage, and a link must win.
    useEffect(() => {
        if (fromUrl) return;
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const stored = JSON.parse(raw) as { l?: string; s?: string; i?: string; is?: string };
            const next = parseGridState(
                { l: stored.l, s: stored.s, i: stored.i, is: stored.is },
                { symbols: initial.symbols, intervalId: initial.intervalId },
            );
            setLayout(next.layout);
            setSymbols(next.symbols);
            setIntervals(next.intervals);
            setLinked(next.intervals.every((value) => value === next.intervals[0]));
        } catch {
            /* private mode: the defaults from the server stand */
        }
        // Only on mount: after that the workspace belongs to the trader, not to the storage.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // The workspace lives in the URL and in this browser, written behind a short debounce so a burst
    // of clicks produces one history entry and one storage write.
    useEffect(() => {
        const base = intervals[0] ?? initial.intervalId;
        const query = serializeGridState({ layout, symbols, intervalId: base, intervals });
        const stored = serializeGridSymbols(symbols);
        const timer = window.setTimeout(() => {
            try {
                window.localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify({ l: String(layout), s: stored, i: base, is: intervals.join(',') }),
                );
            } catch {
                /* private mode: the workspace simply is not remembered */
            }
            if (window.location.search.replace(/^\?/, '') !== query) {
                router.replace(`${pathname}?${query}`, { scroll: false });
            }
        }, 300);
        return () => window.clearTimeout(timer);
    }, [layout, symbols, intervals, initial.intervalId, pathname, router]);

    const panes = CHART_LAYOUTS[layout].panes;
    // A single chart is the screen, not a 320px strip in the middle of it. Two-up gets half the
    // window too; three and four stay at the pane's own minimum so the grid still scans as a grid.
    const paneHeight =
        layout === 1
            ? 'min-h-[clamp(460px,calc(100dvh-210px),920px)]'
            : layout === 2
                ? 'lg:min-h-[clamp(420px,56dvh,720px)]'
                : '';
    const slots = useMemo(() => paneSymbols(symbols, panes), [symbols, panes]);
    const timeframes = useMemo(
        () => CANDLE_INTERVALS.map((item) => ({ id: item.id as string, label: t(INTERVAL_LABEL_KEYS[item.id] ?? 'chart.tf.1d') })),
        [t],
    );

    const intervalOf = useCallback(
        (index: number) => intervals[index] ?? intervals[0] ?? initial.intervalId,
        [intervals, initial.intervalId],
    );
    const focusedInterval = intervalOf(focused);

    /** The interval buttons speak to the focused pane, or to every pane while the screen is linked. */
    const chooseInterval = (id: string) => {
        setIntervals((current) => {
            const next = Array.from({ length: MAX_PANES }, (_, index) => current[index] ?? initial.intervalId);
            if (linked) next.fill(id);
            else next[focused] = id;
            return next;
        });
    };

    const toggleLink = () => {
        setLinked((value) => {
            // Linking a screen that had drifted brings every pane onto the focused one, which is
            // what the next interval click would have done anyway.
            if (!value) {
                setIntervals((current) =>
                    Array.from({ length: MAX_PANES }, () => current[focused] ?? initial.intervalId),
                );
            }
            return !value;
        });
    };

    /** The focused pane's company, in every pane: four timeframes of one name to study. */
    const copySymbolToAll = () => {
        const symbol = slots[focused];
        if (!symbol) return;
        setSymbols(Array.from({ length: panes }, () => symbol));
    };

    /**
     * The study preset: one company on four horizons — a month, a week, a day and an hour — so the
     * screen is a top-down read rather than four unrelated charts. Indicators stay per pane.
     */
    const applyFourTimeframes = () => {
        const symbol = slots[focused];
        setLayout(4);
        setIntervals(['1mo', '1wk', '1d', '60m']);
        setLinked(false);
        setFocused(0);
        if (symbol) setSymbols([symbol, symbol, symbol, symbol]);
    };

    /** One render frame carries one crosshair update, however many pointers are moving. */
    const pendingCrosshair = useRef<{ from: number; value: CrosshairSync | null } | null>(null);
    const crosshairFrame = useRef<number | null>(null);

    const publishCrosshair = useCallback((from: number) => (value: CrosshairSync | null) => {
        pendingCrosshair.current = { from, value };
        if (crosshairFrame.current !== null) return;
        crosshairFrame.current = requestAnimationFrame(() => {
            crosshairFrame.current = null;
            const next = pendingCrosshair.current;
            if (!next) return;
            setCrosshair((current) =>
                current && current.from === next.from && sameCrosshair(current.value, next.value)
                    ? current
                    : next,
            );
        });
    }, []);

    useEffect(
        () => () => {
            if (crosshairFrame.current !== null) cancelAnimationFrame(crosshairFrame.current);
        },
        [],
    );

    const publishRange = useCallback((from: number) => (value: RangeSync) => {
        setRange((current) =>
            current && current.from === from && sameRange(current.value, value) ? current : { from, value },
        );
    }, []);

    const chooseLayout = (id: GridLayoutId) => {
        setLayout(id);
        // The panes that are no longer shown are dropped, and a widened screen starts with empty
        // panes rather than inventing symbols, so the URL never claims more than the screen shows.
        setSymbols((current) => paneSymbols(current, CHART_LAYOUTS[id].panes));
        // The toolbar cannot speak to a pane that just disappeared.
        setFocused((current) => Math.min(current, CHART_LAYOUTS[id].panes - 1));
    };

    const seriesList = useCallback(() => [...seriesRef.current.values()], []);

    const onReplaySeries = useCallback((paneSymbol: string, candles: readonly Candle[]) => {
        seriesRef.current.set(paneSymbol, candles);
        // The version is what the "start the shared cursor" effect watches: the map itself lives in
        // a ref, so without it the effect would never see the panes arrive.
        setSeriesVersion((value) => value + 1);
    }, []);

    /** The one way the cursor moves: the ref is the truth, the state is only what got painted. */
    const moveCursor = useCallback((at: number | null) => {
        cursorTimeRef.current = at;
        setCursorTime(at);
    }, []);

    const toggleReplay = () => {
        setPlaying(false);
        setReplay((value) => !value);
        moveCursor(null);
        cursorTouched.current = false;
        seriesRef.current.clear();
    };

    // The shared cursor starts once the panes have reported their series: the latest warm-up bar,
    // so every pane has something to draw behind it.
    useEffect(() => {
        if (!replay) return;
        const start = replayStartTime(seriesList());
        if (start == null) return;
        if (cursorTimeRef.current == null) {
            moveCursor(start);
        } else if (!cursorTouched.current && start > cursorTimeRef.current) {
            moveCursor(start);
        }
    }, [replay, seriesVersion, seriesList, moveCursor]);

    const step = useCallback(
        (delta: number) => {
            const next = stepReplayTime(seriesList(), cursorTimeRef.current, delta);
            if (next == null) return;
            cursorTouched.current = true;
            moveCursor(next);
        },
        [seriesList, moveCursor],
    );

    // A step is a bar on the anchor's scale, so the speed means bars per second on every pane.
    useEffect(() => {
        if (!replay || !playing) return;
        cursorTouched.current = true;
        const id = window.setInterval(() => {
            const next = stepReplayTime(seriesList(), cursorTimeRef.current, 1);
            if (next == null) return;
            if (next === cursorTimeRef.current) {
                setPlaying(false);
                return;
            }
            moveCursor(next);
        }, Math.max(80, Math.round(1000 / speed)));
        return () => window.clearInterval(id);
    }, [replay, playing, speed, seriesList, moveCursor]);

    /** A direct jump (random, last bar) is a decision too: the start stops re-anchoring. */
    const jumpTo = (at: number | null) => {
        if (at == null) return;
        cursorTouched.current = true;
        moveCursor(at);
    };

    /** Where the shared cursor stands on the anchor: bar i of n, and its day. */
    const replayCursors = () => {
        const anchor = replayAnchor(seriesList());
        if (!anchor || cursorTime == null) return t('chart.grid.replayWaiting');
        const index = anchor.findIndex((bar) => bar.time >= cursorTime);
        return t('chart.grid.replayAt')
            .replace('{i}', arDigits(Math.max(1, index + 1), lang))
            .replace('{n}', arDigits(anchor.length, lang))
            .replace('{d}', new Date(cursorTime * 1000).toISOString().slice(0, 10));
    };

    const setPaneSymbol = (index: number, symbol: string) => {
        setSymbols((current) => {
            const next = paneSymbols(current, panes);
            next[index] = symbol;
            return next;
        });
    };

    const clearPane = (index: number) => {
        setSymbols((current) => {
            const next = paneSymbols(current, panes);
            next[index] = '';
            return next;
        });
    };

    return (
        <div className="flex flex-col gap-2.5">
            <div className="chart-toolbar" dir="ltr">
                <LayoutPicker value={layout} onChange={chooseLayout} lang={lang} />
                <span className="mx-1 h-4 w-px bg-line" />
                {timeframes.map((timeframe) => (
                    <button
                        key={timeframe.id}
                        type="button"
                        onClick={() => chooseInterval(timeframe.id)}
                        className={cn('pill h-7 px-2.5 text-[12px]', focusedInterval === timeframe.id && 'is-up')}
                        aria-pressed={focusedInterval === timeframe.id}
                    >
                        {timeframe.label}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={toggleLink}
                    className={cn('pill h-7 gap-1 px-2 text-[11.5px]', linked && 'is-up')}
                    aria-pressed={linked}
                    title={tx(lang, linked ? 'chart.grid.linked' : 'chart.grid.unlinked')}
                >
                    <Link2 className="size-3.5" />
                    {tx(lang, linked ? 'chart.grid.linkedShort' : 'chart.grid.unlinkedShort')}
                </button>
                <span className="mx-1 h-4 w-px bg-line" />
                <ChartStudiesMenu lang={lang} studies={studiesByPane[focused] ?? []} onChange={updateStudies} />
                <button
                    type="button"
                    onClick={copySymbolToAll}
                    disabled={!slots[focused]}
                    className="icon-btn size-7 disabled:opacity-40"
                    aria-label={t('chart.grid.copySymbol')}
                    title={t('chart.grid.copySymbol')}
                >
                    <Copy className="size-3.5" />
                </button>
                <button
                    type="button"
                    onClick={applyFourTimeframes}
                    className="pill h-7 px-2 text-[11.5px]"
                    aria-label={t('chart.grid.fourTimeframes')}
                    title={t('chart.grid.fourTimeframes')}
                >
                    {t('chart.grid.fourTimeframes')}
                </button>
                <button
                    type="button"
                    onClick={toggleReplay}
                    className={cn('pill h-7 gap-1.5 px-2.5 text-[12px]', replay && 'is-up')}
                    aria-pressed={replay}
                >
                    <Play className="size-3.5" /> {t('chart.grid.replay')}
                </button>
                <button
                    type="button"
                    onClick={() => setRefreshNonce((value) => value + 1)}
                    className="icon-btn ms-auto"
                    aria-label={t('chart.grid.refresh')}
                    title={t('chart.grid.refresh')}
                >
                    <RefreshCw />
                </button>
            </div>

            {replay && (
                <div className="chart-toolbar" dir="ltr">
                    <button
                        type="button"
                        onClick={() => step(-1)}
                        className="icon-btn"
                        aria-label={t('replay.stepBack')}
                        title={t('replay.stepBack')}
                    >
                        <SkipBack className="size-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setPlaying((value) => !value)}
                        className={cn('icon-btn', playing && 'is-up')}
                        aria-label={t(playing ? 'replay.pause' : 'replay.play')}
                        title={t(playing ? 'replay.pause' : 'replay.play')}
                    >
                        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => step(1)}
                        className="icon-btn"
                        aria-label={t('replay.stepForward')}
                        title={t('replay.stepForward')}
                    >
                        <SkipForward className="size-3.5" />
                    </button>
                    <span className="mx-1 h-4 w-px bg-line" />
                    {REPLAY_SPEEDS.map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setSpeed(value)}
                            className={cn('pill h-6 px-2 text-[11px]', speed === value && 'is-up')}
                            aria-pressed={speed === value}
                        >
                            {t('replay.speedValue').replace('{n}', String(value))}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => {
                            jumpTo(randomReplayTime(seriesList()));
                        }}
                        className="pill h-6 gap-1 px-2 text-[11px]"
                    >
                        <Shuffle className="size-3" /> {t('replay.random')}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setPlaying(false);
                            jumpTo(replayEndTime(seriesList()));
                        }}
                        className="pill h-6 px-2 text-[11px]"
                    >
                        {t('replay.last')}
                    </button>
                    <span className="num text-[11px] text-faint">
                        {replayCursors()} <span className="text-faint">{t('chart.grid.replayHint')}</span>
                    </span>
                    <button type="button" onClick={toggleReplay} className="pill ms-auto h-6 gap-1 px-2 text-[11px]">
                        <X className="size-3" /> {t('replay.jumpLive')}
                    </button>
                </div>
            )}

            <div className={cn('grid gap-2.5', CHART_LAYOUTS[layout].className)}>
                {slots.map((symbol, index) => (
                    <ChartPane
                        key={index}
                        lang={lang}
                        paneIndex={index}
                        symbol={symbol}
                        watchlist={watchlist}
                        intervalId={intervalOf(index)}
                        studies={studiesByPane[index] ?? []}
                        drawingKey={paneDrawingKey(symbol, index)}
                        active={focused === index}
                        onFocus={() => setFocused(index)}
                        refreshNonce={refreshNonce}
                        crosshair={crosshair}
                        range={range}
                        onCrosshair={publishCrosshair(index)}
                        onRange={publishRange(index)}
                        onSymbol={(picked) => setPaneSymbol(index, picked)}
                        onClear={() => clearPane(index)}
                        replay={replay}
                        cursorTime={cursorTime}
                        onReplaySeries={onReplaySeries}
                        className={cn(index === 0 ? CHART_LAYOUTS[layout].firstClassName : undefined, paneHeight)}
                    />
                ))}
            </div>
        </div>
    );
}

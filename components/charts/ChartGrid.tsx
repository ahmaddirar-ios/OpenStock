'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Pause, Play, RefreshCw, Shuffle, SkipBack, SkipForward, X } from 'lucide-react';
import ChartPane, { type CrosshairSync, type RangeSync } from '@/components/charts/ChartPane';
import LayoutPicker from '@/components/charts/LayoutPicker';
import {
    CHART_LAYOUTS,
    INDICATOR_BUTTONS,
    INTERVAL_LABEL_KEYS,
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
} from '@/lib/chart-grid';
import { CANDLE_INTERVALS, type Candle } from '@/lib/yahoo-candles';
import { defaultStudy, type StudyConfig, type StudyId } from '@/lib/chart-studies';
import { readStudies, writeStudies } from '@/lib/chart-studies-storage';
import { REPLAY_SPEEDS, type ReplaySpeed } from '@/lib/replay';
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
 * The screen that keeps several symbols in view. It owns the one shared state — interval, indicators
 * and the layout — and relays the crosshair and the visible range between panes, so every pane reads
 * the same moment without any pane owning another.
 */
export default function ChartGrid({ lang, initial, fromUrl, watchlist }: Props) {
    const router = useRouter();
    const pathname = usePathname();

    const [layout, setLayout] = useState<GridLayoutId>(initial.layout);
    const [symbols, setSymbols] = useState<string[]>(initial.symbols);
    const [intervalId, setIntervalId] = useState(initial.intervalId);
    // One study list for the whole screen, the same one the symbol page uses.
    const [studies, setStudies] = useState<StudyConfig[]>([]);
    const updateStudies = (next: StudyConfig[]) => {
        setStudies(next);
        writeStudies(window.localStorage, next);
    };
    const toggleStudy = (id: StudyId) => {
        const at = studies.findIndex((study) => study.id === id);
        updateStudies(at >= 0 ? studies.filter((_, index) => index !== at) : [...studies, defaultStudy(id)]);
    };
    // The list belongs to the browser, not the page: read it after mount so the server and the
    // first client render agree on an empty chart, then the trader's own studies.
    useEffect(() => {
        setStudies(readStudies(window.localStorage));
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
            const stored = JSON.parse(raw) as { l?: string; s?: string; i?: string };
            const next = parseGridState(
                { l: stored.l, s: stored.s, i: stored.i },
                { symbols: initial.symbols },
            );
            setLayout(next.layout);
            setSymbols(next.symbols);
            setIntervalId(next.intervalId);
        } catch {
            /* private mode: the defaults from the server stand */
        }
        // Only on mount: after that the workspace belongs to the trader, not to the storage.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // The workspace lives in the URL and in this browser, written behind a short debounce so a burst
    // of clicks produces one history entry and one storage write.
    useEffect(() => {
        const query = serializeGridState({ layout, symbols, intervalId });
        const stored = serializeGridSymbols(symbols);
        const timer = window.setTimeout(() => {
            try {
                window.localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify({ l: String(layout), s: stored, i: intervalId }),
                );
            } catch {
                /* private mode: the workspace simply is not remembered */
            }
            if (window.location.search.replace(/^\?/, '') !== query) {
                router.replace(`${pathname}?${query}`, { scroll: false });
            }
        }, 300);
        return () => window.clearTimeout(timer);
    }, [layout, symbols, intervalId, pathname, router]);

    const panes = CHART_LAYOUTS[layout].panes;
    const slots = useMemo(() => paneSymbols(symbols, panes), [symbols, panes]);
    const timeframes = useMemo(
        () => CANDLE_INTERVALS.map((item) => ({ id: item.id as string, label: t(INTERVAL_LABEL_KEYS[item.id] ?? 'chart.tf.1d') })),
        [t],
    );

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
            <div className="flex flex-wrap items-center gap-1.5" dir="ltr">
                <LayoutPicker value={layout} onChange={chooseLayout} lang={lang} />
                <span className="mx-1 h-4 w-px bg-line" />
                {timeframes.map((timeframe) => (
                    <button
                        key={timeframe.id}
                        type="button"
                        onClick={() => setIntervalId(timeframe.id)}
                        className={cn('pill h-7 px-2.5 text-[12px]', intervalId === timeframe.id && 'is-up')}
                        aria-pressed={intervalId === timeframe.id}
                    >
                        {timeframe.label}
                    </button>
                ))}
                <span className="mx-1 h-4 w-px bg-line" />
                {INDICATOR_BUTTONS.map((indicator) => (
                    <button
                        key={indicator.id}
                        type="button"
                        onClick={() =>
                            toggleStudy(indicator.id)
                        }
                        className={cn('pill h-7 px-2.5 text-[12px]', studies.some((study) => study.id === indicator.id) && 'is-up')}
                        aria-pressed={studies.some((study) => study.id === indicator.id)}
                    >
                        {t(indicator.label)}
                    </button>
                ))}
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
                <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] bg-page/60 px-2.5 py-1.5" dir="ltr">
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
                        symbols={slots}
                        watchlist={watchlist}
                        intervalId={intervalId}
                        studies={studies}
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
                        className={index === 0 ? CHART_LAYOUTS[layout].firstClassName : undefined}
                    />
                ))}
            </div>
        </div>
    );
}

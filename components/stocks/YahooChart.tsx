'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    LineSeries,
    createSeriesMarkers,
    type IChartApi,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type SeriesMarker,
    type SeriesType,
    type Time,
    type UTCTimestamp,
} from 'lightweight-charts';
import {
    Bell,
    Bookmark,
    BookmarkCheck,
    BellPlus,
    BringToFront,
    Camera,
    ChevronDown,
    ClipboardPaste,
    Copy,
    CopyPlus,
    Download,
    ExternalLink,
    EyeOff,
    Eye,
    GitCompare,
    History,
    Keyboard,
    Loader2,
    Lock,
    Unlock,
    Maximize2,
    Minimize2,
    Pencil,
    Plus,
    RefreshCw,
    Repeat,
    SendToBack,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import ChartDrawings, { type ActiveTool } from '@/components/stocks/ChartDrawings';
import { nearestBar, snapPoint } from '@/lib/chart-magnet';
import { EDIT_SHORTCUTS, TOOL_SHORTCUTS, toolForKey } from '@/lib/chart-hotkeys';
import {
    TIME_ZONES,
    readTimeZone,
    writeTimeZone,
    type TimeZoneId,
} from '@/lib/chart-time';
import {
    applyHistory,
    canRedo,
    canUndo,
    checkpointHistory,
    createHistory,
    redoHistory,
    undoHistory,
    type History as DrawingHistory,
} from '@/lib/chart-history';
import StrategyMenu from '@/components/stocks/StrategyMenu';
import ReplayPanel from '@/components/stocks/ReplayPanel';
import { getYahooCandles, getCompareCandles, getStrategyCandles } from '@/lib/actions/yahoo-candles.actions';
import { CANDLE_INTERVALS, eventLabel, isCandleIntervalId, openingInterval, type CandleSet } from '@/lib/yahoo-candles';
import {
    MIN_WARMUP_BARS,
    buy as paperBuy,
    clampCursor,
    cursorForTime,
    minStartIndex,
    openAccount,
    parseSession,
    randomCursor,
    sell as paperSell,
    serializeSession,
    sessionKey,
    settleBar,
    validateBracket,
    validateOrder,
    visibleCandles,
    type Bracket,
    type Fill,
    type OrderFailure,
    type OrderType,
    type PaperAccount,
    type PendingOrder,
    type ReplayIntent,
    type ReplaySpeed,
} from '@/lib/replay';
import { toast } from 'sonner';
import { COMPARE_LIMIT, compareYahooSymbol, latestChange, normalizeCompareInputs, percentSeries } from '@/lib/compare';
import { COUNT_GLYPHS, COUNT_TOOL, DRAWING_DASHES, DRAWING_WIDTHS, TEXT_SIZES, buildTransferPayload, carriesText, cloneDrawing, drawingColor, isColorKey, layerDrawings, loadDrawings, mergeDrawings, nearestTime, newDrawingId, nextColor, parseTransferPayload, readStayDrawing, saveDrawings, toolDef, type ColorKey, type CountDegree, type CountKind, type DrawPoint, type Drawing, type DrawingDash, type DrawingWidth, type LayerMove, type ScreenPoint, type ShapeTool, withPoint, withText, writeStayDrawing } from '@/lib/chart-drawings';
import { TOOL_LABEL_KEYS } from '@/lib/drawing-groups';
import {
    loadDrawingStyles,
    saveDrawingStyles,
    styleFor,
    withDrawingStyle,
    withoutDrawingStyle,
    type DrawingStyleMap,
} from '@/lib/drawing-styles';
import DrawingRail from '@/components/stocks/DrawingRail';
import { cn, tradingViewSymbolUrl } from '@/lib/utils';
import { AUTO_SENSITIVITIES, autoCount, type AutoSensitivity } from '@/lib/auto-count';
import { createCandleHost, token, type CandleHost } from '@/lib/candle-host';
import type { StudyConfig } from '@/lib/chart-studies';
import { readStudies, writeStudies } from '@/lib/chart-studies-storage';
import {
    mergeSetup,
    readSetupPending,
    serializeChartSetup,
    setupDecision,
    setupFromLocal,
    writeSetupPending,
} from '@/lib/chart-setup';
import { loadChartSetup, saveChartSetup } from '@/lib/actions/chart-setup.actions';
import { anchorFor } from '@/lib/drawing-alert';
import { alertSource } from '@/lib/alerts';
import ChartLegend from '@/components/stocks/ChartLegend';
import type { BarReadout } from '@/lib/chart-readout';
import { INTERVAL_LABEL_KEYS } from '@/lib/chart-grid';
import ChartStudiesMenu from '@/components/stocks/ChartStudiesMenu';
import CreateAlertModal from '@/components/watchlist/CreateAlertModal';
import {
    CHART_TYPES,
    CHART_TYPE_KEYS,
    SCALE_MODES,
    parseKagiReversal,
    parseLineBreakCount,
    parseRenkoBox,
    readInvert,
    readKagiReversal,
    readLineBreakCount,
    readRenkoBox,
    writeInvert,
    writeKagiReversal,
    writeLineBreakCount,
    writeRenkoBox,
    SCALE_MODE_KEYS,
    readChartType,
    readScaleMode,
    writeChartType,
    writeScaleMode,
    type ChartType,
    type ScaleMode,
} from '@/lib/chart-view';
import { STRATEGY_IDS, type StrategyId } from '@/lib/strategies';
import { arDigits, fillReasonLabel, tx, type Lang, type StringKey } from '@/lib/i18n';

type MenuId = 'lines' | 'patterns' | 'elliott' | 'counts' | 'cycles' | 'transfer' | 'type' | 'scale' | 'tz';

/** A row of a dropdown. */
type MenuItem = { key: string; label: string; onClick: () => void; active?: boolean };

const TOOL_KEYS = TOOL_LABEL_KEYS;

/** The interval the trader last chose is theirs, not the page's: it survives a reload and a symbol. */
const INTERVAL_STORAGE_KEY = 'openstock:chart-interval';

/** The symbols the trader compares against, remembered like the interval. */
const COMPARE_STORAGE_KEY = 'openstock:chart-compare';

/** Pane colours, in order: the charted symbol first, then each comparison. */
const COMPARE_COLORS = ['--muted-foreground', '--brand', '--up', '--down'];

/** A stored replay session is untrusted input: a broken one is a fresh start, never a crash. */
const readReplaySession = (symbol: string) => {
    try {
        return parseSession(window.localStorage.getItem(sessionKey(symbol)));
    } catch {
        return null;
    }
};

type Props = {
    /** The app symbol, e.g. 2222.SR, 0700.HK. */
    symbol: string;
    /** The TradingView symbol, for the "open on TradingView" escape hatch. */
    tvSymbol: string;
    lang: Lang;
    /** Interval the page opens on, for a symbol whose usual default has no data (the Saudi index). */
    preferredInterval?: string;
};

/**
 * A chart for exchanges TradingView will not embed. Candles come from Yahoo (the same free source the
 * Saudi quotes use), the indicators are computed here, and the drawings are kept in this browser.
 * Nothing about it depends on a paid provider or an API key.
 */
export default function YahooChart({ symbol, tvSymbol, lang, preferredInterval }: Props) {
    const t = useCallback((key: StringKey) => tx(lang, key), [lang]);

    const hostRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
    // Strategy markers live on the price series; the plugin is rebuilt with every host, so the
    // markers to draw are kept in a ref and re-applied to whichever series is standing.
    const markersRef = useRef<SeriesMarker<UTCTimestamp>[]>([]);
    /** The dividends and splits of the symbol, drawn beside whatever a strategy marks. */
    const eventMarkersRef = useRef<SeriesMarker<UTCTimestamp>[]>([]);
    const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    // The candle host is kept so a replay step can replace the candles in place: rebuilding the
    // chart on every bar would throw away the trader's zoom, which is exactly what a replay needs.
    const candleHostRef = useRef<CandleHost | null>(null);
    const displayRef = useRef<CandleSet | null>(null);
    const replayRef = useRef(false);
    const replayPanelRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const [intervalId, setIntervalId] = useState<string>(openingInterval(preferredInterval));
    // The chart type is this browser's, like the interval: read after mount, saved on change. The
    // host is built with it through a ref, so switching type never rebuilds the whole chart.
    const [chartType, setChartType] = useState<ChartType>('candles');
    const chartTypeRef = useRef<ChartType>(chartType);
    chartTypeRef.current = chartType;
    const [scaleMode, setScaleMode] = useState<ScaleMode>('linear');
    const scaleModeRef = useRef<ScaleMode>(scaleMode);
    scaleModeRef.current = scaleMode;
    const [timeZone, setTimeZone] = useState<TimeZoneId>('local');
    const timeZoneRef = useRef<TimeZoneId>(timeZone);
    timeZoneRef.current = timeZone;
    const [sessionBreaks, setSessionBreaks] = useState(false);
    const sessionBreaksRef = useRef(false);
    sessionBreaksRef.current = sessionBreaks;
    const [invertScale, setInvertScale] = useState(false);
    const invertScaleRef = useRef(false);
    invertScaleRef.current = invertScale;
    const [renkoBox, setRenkoBox] = useState<number | undefined>(undefined);
    const renkoBoxRef = useRef<number | undefined>(undefined);
    renkoBoxRef.current = renkoBox;
    const [kagiReversal, setKagiReversal] = useState<number | undefined>(undefined);
    const kagiReversalRef = useRef<number | undefined>(undefined);
    kagiReversalRef.current = kagiReversal;
    const [lineBreakCount, setLineBreakCount] = useState<number | undefined>(undefined);
    const lineBreakCountRef = useRef<number | undefined>(undefined);
    lineBreakCountRef.current = lineBreakCount;
    useEffect(() => {
        setChartType(readChartType(window.localStorage));
        setScaleMode(readScaleMode(window.localStorage));
        setTimeZone(readTimeZone(window.localStorage));
        setInvertScale(readInvert(window.localStorage));
        setRenkoBox(readRenkoBox(window.localStorage));
        setKagiReversal(readKagiReversal(window.localStorage));
        setLineBreakCount(readLineBreakCount(window.localStorage));
    }, []);
    useEffect(() => {
        writeChartType(window.localStorage, chartType);
    }, [chartType]);
    useEffect(() => {
        writeScaleMode(window.localStorage, scaleMode);
    }, [scaleMode]);
    useEffect(() => {
        writeTimeZone(window.localStorage, timeZone);
    }, [timeZone]);
    useEffect(() => {
        writeInvert(window.localStorage, invertScale);
    }, [invertScale]);
    useEffect(() => {
        writeRenkoBox(window.localStorage, renkoBox);
    }, [renkoBox]);
    useEffect(() => {
        writeKagiReversal(window.localStorage, kagiReversal);
    }, [kagiReversal]);
    useEffect(() => {
        writeLineBreakCount(window.localStorage, lineBreakCount);
    }, [lineBreakCount]);
    const [data, setData] = useState<CandleSet | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    // The study list is this browser's, shared with every pane on /charts: read after mount, saved
    // on every change.
    const [studies, setStudies] = useState<StudyConfig[]>([]);
    const updateStudies = useCallback((next: StudyConfig[]) => {
        setStudies(next);
        writeStudies(window.localStorage, next);
    }, []);
    useEffect(() => {
        setStudies(readStudies(window.localStorage));
    }, []);
    // The chart is built once per symbol/interval; the study list arrives and changes later, so it
    // is read through a ref. Putting it in the creation deps would rebuild the chart — and throw
    // away the zoom and the replay position — on every keystroke in a parameter box.
    const studiesRef = useRef<StudyConfig[]>(studies);
    studiesRef.current = studies;
    // The bar the legend reads: the hovered one, or the last bar the host drew.
    const [readout, setReadout] = useState<BarReadout | null>(null);
    const [tool, setTool] = useState<ActiveTool | null>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    // Hide-all: the drawings stay in memory, the layer just stops rendering.
    const [drawingsHidden, setDrawingsHidden] = useState(false);
    // Magnet is a working mode, not a preference: it starts off and is one click away.
    const [magnet, setMagnet] = useState(false);
    const magnetRef = useRef(false);
    magnetRef.current = magnet;
    const [pendingLabels, setPendingLabels] = useState<string[] | null>(null);
    const [noteText, setNoteText] = useState('');
    // The drawing list is a timeline: every discrete edit is a step, a whole drag is one step.
    const [timeline, setTimeline] = useState<DrawingHistory<Drawing[]>>(() => createHistory<Drawing[]>([]));
    const drawings = timeline.present;
    /** A discrete edit: add, delete, recolour, import, clear. */
    const setDrawings = useCallback((updater: Drawing[] | ((list: Drawing[]) => Drawing[])) => {
        setTimeline((history) =>
            applyHistory(history, typeof updater === 'function' ? updater(history.present) : updater),
        );
    }, []);
    /** Opens a symbol's stored set: it is the starting point, not an edit, so undo cannot erase it. */
    const resetDrawings = useCallback((list: Drawing[]) => {
        setTimeline(createHistory(list));
        setSelectedId(null);
    }, []);

    // The account's copy of this symbol's setup — the drawings and the studies — so a chart follows the
    // trader to another device. The browser stays the fast copy: it is read first and written first, and
    // the account catches up on a short debounce. `syncReady` holds the pushes back until the open-time
    // reconciliation has finished, so an incoming merge is never overwritten by a half-loaded chart.
    const [syncState, setSyncState] = useState<'loading' | 'saving' | 'saved' | 'local' | 'error'>('loading');
    const syncReady = useRef(false);
    const syncTimer = useRef<number | null>(null);
    const drawingsRef = useRef<Drawing[]>(drawings);
    drawingsRef.current = drawings;
    const symbolRef = useRef(symbol);
    symbolRef.current = symbol;
    const latestStudies = useRef<StudyConfig[]>(studies);
    latestStudies.current = studies;

    const pushSetup = useCallback(
        async (target: string, setup: ReturnType<typeof setupFromLocal>) => {
            const result = await saveChartSetup(target, serializeChartSetup(setup));
            writeSetupPending(window.localStorage, target, !result.ok);
            return result;
        },
        [],
    );

    // What a pending save will send, captured when it is scheduled. Reading the refs at fire time would
    // save the *next* symbol's drawings under the next symbol's name — a clear followed by a quick
    // symbol switch would silently write an empty set somewhere else and lose the clear.
    const pendingSetup = useRef<{ symbol: string; setup: ReturnType<typeof setupFromLocal> } | null>(null);

    const flushSetupSave = useCallback(async () => {
        if (syncTimer.current !== null) {
            window.clearTimeout(syncTimer.current);
            syncTimer.current = null;
        }
        const pending = pendingSetup.current;
        pendingSetup.current = null;
        if (!pending) return;
        setSyncState('saving');
        const result = await pushSetup(pending.symbol, pending.setup);
        writeSetupPending(window.localStorage, pending.symbol, !result.ok);
        setSyncState(result.ok ? 'saved' : result.reason === 'unauthorized' ? 'local' : 'error');
    }, [pushSetup]);

    const scheduleSetupSave = useCallback(() => {
        if (!syncReady.current) return;
        pendingSetup.current = { symbol: symbolRef.current, setup: setupFromLocal(drawingsRef.current, latestStudies.current) };
        if (syncTimer.current !== null) window.clearTimeout(syncTimer.current);
        syncTimer.current = window.setTimeout(() => {
            syncTimer.current = null;
            void flushSetupSave();
        }, 1200);
    }, [flushSetupSave]);
    // The snapshot a drag started from, so pointermove never floods the timeline.
    const gestureStart = useRef<Drawing[] | null>(null);
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
        setSelectedId(null);
    }, []);
    const redo = useCallback(() => {
        setTimeline((history) => redoHistory(history));
        setSelectedId(null);
    }, []);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // A clipboard for drawings, in memory: a copy is a sketch until it is pasted.
    const clipboard = useRef<Drawing | null>(null);
    const copySelected = useCallback(() => {
        const drawing = drawings.find((d) => d.id === selectedId);
        if (drawing) clipboard.current = drawing;
    }, [drawings, selectedId]);
    const offsetCopy = (drawing: Drawing) =>
        cloneDrawing(drawing, newDrawingId(), { price: Math.max(0.001, Math.abs(drawing.points[0]?.price ?? 0) * 0.005) });
    const pasteClipboard = useCallback(() => {
        const source = clipboard.current;
        if (!source) return;
        const copy = cloneDrawing(source, newDrawingId(), {
            price: Math.max(0.001, Math.abs(source.points[0]?.price ?? 0) * 0.005),
        });
        setDrawings((list) => [...list, copy]);
        setSelectedId(copy.id);
    }, [setDrawings]);
    const duplicateSelected = useCallback(() => {
        const drawing = drawings.find((d) => d.id === selectedId);
        if (!drawing) return;
        const copy = offsetCopy(drawing);
        setDrawings((list) => [...list, copy]);
        setSelectedId(copy.id);
    }, [drawings, selectedId, setDrawings]);
    const restyleDrawing = (patch: Partial<Pick<Drawing, 'width' | 'dash' | 'textSize' | 'bold'>>) => {
        if (!selectedId) return;
        setDrawings((list) => list.map((d) => (d.id === selectedId ? { ...d, ...patch } : d)));
    };

    const [editRequest, setEditRequest] = useState<{ id: string; nonce: number } | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [menu, setMenu] = useState<MenuId | null>(null);
    // The count the automatic numbering targets: whatever degree/kind was last picked by hand.
    const [countChoice, setCountChoice] = useState<{ degree: CountDegree; kind: CountKind }>({
        degree: 'minor',
        kind: 'impulse',
    });
    const [sensitivity, setSensitivity] = useState<AutoSensitivity>(AUTO_SENSITIVITIES[0]);
    const [autoNotice, setAutoNotice] = useState<StringKey | null>(null);
    const [paste, setPaste] = useState('');
    const [transfer, setTransfer] = useState<'ok' | 'bad' | 'copied' | 'blocked' | null>(null);
    // Bumped whenever the chart pans or zooms, so the drawings are re-projected onto the new scale.
    const [, setFrame] = useState(0);
    // Compare overlays: the symbols, their candles, and the little add control.
    const [compareList, setCompareList] = useState<string[]>([]);
    const [compareData, setCompareData] = useState<Record<string, CandleSet | null>>({});
    const [compareInput, setCompareInput] = useState('');
    const [compareOpen, setCompareOpen] = useState(false);
    // The lab links back with ?strategy=…, so the chart opens already armed. Read after mount so the
    // first paint the server sent and the first paint the browser renders stay identical.
    const [autoStrategy, setAutoStrategy] = useState<StrategyId | null>(null);
    // Bar replay: a cursor into a deeper series, and a paper account traded at that cursor only.
    const [replay, setReplay] = useState(false);
    const [replaySet, setReplaySet] = useState<CandleSet | null>(null);
    const [replayStatus, setReplayStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [cursorTime, setCursorTime] = useState<number | null>(null);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState<ReplaySpeed>(2);
    const [account, setAccount] = useState<PaperAccount>(() => openAccount());
    // What the trader has armed but not executed: a limit/stop entry, or a bracket on the position.
    const [intent, setIntent] = useState<ReplayIntent>({});
    const [orderError, setOrderError] = useState<OrderFailure | null>(null);
    const [resumedFrom, setResumedFrom] = useState<number | null>(null);

    const replayCandles = useMemo(() => replaySet?.candles ?? [], [replaySet]);

    // The cursor is a time, not an index: on an interval change the same day is found again on the
    // coarser series, so a weekly replay continues where the daily one stood instead of at bar 500.
    const cursor = useMemo(() => {
        if (!replay) return data ? data.candles.length - 1 : 0;
        if (replayCandles.length === 0) return 0;
        if (cursorTime == null) return minStartIndex(replayCandles.length);
        return clampCursor(cursorForTime(replayCandles, cursorTime), replayCandles.length);
    }, [replay, data, replayCandles, cursorTime]);

    // The one series the chart ever sees. In replay it stops at the cursor, so nothing downstream —
    // indicator, drawing, marker — can be shaped by a bar the trader has not reached yet.
    const displayData = useMemo<CandleSet | null>(() => {
        if (!replay) return data;
        if (!replaySet) return null;
        return { candles: visibleCandles(replayCandles, cursor), currency: replaySet.currency };
    }, [replay, data, replaySet, replayCandles, cursor]);

    // Latest-value refs for the callbacks that must not re-run when a replay bar advances.
    displayRef.current = displayData;
    replayRef.current = replay;
    const hasDisplay = displayData != null;
    const barTimes = useMemo(() => displayData?.candles.map((c) => c.time) ?? [], [displayData]);

    // Read after mount rather than during the first render: the server has no storage, and reading it
    // in the initial state would hydrate a different toolbar than the one that was sent.
    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(INTERVAL_STORAGE_KEY);
            // A page that dictates the interval knows something the stored choice cannot: the index
            // has no daily series in this feed, so its page opens on an hour and stays there.
            if (!preferredInterval && isCandleIntervalId(stored)) setIntervalId(stored);
        } catch {
            /* private mode: the daily interval is a fine default */
        }
        const requested = new URLSearchParams(window.location.search).get('strategy');
        if (requested && (STRATEGY_IDS as readonly string[]).includes(requested)) {
            setAutoStrategy(requested as StrategyId);
        }
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(INTERVAL_STORAGE_KEY, intervalId);
        } catch {
            /* private mode: the choice simply is not remembered */
        }
    }, [intervalId]);

    // The compared symbols are read after mount (localStorage has no server side) and saved on change.
    useEffect(() => {
        try {
            const stored = JSON.parse(window.localStorage.getItem(COMPARE_STORAGE_KEY) ?? '[]');
            if (Array.isArray(stored)) setCompareList(normalizeCompareInputs(stored.map(String), symbol));
        } catch {
            /* private mode: no remembered comparisons */
        }
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(compareList));
        } catch {
            /* private mode: the choice simply is not remembered */
        }
    }, [compareList]);

    useEffect(() => {
        let cancelled = false;
        // Compare is hidden in replay: fetching it would draw a percent pane built from bars the
        // trader has not reached, which is the one thing the mode must not do.
        if (replay || compareList.length === 0) {
            setCompareData({});
            return;
        }
        void (async () => {
            const entries = await Promise.all(
                compareList.map(async (compared) => [compared, await getCompareCandles(compared, intervalId)] as const),
            );
            if (!cancelled) setCompareData(Object.fromEntries(entries));
        })();
        return () => { cancelled = true; };
    }, [compareList, intervalId, replay]);

    const load = useCallback(async () => {
        setStatus('loading');
        const result = await getYahooCandles(symbol, intervalId);
        if (!result || result.candles.length === 0) {
            setData(null);
            setStatus('error');
            return;
        }
        setData(result);
        setStatus('ready');
    }, [symbol, intervalId]);

    useEffect(() => {
        void load();
    }, [load]);

    // Entering replay swaps the light chart payload for the lab's deep history (10y daily, 10y weekly,
    // the whole listing monthly). The same symbol on another interval keeps the cursor's day.
    useEffect(() => {
        if (!replay) {
            setReplaySet(null);
            setReplayStatus('idle');
            setPlaying(false);
            setOrderError(null);
            setResumedFrom(null);
            return;
        }
        let cancelled = false;
        setReplayStatus('loading');
        setPlaying(false);
        void (async () => {
            const deep = await getStrategyCandles(symbol, intervalId);
            if (cancelled) return;
            if (!deep || deep.candles.length < MIN_WARMUP_BARS + 2) {
                setReplaySet(null);
                setReplayStatus('error');
                return;
            }
            setReplaySet(deep);
            const stored = readReplaySession(symbol);
            if (stored) {
                setCursorTime(stored.cursorTime);
                setAccount(stored.account);
                setIntent(stored.intent ?? {});
                setResumedFrom(stored.cursorTime);
            } else {
                setCursorTime(deep.candles[minStartIndex(deep.candles.length)].time);
                setAccount(openAccount());
                setResumedFrom(null);
            }
            setOrderError(null);
            setReplayStatus('ready');
        })();
        return () => { cancelled = true; };
    }, [replay, symbol, intervalId]);

    // The session is remembered per symbol in this browser — TradingView remembers its replay too,
    // and a demo that forgets a practice position overnight is not worth practising in.
    useEffect(() => {
        if (!replay || replayStatus !== 'ready' || cursorTime == null) return;
        try {
            window.localStorage.setItem(sessionKey(symbol), serializeSession({ cursorTime, account, intent }));
        } catch {
            /* private mode: the session simply is not remembered */
        }
    }, [replay, replayStatus, cursorTime, account, intent, symbol]);

    // Autoplay steps on a wall-clock timer, not on a render, so the speed means bars per second.
    // It goes through the same advance as the transport, so a pending order or a bracket is settled
    // on every bar it plays through — no path may skip it.
    useEffect(() => {
        if (!playing || replayCandles.length === 0) return;
        const id = window.setInterval(() => {
            const current = paperRef.current.cursor;
            const index = current == null
                ? minStartIndex(replayCandles.length)
                : clampCursor(cursorForTime(replayCandles, current), replayCandles.length);
            const next = Math.min(replayCandles.length - 1, index + 1);
            advanceRef.current(replayCandles[next].time, false);
        }, Math.max(60, Math.round(1000 / speed)));
        return () => window.clearInterval(id);
    }, [playing, replayCandles, speed]);

    // The last bar is the end of the replay; pressing play there would look broken.
    useEffect(() => {
        if (playing && replayCandles.length > 0 && cursor >= replayCandles.length - 1) setPlaying(false);
    }, [playing, cursor, replayCandles.length]);

    // The transport sits under a 420 px chart, so opening replay scrolls its controls into view
    // rather than leaving the trader to hunt for them below the fold.
    useEffect(() => {
        if (replay && replayStatus === 'ready') {
            replayPanelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [replay, replayStatus]);

    // Drawings belong to the symbol, not to the session: switching symbols starts from that symbol's set.
    useEffect(() => {
        resetDrawings(loadDrawings(symbol));
        setTool(null);
        setPendingLabels(null);
        setEditRequest(null);
        setTransfer(null);
    }, [symbol, resetDrawings]);

    // The strokes the trader saved as a tool's default ("template"). A preference, so it is read once
    // and kept, not reset with the symbol's drawings.
    // TradingView's "stay in drawing mode": the tool stays armed after a shape lands.
    const [stayDrawing, setStayDrawing] = useState(false);
    const stayDrawingRef = useRef(false);
    stayDrawingRef.current = stayDrawing;
    useEffect(() => {
        setStayDrawing(readStayDrawing(window.localStorage));
    }, []);
    const toggleStayDrawing = () =>
        setStayDrawing((value) => {
            writeStayDrawing(window.localStorage, !value);
            return !value;
        });

    const [drawingStyles, setDrawingStyles] = useState<DrawingStyleMap>({});
    useEffect(() => {
        setDrawingStyles(loadDrawingStyles());
    }, []);
    const rememberStyle = (tool: ShapeTool | undefined, style: { color?: ColorKey; width?: DrawingWidth; dash?: DrawingDash }) => {
        if (!tool) return;
        const next = withDrawingStyle(drawingStyles, tool, style);
        saveDrawingStyles(next);
        setDrawingStyles(next);
    };
    const forgetStyle = (tool: ShapeTool | undefined) => {
        if (!tool) return;
        const next = withoutDrawingStyle(drawingStyles, tool);
        saveDrawingStyles(next);
        setDrawingStyles(next);
    };

    // Opening a symbol: the browser's copy is already on screen (read above, instantly). Then the
    // account is asked for its copy and the two are merged, or the browser's copy is pushed up when the
    // account has none — the one-time migration for every chart drawn before the account existed. Work
    // done offline this session is pushed rather than replaced, so coming back online cannot lose it.
    useEffect(() => {
        let cancelled = false;
        // The previous symbol's last edit goes out before the new one is read, or it would be lost.
        void flushSetupSave();
        syncReady.current = false;
        setSyncState('loading');
        const local = setupFromLocal(loadDrawings(symbol), readStudies(window.localStorage));
        void (async () => {
            const result = await loadChartSetup(symbol);
            if (cancelled) return;
            if (!result.ok) {
                syncReady.current = true;
                setSyncState(result.reason === 'unauthorized' ? 'local' : 'error');
                return;
            }
            const pending = readSetupPending(window.localStorage, symbol);
            const decision = setupDecision({
                signedIn: true,
                hasRemote: !!result.setup,
                hasLocal: local.drawings.length > 0 || local.studies.length > 0,
                localPending: pending,
            });
            if (decision === 'merge' && result.setup) {
                const merged = mergeSetup(local, result.setup);
                resetDrawings(merged.drawings);
                updateStudies(merged.studies);
                writeSetupPending(window.localStorage, symbol, false);
                syncReady.current = true;
                setSyncState('saved');
                return;
            }
            if (decision === 'push') {
                const saved = await pushSetup(symbol, local);
                if (cancelled) return;
                syncReady.current = true;
                setSyncState(saved.ok ? 'saved' : saved.reason === 'unauthorized' ? 'local' : 'error');
                return;
            }
            syncReady.current = true;
            setSyncState('saved');
        })();
        return () => {
            cancelled = true;
        };
    }, [symbol, resetDrawings, updateStudies, pushSetup, flushSetupSave]);

    const saved = useRef(false);
    useEffect(() => {
        if (!saved.current) {
            saved.current = true;
            return;
        }
        saveDrawings(symbol, drawings);
        scheduleSetupSave();
    }, [symbol, drawings, scheduleSetupSave]);

    // The study list is shared by every pane, so a change to it is a change to this symbol's setup too.
    const studiesSettled = useRef(false);
    useEffect(() => {
        if (!studiesSettled.current) {
            studiesSettled.current = true;
            return;
        }
        scheduleSetupSave();
    }, [studies, scheduleSetupSave]);

    // The common start date for the compare pane: the latest first-bar among the series, so symbols
    // with different amounts of history (AAPL back to 1980, 2222.SR to 2019) are measured together.
    const compareFrom = useMemo(() => {
        const sets = [displayData, ...compareList.map((compared) => compareData[compared])].filter((set): set is CandleSet => !!set);
        const starts = sets.map((set) => set.candles[0]?.time).filter((time): time is number => typeof time === 'number');
        return starts.length > 0 ? Math.max(...starts) : 0;
    }, [displayData, compareList, compareData]);

    useEffect(() => {
        const el = hostRef.current;
        const current = displayRef.current;
        if (!el || !current) return;

        // Compare: the charted symbol and each comparison as percent change from the first bar, in a
        // pane under the price so a Saudi stock and a US stock share one axis. Replay never extends:
        // a percent pane built from later bars is exactly the future the mode hides.
        const extend = (host: CandleHost) => {
            if (replayRef.current) return;
            const { chart, addPane } = host;
            const compareSets: [string, { time: number; value: number }[]][] = [
                [symbol, percentSeries(current.candles, compareFrom)],
            ];
            for (const compared of compareList) {
                const set = compareData[compared];
                if (set) compareSets.push([compared, percentSeries(set.candles, compareFrom)]);
            }
            if (compareSets.length <= 1) return;

            const compareIndex = addPane(0.24);
            const palette = COMPARE_COLORS.map((name, i) => token(name, i === 0 ? '#94a3b8' : '#34d399'));
            compareSets.forEach(([, points], i) => {
                chart
                    .addSeries(
                        LineSeries,
                        {
                            color: palette[i % palette.length],
                            lineWidth: 1,
                            priceLineVisible: false,
                            lastValueVisible: false,
                            priceFormat: { type: 'percent' },
                        },
                        compareIndex,
                    )
                    .setData(points.map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
            });
        };

        const host = createCandleHost(el, {
            timeVisible: intervalId !== '1d' && intervalId !== '1wk',
            data: current,
            studies: studiesRef.current,
            chartType: chartTypeRef.current,
            scaleMode: scaleModeRef.current,
            timeZone: timeZoneRef.current,
            sessionBreaks: sessionBreaksRef.current,
            invertScale: invertScaleRef.current,
            renkoBox: renkoBoxRef.current,
            kagiReversal: kagiReversalRef.current,
            lineBreakCount: lineBreakCountRef.current,
            onPriceSeries: (series) => {
                // The host replaces the price series when the chart type changes; the markers and the
                // coordinate reference must follow the series that is actually on screen.
                seriesRef.current = series;
                // Both lists from the start: the events are already known when the chart is built.
                markersApiRef.current = createSeriesMarkers(
                    series,
                    [...eventMarkersRef.current, ...markersRef.current].sort((a, b) => Number(a.time) - Number(b.time)),
                );
            },
            extend,
            onRangeChange: () => setFrame((frame) => frame + 1),
        });

        // Replay opens on the recent end of a ten-year series, not compressed into a thousand bars.
        if (replayRef.current) {
            const count = current.candles.length;
            host.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 150), to: count + 5 });
        } else {
            host.fit();
        }
        candleHostRef.current = host;
        // The host owns the crosshair and the indicator arrays, so the legend cannot drift from the
        // chart: it fires on hover, on a replay step, and on an indicator toggle alike.
        const unsubscribeReadout = host.subscribeReadout(setReadout);
        chartRef.current = host.chart;

        return () => {
            unsubscribeReadout();
            candleHostRef.current = null;
            chartRef.current = null;
            seriesRef.current = null;
            markersApiRef.current = null;
            host.destroy();
        };
    }, [hasDisplay, intervalId, compareList, compareData, symbol, compareFrom]);

    // Studies are redrawn in place: the bars, the zoom and the replay never move.
    useEffect(() => {
        candleHostRef.current?.setStudies(studies);
    }, [studies]);

    // A chart type is a redraw, not a rebuild: the zoom, panes and drawings stay put.
    useEffect(() => {
        candleHostRef.current?.setChartType(chartType);
    }, [chartType]);

    // The scale is an axis option: nothing is rebuilt, not even the series.
    useEffect(() => {
        candleHostRef.current?.setScaleMode(scaleMode);
    }, [scaleMode]);

    // The clock and the session gaps are view options too.
    useEffect(() => {
        candleHostRef.current?.setTimeZone(timeZone);
    }, [timeZone]);
    useEffect(() => {
        candleHostRef.current?.setInvertScale(invertScale);
    }, [invertScale]);
    useEffect(() => {
        candleHostRef.current?.setRenkoBox(renkoBox);
    }, [renkoBox]);
    useEffect(() => {
        candleHostRef.current?.setKagiReversal(kagiReversal);
    }, [kagiReversal]);
    useEffect(() => {
        candleHostRef.current?.setLineBreakCount(lineBreakCount);
    }, [lineBreakCount]);
    useEffect(() => {
        candleHostRef.current?.setSessionBreaks(sessionBreaks);
    }, [sessionBreaks]);

    // Undo/redo on the drawings, the shortcut every editor shares. Typing in a field keeps its own
    // undo, so the handler steps aside there.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey)) return;
            const target = event.target as HTMLElement | null;
            if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
            const key = event.key.toLowerCase();
            if (key === 'z' && !event.shiftKey) {
                event.preventDefault();
                undo();
            } else if ((key === 'z' && event.shiftKey) || key === 'y') {
                event.preventDefault();
                redo();
            } else if (key === 'c') {
                copySelected();
            } else if (key === 'v') {
                event.preventDefault();
                pasteClipboard();
            } else if (key === 'd') {
                event.preventDefault();
                duplicateSelected();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [undo, redo, copySelected, pasteClipboard, duplicateSelected]);

    // Bare letters arm a drawing tool, the way every charting terminal does it. Anything with a
    // modifier belongs to the editor shortcuts above, and a field keeps its own typing.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;

            if (event.key === 'Escape') {
                setTool(null);
                setShortcutsOpen(false);
                return;
            }
            if (event.key === '?') {
                event.preventDefault();
                setShortcutsOpen((open) => !open);
                return;
            }
            const next = toolForKey(event.key);
            if (next) {
                event.preventDefault();
                setTool((current) => (current === next ? null : next));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // A replay step replaces the candles in place: the zoom, the panes and the markers stay put.
    useEffect(() => {
        if (displayData) candleHostRef.current?.setData(displayData);
    }, [displayData]);

    // Entering or leaving replay re-frames the view once. Steps after that never touch it, which is
    // what makes a fast replay readable instead of a chart that keeps re-fitting itself.
    const framedFor = useRef('');
    useEffect(() => {
        const host = candleHostRef.current;
        const count = displayData?.candles.length ?? 0;
        if (!host || count === 0) return;
        const key = `${replay ? 'replay' : 'live'}:${intervalId}`;
        if (framedFor.current === key) return;
        framedFor.current = key;
        if (replay) host.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 150), to: count + 5 });
        else host.fit();
    }, [replay, intervalId, displayData]);

    /** Both lists on one series: the events sit under whatever the strategy is marking. */
    const syncMarkers = useCallback(() => {
        const all = [...eventMarkersRef.current, ...markersRef.current].sort((a, b) => Number(a.time) - Number(b.time));
        markersApiRef.current?.setMarkers(all);
    }, []);
    const applyStrategyMarkers = useCallback(
        (markers: SeriesMarker<UTCTimestamp>[] | null) => {
            markersRef.current = markers ?? [];
            syncMarkers();
        },
        [syncMarkers],
    );

    // A dividend or a split is a fact about a bar, so it is marked on the bar it happened at. Only the
    // daily-and-lower intervals carry them: Yahoo reports them against days, and a five-minute chart
    // would print the same marker dozens of times inside one session.
    useEffect(() => {
        const events = data?.events ?? [];
        const candles = data?.candles ?? [];
        if (events.length === 0 || candles.length === 0 || intervalId === '1m' || intervalId === '5m' || intervalId === '15m' || intervalId === '30m' || intervalId === '60m' || intervalId === '2h' || intervalId === '4h') {
            eventMarkersRef.current = [];
            syncMarkers();
            return;
        }
        const first = candles[0].time;
        eventMarkersRef.current = events
            .filter((event) => event.time >= first)
            .map((event) => ({
                time: event.time as UTCTimestamp,
                position: event.kind === 'dividend' ? 'belowBar' : 'aboveBar',
                shape: event.kind === 'dividend' ? 'circle' : 'square',
                color: event.kind === 'dividend' ? '#EAB308' : '#00BCD4',
                text: eventLabel(event),
            }));
        syncMarkers();
    }, [data, intervalId, syncMarkers]);

    useEffect(() => {
        if (!expanded) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setExpanded(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [expanded]);

    const toScreen = useCallback(
        (point: DrawPoint): ScreenPoint | null => {
            const chart = chartRef.current;
            const series = seriesRef.current;
            if (!chart || !series) return null;
            // The drawing was stored on some interval's bars; on another interval it snaps to the
            // nearest bar of the one on screen, which is why it stays visible after a timeframe switch.
            const time = nearestTime(barTimes, point.time);
            if (time == null) return null;
            const x = chart.timeScale().timeToCoordinate(time as UTCTimestamp);
            const y = series.priceToCoordinate(point.price);
            return x == null || y == null ? null : { x, y };
        },
        [barTimes],
    );

    const fromScreen = useCallback((x: number, y: number): DrawPoint | null => {
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!chart || !series) return null;
        const time = chart.timeScale().coordinateToTime(x);
        const price = series.coordinateToPrice(y);
        if (time == null || price == null) return null;
        return { time: Number(time), price: Number(price) };
    }, []);

    // Snap a point to the nearest bar's O/H/L/C when the magnet is on and a level is close on screen.
    const snapDrawingPoint = useCallback((point: DrawPoint): DrawPoint => {
        if (!magnetRef.current) return point;
        const series = seriesRef.current;
        const bars = displayRef.current?.candles ?? [];
        if (!series || bars.length === 0) return point;
        const bar = nearestBar(bars, point.time);
        if (!bar) return point;
        return snapPoint(point, bar, (price) => series.priceToCoordinate(price));
    }, []);

    const startTool = (next: ActiveTool | null, labels: string[] | null = null) => {
        setMenu(null);
        setSelectedId(null);
        setPendingLabels(labels);
        setTool((current) => (current === next && !labels ? null : next));
    };

    const commit = (drawing: Drawing) => setDrawings((list) => [...list, { ...styleFor(drawing.tool, drawingStyles), ...drawing }]);

    /**
     * Numbers the waves on the candles that are loaded. One shot, like a normal tool: the result is
     * an ordinary drawing, so it can be dragged, recoloured or deleted straight away.
     */
    const runAutoCount = (choice: { degree: CountDegree; kind: CountKind }, sensitivityId: AutoSensitivity) => {
        const candles = data?.candles ?? [];
        setSensitivity(sensitivityId);
        if (candles.length === 0) {
            setAutoNotice('chart.count.autoLoading');
            return;
        }
        const drawing = autoCount(candles, {
            ...(sensitivityId === 'atr'
                ? { mode: 'atr' as const }
                : { mode: 'percent' as const, percent: Number(sensitivityId) }),
            ...choice,
        });
        if (!drawing) {
            setAutoNotice('chart.count.autoNone');
            return;
        }
        commit(drawing);
        setSelectedId(drawing.id);
        setTool(null);
        setPendingLabels(null);
        setAutoNotice(null);
        setMenu(null);
    };

    /** The same wording the manual count rows use, so the automatic rows read as the same feature. */
    const countLabel = ({ degree, kind }: { degree: CountDegree; kind: CountKind }) =>
        `${t(COUNT_TOOL[kind] === 'ew-count' ? 'chart.count.impulse' : 'chart.count.correction')} · ${t(
            (`chart.count.degree${degree[0].toUpperCase()}${degree.slice(1)}`) as StringKey,
        )}`;
    const hasCandles = (data?.candles.length ?? 0) > 0;
    const selectedDrawing = selectedId ? drawings.find((drawing) => drawing.id === selectedId) ?? null : null;
    // The stroke the selected tool's new drawings start with, and whether the trader has saved one.
    const selectedTool = selectedDrawing?.tool;
    const defaultStyle = selectedTool ? styleFor(selectedTool, drawingStyles) : {};
    const hasDefaultStyle = Object.keys(defaultStyle).length > 0;
    const styleIsSet =
        !!selectedDrawing && (selectedDrawing.color !== undefined || selectedDrawing.width !== undefined || selectedDrawing.dash !== undefined);
    /** Saves the selected drawing's stroke as its tool's default, or clears that default again. */
    const toggleDefaultStyle = () => {
        if (!selectedTool) return;
        if (hasDefaultStyle) {
            forgetStyle(selectedTool);
            return;
        }
        rememberStyle(selectedTool, {
            color: selectedDrawing?.color,
            width: selectedDrawing?.width,
            dash: selectedDrawing?.dash,
        });
    };

    // The rail passes a plain tool id; the manual counts still need the degree's glyphs.
    const railPick = (next: ActiveTool) => {
        if (next === 'ew-count' || next === 'ew-count-abc') {
            const kind: CountKind = next === 'ew-count' ? 'impulse' : 'correction';
            startTool(COUNT_TOOL[kind], COUNT_GLYPHS[countChoice.degree][kind]);
            return;
        }
        startTool(next);
    };

    // The Elliott flyout also keeps the degree picker and the one-shot auto count.
    const countExtra = (
        <div className="mt-1 border-t border-line pt-1.5">
            <p className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-wide text-faint">
                {t('chart.count.degree')} · {countLabel(countChoice)}
            </p>
            <div className="flex items-center gap-1 px-2 pb-1.5">
                {(['major', 'minor', 'minute'] as CountDegree[]).map((degree) => (
                    <button
                        key={degree}
                        type="button"
                        onClick={() => setCountChoice((current) => ({ ...current, degree }))}
                        className={cn(
                            'flex-1 rounded-full px-2 py-1 text-[11.5px] font-semibold transition-colors',
                            countChoice.degree === degree ? 'bg-brand text-brand-ink' : 'bg-page text-muted hover:bg-hover',
                        )}
                    >
                        {t(`chart.count.degree${degree[0].toUpperCase()}${degree.slice(1)}` as StringKey)}
                    </button>
                ))}
            </div>
            <p className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-wide text-faint">{t('chart.count.auto')}</p>
            <div className="flex items-center gap-1 px-2">
                {AUTO_SENSITIVITIES.map((id) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => runAutoCount(countChoice, id)}
                        disabled={!hasCandles}
                        aria-pressed={sensitivity === id}
                        title={id === 'atr' ? t('chart.count.autoAtr') : undefined}
                        className={cn(
                            'flex-1 rounded-full px-2 py-1 text-[11.5px] font-semibold transition-colors',
                            sensitivity === id ? 'bg-brand text-brand-ink' : 'bg-page text-muted hover:bg-hover',
                            !hasCandles && 'cursor-not-allowed opacity-40',
                        )}
                    >
                        {id === 'atr' ? 'ATR' : `${Math.round(Number(id) * 100)}%`}
                    </button>
                ))}
            </div>
            {autoNotice && (
                <p role="status" className="px-2 pt-1.5 text-[11px] leading-snug text-faint">
                    {t(autoNotice)}
                </p>
            )}
        </div>
    );
    const moveHandle = (id: string, index: number, point: DrawPoint) =>
        setTimeline((history) => ({
            ...history,
            present: history.present.map((d) => (d.id === id ? withPoint(d, index, point) : d)),
        }));
    const editText = (id: string, text: string) =>
        setDrawings((list) => list.map((d) => (d.id === id ? withText(d, text) : d)));
    const cycleColor = (id: string) =>
        setDrawings((list) =>
            list.map((d) => (d.id === id ? { ...d, color: nextColor(isColorKey(d.color) ? d.color : toolDef(d.tool).defaultColor) } : d)),
        );
    const toggleLock = (id: string) =>
        setDrawings((list) => list.map((d) => (d.id === id ? { ...d, locked: !d.locked } : d)));
    /** Hidden drawings keep their place in the list and in storage; they are simply not painted. */
    const toggleHidden = (id: string) =>
        setDrawings((list) => list.map((d) => (d.id === id ? { ...d, hidden: !d.hidden } : d)));
    const allLocked = drawings.length > 0 && drawings.every((drawing) => drawing.locked);
    const toggleLockAll = () => setDrawings((list) => list.map((drawing) => ({ ...drawing, locked: !allLocked })));
    /** Which end of the pile the selected drawing sits on. The list's order is the stacking order. */
    const layerSelected = (move: LayerMove) => {
        if (!selectedId) return;
        setDrawings((list) => layerDrawings(list, selectedId, move));
    };
    const removeDrawing = (id: string) => {
        setDrawings((list) => list.filter((d) => d.id !== id));
        setSelectedId((current) => (current === id ? null : current));
    };
    const clearAll = () => {
        setDrawings([]);
        setSelectedId(null);
        // Straight to the account, not on the debounce: an empty local set merged with the old account
        // copy would restore every drawing on the next visit.
        pendingSetup.current = null;
        if (syncTimer.current !== null) {
            window.clearTimeout(syncTimer.current);
            syncTimer.current = null;
        }
        setSyncState('saving');
        void pushSetup(symbol, setupFromLocal([], latestStudies.current)).then((result) => {
            writeSetupPending(window.localStorage, symbol, !result.ok);
            setSyncState(result.ok ? 'saved' : result.reason === 'unauthorized' ? 'local' : 'error');
        });
    };

    /** The chart plus the drawings layer, stamped with the symbol and interval, as a PNG. */
    const exportImage = useCallback(async () => {
        const host = candleHostRef.current;
        const shot = host?.screenshot();
        if (!host || !shot) return;
        const out = document.createElement('canvas');
        out.width = shot.width;
        out.height = shot.height;
        const ctx = out.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(shot, 0, 0);

        // The drawings are an SVG layer over the canvas, so it is serialised and painted on top.
        const svg = hostRef.current?.parentElement?.querySelector('svg.absolute.inset-0') as SVGSVGElement | null;
        if (svg && svg.clientWidth > 0) {
            const clone = svg.cloneNode(true) as SVGSVGElement;
            clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            clone.setAttribute('viewBox', `0 0 ${svg.clientWidth} ${svg.clientHeight}`);
            clone.setAttribute('width', String(shot.width));
            clone.setAttribute('height', String(shot.height));
            clone.setAttribute('font-family', 'ui-sans-serif, system-ui, sans-serif');
            const markup = new XMLSerializer().serializeToString(clone);
            await new Promise<void>((resolve) => {
                const image = new Image();
                image.onload = () => {
                    ctx.drawImage(image, 0, 0, shot.width, shot.height);
                    resolve();
                };
                image.onerror = () => resolve();
                image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
            });
        }

        const scale = shot.width / Math.max(1, hostRef.current?.clientWidth ?? shot.width);
        ctx.font = `600 ${Math.round(13 * scale)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(148, 163, 184, 0.95)';
        ctx.fillText(`${symbol} · ${intervalId} · Rovex`, 12 * scale, 20 * scale);

        const link = document.createElement('a');
        link.download = `openstock-${symbol.replace(/[^A-Za-z0-9]/g, '')}-${intervalId}.png`;
        link.href = out.toDataURL('image/png');
        link.click();
    }, [symbol, intervalId]);

    const addCompare = () => {
        const candidate = compareYahooSymbol(compareInput);
        const valid = candidate
            && candidate !== symbol.trim().toUpperCase()
            && !compareList.includes(candidate)
            && compareList.length < COMPARE_LIMIT;
        if (valid) setCompareList((list) => [...list, candidate]);
        setCompareInput('');
    };
    const removeCompare = (compared: string) => setCompareList((list) => list.filter((s) => s !== compared));

    // -- Bar replay & the paper account --------------------------------------
    // Everything the account values itself at comes from the replay bar on screen, never the live
    // quote in the page header — that is the difference between practising and watching.
    const replayBar = displayData?.candles[cursor] ?? null;

    // The advancing path needs the latest paper state without re-creating the autoplay timer, and
    // the timer needs the latest advance function without one of its own.
    const paperRef = useRef({ account, intent, cursor });
    paperRef.current = { account, intent, cursor };
    const advanceRef = useRef<(time: number, stop: boolean) => void>(() => {});

    /**
     * The one way the replay moves: every bar between where the trader stood and where they are
     * going is settled — a pending limit/stop may fill, a bracket may take the position out —
     * and the fills this step produced are announced. Moving backwards never un-fills anything;
     * a practising trader cannot take a fill back.
     */
    const advanceCursor = useCallback((time: number, stop: boolean) => {
        if (stop) setPlaying(false);
        setOrderError(null);
        if (replayCandles.length === 0) {
            setCursorTime(time);
            return;
        }

        const { account: currentAccount, intent: currentIntent, cursor: from } = paperRef.current;
        const to = clampCursor(cursorForTime(replayCandles, time), replayCandles.length);

        if (to > from) {
            let walking = { account: currentAccount, intent: currentIntent };
            const fills: Fill[] = [];
            let rejected: OrderFailure | undefined;
            for (let i = from + 1; i <= to; i += 1) {
                const settled = settleBar({ account: walking.account, intent: walking.intent, bar: replayCandles[i] });
                walking = { account: settled.account, intent: settled.intent };
                if (settled.fills.length > 0) fills.push(...settled.fills);
                if (settled.rejected) rejected = settled.rejected;
            }
            setAccount(walking.account);
            setIntent(walking.intent);
            if (rejected) setOrderError(rejected);
            if (fills.length > 0) {
                const last = fills[fills.length - 1];
                const label = last.side === 'buy' ? tx(lang, 'replay.filledBuy') : tx(lang, 'replay.filledSell');
                toast.success(
                    label
                        .replace('{s}', String(Math.round(last.quantity * 1e6) / 1e6))
                        .replace('{p}', last.price.toFixed(2))
                        .replace('{w}', fillReasonLabel(lang, last.reason)),
                );
            }
        }

        setCursorTime(replayCandles[to].time);
    }, [lang, replayCandles]);

    advanceRef.current = advanceCursor;

    const moveCursor = useCallback((time: number) => advanceCursor(time, true), [advanceCursor]);

    /** A market order, at the cursor bar's close — the behaviour the account started with. */
    const placePaperOrder = (side: 'buy' | 'sell', quantity: number) => {
        if (!replayBar) {
            setOrderError('badPrice');
            return;
        }
        const order = { price: replayBar.close, quantity, time: replayBar.time };
        const result = side === 'buy' ? paperBuy(account, order) : paperSell(account, order);
        if (result.ok) {
            setAccount(result.account);
            setOrderError(null);
            // A position just opened with no bracket is unprotected; the panel asks for one.
            if (side === 'sell') setIntent((current) => ({ ...current, bracket: null }));
        } else {
            setOrderError(result.reason);
        }
    };

    /** Arms a limit or a stop entry; it fills on a bar *after* this one, never on this bar. */
    const placePendingOrder = (type: OrderType, price: number, quantity: number) => {
        if (!replayBar) {
            setOrderError('badPrice');
            return;
        }
        const refusal = validateOrder(type, price, quantity, replayBar.close);
        if (refusal) {
            setOrderError(refusal);
            return;
        }
        const order: PendingOrder = {
            id: `o-${replayBar.time}-${type}`,
            type,
            side: 'buy',
            price,
            quantity,
            placedAt: replayBar.time,
        };
        setIntent((current) => ({ ...current, order }));
        setOrderError(null);
    };

    const cancelPendingOrder = () => setIntent((current) => ({ ...current, order: null }));

    /** A stop under the mark and a target above it; both optional, either alone is enough. */
    const setBracket = (bracket: Bracket) => {
        if (!replayBar) {
            setOrderError('badPrice');
            return;
        }
        const refusal = validateBracket(bracket, replayBar.close);
        if (refusal) {
            setOrderError(refusal);
            return;
        }
        setIntent((current) => ({ ...current, bracket: { ...bracket, placedAt: replayBar.time } }));
        setOrderError(null);
    };

    const clearBracket = () => setIntent((current) => ({ ...current, bracket: null }));

    const startReplay = () => {
        setPlaying(false);
        setOrderError(null);
        setReplay(true);
    };

    const exitReplay = () => {
        setPlaying(false);
        setOrderError(null);
        setReplay(false);
    };

    /** A new practice account, back at a bar with warm-up behind it — never at the live edge. */
    const resetPaperAccount = () => {
        setAccount(openAccount());
        setIntent({});
        setOrderError(null);
        setPlaying(false);
        if (replayCandles.length > 0) setCursorTime(replayCandles[minStartIndex(replayCandles.length)].time);
    };

    /** Play from the start again when the replay is standing on its last bar. */
    const togglePlayback = () => {
        if (playing) {
            setPlaying(false);
            return;
        }
        if (replayCandles.length === 0) return;
        if (cursor >= replayCandles.length - 1) {
            setCursorTime(replayCandles[minStartIndex(replayCandles.length)].time);
        }
        setPlaying(true);
    };


    const summary = (drawing: Drawing) => {
        const prices = drawing.points.map((point) => point.price.toFixed(2));
        if (carriesText(drawing.tool)) return drawing.text ?? '';
        return prices.length === 1 ? prices[0] : `${prices[0]} → ${prices[prices.length - 1]}`;
    };

    const toolLabel = (drawing: Drawing) => {
        if (drawing.tool !== 'ew-count' && drawing.tool !== 'ew-count-abc') return t(TOOL_KEYS[drawing.tool]);
        const glyphs = drawing.labels?.join('') ?? '';
        const degree =
            glyphs === COUNT_GLYPHS.major.impulse.join('') || glyphs === COUNT_GLYPHS.major.correction.join('')
                ? 'chart.count.degreeMajor'
                : glyphs === COUNT_GLYPHS.minute.impulse.join('') || glyphs === COUNT_GLYPHS.minute.correction.join('')
                  ? 'chart.count.degreeMinute'
                  : 'chart.count.degreeMinor';
        return `${t(TOOL_KEYS[drawing.tool])} · ${t(degree as StringKey)}`;
    };

    const copySetup = async () => {
        const payload = JSON.stringify(buildTransferPayload(symbol, drawings), null, 2);
        try {
            await navigator.clipboard.writeText(payload);
            setTransfer('copied');
        } catch {
            // A blocked clipboard is not a dead end: the payload goes in the box below to copy by hand.
            setPaste(payload);
            setTransfer('blocked');
        }
    };

    const applyPaste = () => {
        const parsed = parseTransferPayload(paste);
        if (!parsed.ok) {
            setTransfer('bad');
            return;
        }
        setDrawings((list) => mergeDrawings(list, parsed.drawings));
        setPaste('');
        setTransfer('ok');
    };

    const exportFile = () => {
        const payload = JSON.stringify(buildTransferPayload(symbol, drawings), null, 2);
        const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `openstock-${symbol.replace(/[^A-Za-z0-9]/g, '')}-drawings.json`;
        link.click();
        URL.revokeObjectURL(url);
        setTransfer('copied');
    };

    const importFile = async (file: File | undefined) => {
        if (!file) return;
        const parsed = parseTransferPayload(await file.text());
        if (!parsed.ok) {
            setTransfer('bad');
            return;
        }
        setDrawings((list) => mergeDrawings(list, parsed.drawings));
        setTransfer('ok');
    };

    const timeframes = useMemo(
        () => CANDLE_INTERVALS.map((i) => ({ id: i.id as string, label: t(INTERVAL_LABEL_KEYS[i.id] ?? 'chart.tf.1d') })),
        [t],
    );

    // What the layer paints: everything the trader has not hidden. The list and storage keep them all.
    const visibleDrawings = useMemo(() => drawings.filter((drawing) => !drawing.hidden), [drawings]);

    // The drawing layer gets the candles themselves: a regression channel is fitted to them and the
    // anchored VWAP and volume profile count them.
    const drawingCandles = useMemo(() => data?.candles ?? [], [data]);

    const body = (
        // dir=ltr on the plotting area too: the labels drawn on the canvas overlay are SVG text
        // (Fibonacci ratios, notes), and in an RTL page "0.786" would otherwise reorder to "786.0".
        <div className={cn('relative', expanded ? 'size-full' : 'h-[420px]')} dir="ltr">
            {/* The host element is the one lightweight-charts listens on; the data attribute keeps
                a browser check pointed at the chart rather than at the widget's inner canvases. */}
            <div ref={hostRef} data-chart="price" className="size-full" />

            {status === 'ready' && <ChartLegend lang={lang} readout={readout} studies={studies} />}

            {status === 'ready' && !replay && (
                <DrawingRail
                    tool={tool}
                    onPick={railPick}
                    magnet={magnet}
                    onMagnet={setMagnet}
                    locked={!!selectedDrawing?.locked}
                    canLock={!!selectedId}
                    onToggleLock={() => selectedId && toggleLock(selectedId)}
                    hidden={drawingsHidden}
                    onHideAll={() => setDrawingsHidden((value) => !value)}
                    canDelete={!!selectedId}
                    onDelete={() => selectedId && removeDrawing(selectedId)}
                    canUndo={canUndo(timeline)}
                    canRedo={canRedo(timeline)}
                    onUndo={undo}
                    onRedo={redo}
                    canClear={drawings.length > 0}
                    onClear={clearAll}
                    label={t}
                    renderGroupExtra={(group) => (group === 'elliott' ? countExtra : null)}
                />
            )}

            {status === 'ready' && !replay && !drawingsHidden && (
                <ChartDrawings
                    drawings={visibleDrawings}
                    selectedId={selectedId}
                    tool={tool}
                    text={noteText}
                    labels={pendingLabels}
                    editRequest={editRequest}
                    barTimes={barTimes}
                    candles={drawingCandles}
                    toScreen={toScreen}
                    fromScreen={fromScreen}
                    onCommit={commit}
                    onSelect={setSelectedId}
                    onMoveHandle={moveHandle}
                    onGestureStart={beginGesture}
                    onGestureEnd={endGesture}
                    snapPoint={snapDrawingPoint}
                    onEditText={editText}
                    onToolConsumed={() => {
                        // "Stay in drawing mode" keeps the tool armed, so a run of shapes needs no re-pick.
                        if (!stayDrawingRef.current) setTool(null);
                    }}
                    label={t}
                />
            )}

            {status === 'loading' && !replay && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-[13px] text-faint">
                    <Loader2 className="size-4 animate-spin" /> {t('chart.loading')}
                </div>
            )}

            {status === 'error' && !replay && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-[13px] text-faint">
                    <p>{t('chart.error')}</p>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => void load()} className="btn btn-ghost">
                            <RefreshCw /> {t('chart.retry')}
                        </button>
                        <a href={tradingViewSymbolUrl(tvSymbol)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                            <ExternalLink /> {t('stock.openTV')}
                        </a>
                    </div>
                </div>
            )}
        </div>
    );

    const menuItem = (key: string, label: string, onClick: () => void, active = false) => (
        <button
            key={key}
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                'flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-start text-[12.5px] font-semibold hover:bg-hover',
                active && 'text-brand-ink',
            )}
        >
            <span className="flex-1 whitespace-nowrap">{label}</span>
            {active && <span className="text-[11px]">●</span>}
        </button>
    );

    // A chart alert defaults to the level the trader just selected, else the last close.
    const selectedLevel = selectedDrawing && selectedDrawing.points.length === 1 ? selectedDrawing.points[0].price : null;
    // A line the selected drawing can hand to an alert: snapshotted now, so later dragging it does
    // not change what was promised.
    const selectedAnchor = useMemo(
        () => (selectedDrawing ? anchorFor(selectedDrawing.tool, selectedDrawing.points) : null),
        [selectedDrawing],
    );
    const lastClose = (data?.candles ?? []).at(-1)?.close ?? null;
    const alertPrice = selectedLevel ?? lastClose;

    const compareLegend = [
        ...(data ? [{ symbol, change: latestChange(data.candles, compareFrom) }] : []),
        ...compareList.flatMap((compared) => {
            const set = compareData[compared];
            return set ? [{ symbol: compared, change: latestChange(set.candles, compareFrom) }] : [];
        }),
    ];

    const dropdown = (id: MenuId, label: string, items: MenuItem[], footer?: ReactNode) => (
        <div key={id} className="relative">
            <button
                type="button"
                onClick={() => {
                    setMenu((current) => (current === id ? null : id));
                    setAutoNotice(null);
                }}
                aria-expanded={menu === id}
                className={cn('pill h-7 px-2.5 text-[12px] gap-1.5', menu === id && 'is-up')}
            >
                {label} <ChevronDown className="size-3" />
            </button>
            {menu === id && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
                    <div className="absolute z-30 mt-1 flex max-h-[24rem] min-w-52 flex-col gap-0.5 overflow-y-auto rounded-[12px] bg-card p-1.5 shadow-[0_0_0_1px_var(--line),0_16px_40px_oklch(0_0_0/0.5)]">
                        {items.map((item) =>
                            menuItem(item.key, item.label, item.onClick, item.active),
                        )}
                        {footer}
                    </div>
                </>
            )}
        </div>
    );

    return (
        <div className="flex flex-col gap-2">
            {/* The chart itself stays LTR: mirrored axes and prices are the one thing RTL must not touch. */}
            <div className="chart-toolbar" dir="ltr">
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
                <ChartStudiesMenu lang={lang} studies={studies} onChange={updateStudies} />
                {chartType === 'linebreak' && (
                    <label className="flex items-center gap-1 text-[11px] text-faint">
                        {t('chart.lineBreakCount')}
                        <input
                            type="number"
                            inputMode="numeric"
                            min={2}
                            max={20}
                            step={1}
                            value={lineBreakCount ?? ''}
                            placeholder="3"
                            aria-label={t('chart.lineBreakCount')}
                            onChange={(event) => setLineBreakCount(parseLineBreakCount(event.target.value))}
                            className="num w-14 rounded-[6px] bg-page px-1.5 py-0.5 text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </label>
                )}
                {chartType === 'kagi' && (
                    <label className="flex items-center gap-1 text-[11px] text-faint">
                        {t('chart.kagiReversal')}
                        <input
                            type="number"
                            inputMode="decimal"
                            min={0.5}
                            max={50}
                            step={0.5}
                            value={kagiReversal == null ? '' : Number((kagiReversal * 100).toFixed(2))}
                            placeholder="4"
                            aria-label={t('chart.kagiReversal')}
                            onChange={(event) => {
                                const percent = Number(event.target.value);
                                setKagiReversal(Number.isFinite(percent) ? parseKagiReversal(percent / 100) : undefined);
                            }}
                            className="num w-16 rounded-[6px] bg-page px-1.5 py-0.5 text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </label>
                )}
                {chartType === 'renko' && (
                    <label className="flex items-center gap-1 text-[11px] text-faint">
                        {t('chart.renkoBox')}
                        <input
                            type="number"
                            inputMode="decimal"
                            min={0.01}
                            step={0.01}
                            value={renkoBox ?? ''}
                            placeholder="0.5%"
                            aria-label={t('chart.renkoBox')}
                            onChange={(event) => setRenkoBox(parseRenkoBox(event.target.value))}
                            className="num w-16 rounded-[6px] bg-page px-1.5 py-0.5 text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </label>
                )}
                {dropdown(
                    'type',
                    t('chart.type'),
                    CHART_TYPES.map((type) => ({
                        key: type,
                        label: t(CHART_TYPE_KEYS[type]),
                        onClick: () => {
                            setChartType(type);
                            setMenu(null);
                        },
                        active: chartType === type,
                    })),
                )}
                {dropdown(
                    'tz',
                    t('chart.tz'),
                    TIME_ZONES.map((zone) => ({
                        key: zone.id,
                        label: t(zone.label),
                        onClick: () => {
                            setTimeZone(zone.id);
                            setMenu(null);
                        },
                        active: timeZone === zone.id,
                    })),
                )}
                <button
                    type="button"
                    onClick={() => setInvertScale((value) => !value)}
                    aria-pressed={invertScale}
                    className={cn('pill h-7 px-2.5 text-[12px]', invertScale && 'is-up')}
                    title={t('chart.scale.invert')}
                >
                    {t('chart.scale.invert')}
                </button>
                <button
                    type="button"
                    onClick={() => setSessionBreaks((value) => !value)}
                    aria-pressed={sessionBreaks}
                    className={cn('pill h-7 px-2.5 text-[12px]', sessionBreaks && 'is-up')}
                    title={t('chart.sessionBreaks')}
                >
                    {t('chart.sessionBreaks')}
                </button>
                {dropdown(
                    'scale',
                    t('chart.scale'),
                    SCALE_MODES.map((mode) => ({
                        key: mode,
                        label: t(SCALE_MODE_KEYS[mode]),
                        onClick: () => {
                            setScaleMode(mode);
                            setMenu(null);
                        },
                        active: scaleMode === mode,
                    })),
                )}
                <button
                    type="button"
                    onClick={() => (replay ? exitReplay() : startReplay())}
                    aria-pressed={replay}
                    className={cn('pill h-7 gap-1.5 px-2.5 text-[12px]', replay && 'is-up')}
                    title={t('replay.title')}
                >
                    <History className="size-3.5" /> {t('replay.open')}
                </button>
                {!replay && (
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setCompareOpen((value) => !value)}
                        aria-expanded={compareOpen}
                        className={cn('pill h-7 px-2.5 text-[12px] gap-1.5', compareList.length > 0 && 'is-up')}
                        title={t('chart.compare')}
                    >
                        <GitCompare className="size-3.5" /> {t('chart.compare')}
                        {compareList.length > 0 && <span className="num text-faint">{compareList.length}</span>}
                    </button>
                    {compareOpen && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setCompareOpen(false)} />
                            <div className="absolute end-0 z-30 mt-1 flex w-64 flex-col gap-1.5 rounded-[12px] bg-card p-2 shadow-[0_0_0_1px_var(--line),0_16px_40px_oklch(0_0_0/0.5)]">
                                <p className="px-1 text-[11.5px] text-faint">{t('chart.compareHint')}</p>
                                <form
                                    onSubmit={(event) => { event.preventDefault(); addCompare(); }}
                                    className="flex gap-1.5"
                                >
                                    <input
                                        value={compareInput}
                                        onChange={(event) => setCompareInput(event.target.value)}
                                        placeholder={t('chart.comparePlaceholder')}
                                        dir="ltr"
                                        className="mono h-8 flex-1 rounded-[8px] bg-page px-2 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                    <button type="submit" className="pill h-8 px-2.5" disabled={compareList.length >= COMPARE_LIMIT} aria-label={t('chart.compareAdd')}>
                                        <Plus className="size-3.5" />
                                    </button>
                                </form>
                                {compareList.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {compareList.map((compared) => (
                                            <span key={compared} className="pill mono h-7 gap-1.5 px-2 text-[11.5px]">
                                                {compared}
                                                <button type="button" onClick={() => removeCompare(compared)} aria-label={`${t('chart.compareRemove')} ${compared}`}>
                                                    <X className="size-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {compareList.length >= COMPARE_LIMIT && (
                                    <p className="px-1 text-[11px] text-faint">{t('chart.compareMax')}</p>
                                )}
                            </div>
                        </>
                    )}
                </div>
                )}
                {!replay && <StrategyMenu symbol={symbol} intervalId={intervalId} lang={lang} onChange={applyStrategyMarkers} initial={autoStrategy} />}
                <button
                    type="button"
                    onClick={() => setShortcutsOpen(true)}
                    className="icon-btn ms-auto"
                    aria-label={t('chart.shortcuts.title')}
                    title={t('chart.shortcuts.title')}
                >
                    <Keyboard />
                </button>
                <button
                    type="button"
                    onClick={() => void exportImage()}
                    className="icon-btn"
                    aria-label={t('chart.export')}
                    title={t('chart.export')}
                >
                    <Camera />
                </button>
                <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    className="icon-btn"
                    aria-label={t(expanded ? 'chart.exitFullscreen' : 'chart.fullscreen')}
                    title={t(expanded ? 'chart.exitFullscreen' : 'chart.fullscreen')}
                >
                    {expanded ? <Minimize2 /> : <Maximize2 />}
                </button>
            </div>

            {/* The drawing toolkit is off in replay: a note drawn on a later turn would give the future away. */}
            {!replay && (
            <div className="chart-toolbar">
                {alertSource(symbol) && (
                    <CreateAlertModal
                        symbol={symbol}
                        currentPrice={alertPrice}
                        currency={data?.currency ?? 'USD'}
                        lang={lang}
                    >
                        <button
                            type="button"
                            className={cn('pill h-7 gap-1.5 px-2.5 text-[12px]', selectedLevel != null && 'is-up')}
                            title={t('chart.alert')}
                        >
                            <Bell className="size-3.5" /> {t('chart.alert')}
                        </button>
                    </CreateAlertModal>
                )}
                {alertSource(symbol) && selectedAnchor && (
                    <CreateAlertModal
                        symbol={symbol}
                        currentPrice={alertPrice}
                        currency={data?.currency ?? 'USD'}
                        lang={lang}
                        anchor={selectedAnchor}
                    >
                        <button
                            type="button"
                            className="pill h-7 gap-1.5 px-2.5 text-[12px] is-up"
                            title={t('chart.alertOnDrawing')}
                        >
                            <BellPlus className="size-3.5" /> {t('chart.alertOnDrawing')}
                        </button>
                    </CreateAlertModal>
                )}
                {tool != null && tool !== 'select' && tool !== 'measure' && carriesText(tool) && (
                    <input
                        value={noteText}
                        onChange={(event) => setNoteText(event.target.value)}
                        placeholder={t(tool === 'image' ? 'chart.imagePlaceholder' : 'chart.notePlaceholder')}
                        maxLength={tool === 'image' ? 300 : 80}
                        className="h-7 w-40 rounded-full bg-page px-3 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
                        dir="auto"
                    />
                )}
                <div role="group" aria-label={t('chart.tool.width')} className="flex items-center gap-0.5">
                    {DRAWING_WIDTHS.map((step) => {
                        const active = (selectedDrawing?.width ?? 1.6) === step;
                        return (
                            <button
                                key={step}
                                type="button"
                                onClick={() => restyleDrawing({ width: step })}
                                disabled={!selectedId}
                                aria-pressed={selectedDrawing?.width === step}
                                aria-label={`${t('chart.tool.width')} ${arDigits(step, lang)}`}
                                className={cn(
                                    'num rounded-[5px] px-1 py-px text-[10.5px] text-faint transition-colors hover:bg-hover/40',
                                    active && 'bg-hover/60 text-foreground',
                                )}
                            >
                                {arDigits(step, lang)}
                            </button>
                        );
                    })}
                </div>
                {/* Type styling, only while a tool that carries words is selected. */}
                {selectedDrawing && carriesText(selectedDrawing.tool) && (
                    <>
                        <div role="group" aria-label={t('chart.text.size')} className="flex items-center gap-0.5">
                            {TEXT_SIZES.map((size) => {
                                const active = (selectedDrawing.textSize ?? 'md') === size;
                                return (
                                    <button
                                        key={size}
                                        type="button"
                                        onClick={() => restyleDrawing({ textSize: size })}
                                        aria-pressed={active}
                                        aria-label={t(`chart.text.${size}`)}
                                        title={t(`chart.text.${size}`)}
                                        className={cn(
                                            'rounded-[5px] px-1.5 py-px text-faint transition-colors hover:bg-hover/40',
                                            size === 'sm' ? 'text-[10px]' : size === 'md' ? 'text-[12px]' : 'text-[14px]',
                                            active && 'bg-hover/60 text-foreground',
                                        )}
                                    >
                                        A
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            onClick={() => restyleDrawing({ bold: !selectedDrawing.bold })}
                            aria-pressed={!!selectedDrawing.bold}
                            aria-label={t('chart.text.bold')}
                            title={t('chart.text.bold')}
                            className={cn('icon-btn text-[13px] font-bold', selectedDrawing.bold && 'text-brand')}
                        >
                            B
                        </button>
                    </>
                )}
                <div role="group" aria-label={t('chart.tool.dash')} className="flex items-center gap-0.5">
                    {DRAWING_DASHES.map((dash) => {
                        const active = (selectedDrawing?.dash ?? 'solid') === dash;
                        return (
                            <button
                                key={dash}
                                type="button"
                                onClick={() => restyleDrawing({ dash })}
                                disabled={!selectedId}
                                aria-pressed={active}
                                aria-label={t(`chart.tool.${dash}`)}
                                title={t(`chart.tool.${dash}`)}
                                className={cn('icon-btn', active && 'text-brand')}
                            >
                                <span
                                    aria-hidden="true"
                                    className="block w-4"
                                    style={{ borderTop: `2px ${dash === 'dotted' ? 'dotted' : dash === 'dashed' ? 'dashed' : 'solid'} currentColor` }}
                                />
                            </button>
                        );
                    })}
                </div>
                <button
                    type="button"
                    onClick={toggleDefaultStyle}
                    disabled={!selectedId || (!styleIsSet && !hasDefaultStyle)}
                    aria-pressed={hasDefaultStyle}
                    title={t(hasDefaultStyle ? 'chart.style.clear' : 'chart.style.save')}
                    aria-label={t(hasDefaultStyle ? 'chart.style.clear' : 'chart.style.save')}
                    className={cn('icon-btn', hasDefaultStyle && 'text-brand')}
                >
                    {hasDefaultStyle ? <BookmarkCheck /> : <Bookmark />}
                </button>
                <button type="button" onClick={copySelected} disabled={!selectedId} className="icon-btn" title={t('chart.tool.copy')} aria-label={t('chart.tool.copy')}>
                    <Copy />
                </button>
                <button type="button" onClick={pasteClipboard} className="icon-btn" title={t('chart.tool.paste')} aria-label={t('chart.tool.paste')}>
                    <ClipboardPaste />
                </button>
                <button type="button" onClick={duplicateSelected} disabled={!selectedId} className="icon-btn" title={t('chart.tool.duplicate')} aria-label={t('chart.tool.duplicate')}>
                    <CopyPlus />
                </button>
                <button
                    type="button"
                    onClick={toggleLockAll}
                    disabled={drawings.length === 0}
                    aria-pressed={allLocked}
                    className={cn('pill h-7 gap-1.5 px-2.5 text-[12px]', allLocked && 'is-up')}
                    title={t(allLocked ? 'chart.unlockAll' : 'chart.lockAll')}
                >
                    {allLocked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />} {t(allLocked ? 'chart.unlockAll' : 'chart.lockAll')}
                </button>
                <button
                    type="button"
                    onClick={toggleStayDrawing}
                    aria-pressed={stayDrawing}
                    className={cn('pill h-7 gap-1.5 px-2.5 text-[12px]', stayDrawing && 'is-up')}
                    title={t('chart.stayDrawing')}
                >
                    <Repeat className="size-3.5" /> {t('chart.stayDrawing')}
                </button>
                <button
                    type="button"
                    onClick={() => layerSelected('front')}
                    disabled={!selectedId}
                    className="icon-btn"
                    title={t('chart.layer.front')}
                    aria-label={t('chart.layer.front')}
                >
                    <BringToFront />
                </button>
                <button
                    type="button"
                    onClick={() => layerSelected('back')}
                    disabled={!selectedId}
                    className="icon-btn"
                    title={t('chart.layer.back')}
                    aria-label={t('chart.layer.back')}
                >
                    <SendToBack />
                </button>
                {tool && tool !== 'select' && (
                    <button type="button" onClick={() => startTool(null)} className="pill h-7 px-2.5 text-[12px] gap-1.5">
                        <X className="size-3.5" /> {t('chart.cancel')}
                    </button>
                )}
                <div className="relative ms-auto">
                    <button
                        type="button"
                        onClick={() => setMenu((current) => (current === 'transfer' ? null : 'transfer'))}
                        aria-expanded={menu === 'transfer'}
                        className={cn('pill h-7 px-2.5 text-[12px] gap-1.5', menu === 'transfer' && 'is-up')}
                    >
                        <Download className="size-3.5" /> {t('chart.transfer')} <ChevronDown className="size-3" />
                    </button>
                    {menu === 'transfer' && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
                            <div className="absolute end-0 z-30 mt-1 flex w-72 flex-col gap-1.5 rounded-[12px] bg-card p-2 shadow-[0_0_0_1px_var(--line),0_16px_40px_oklch(0_0_0/0.5)]">
                                <p className="px-1 text-[11.5px] text-faint">{t('chart.transferHint')}</p>
                                <div className="flex gap-1.5">
                                    <button type="button" onClick={() => void copySetup()} disabled={drawings.length === 0} className="pill h-7 flex-1 px-2 text-[12px]">
                                        {t('chart.transferCopy')}
                                    </button>
                                    <button type="button" onClick={exportFile} disabled={drawings.length === 0} className="pill h-7 flex-1 px-2 text-[12px]">
                                        <Download className="size-3" /> {t('chart.transferExport')}
                                    </button>
                                </div>
                                <textarea
                                    value={paste}
                                    onChange={(event) => setPaste(event.target.value)}
                                    placeholder={t('chart.transferPaste')}
                                    rows={3}
                                    dir="ltr"
                                    className="w-full resize-y rounded-[10px] bg-page p-2 font-mono text-[11px] shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
                                />
                                <div className="flex gap-1.5">
                                    <button type="button" onClick={applyPaste} disabled={!paste.trim()} className="pill h-7 flex-1 px-2 text-[12px] is-up">
                                        {t('chart.transferApply')}
                                    </button>
                                    <button type="button" onClick={() => fileRef.current?.click()} className="pill h-7 flex-1 px-2 text-[12px]">
                                        <Upload className="size-3" /> {t('chart.transferImport')}
                                    </button>
                                </div>
                                {transfer && (
                                    <p className={cn('px-1 text-[11.5px]', transfer === 'bad' || transfer === 'blocked' ? 'text-down' : 'text-up')}>
                                        {transfer === 'ok'
                                            ? t('chart.transferOk')
                                            : transfer === 'copied'
                                              ? t('chart.transferCopied')
                                              : transfer === 'blocked'
                                                ? t('chart.transferBlocked')
                                                : t('chart.transferBad')}
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>
                <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(event) => void importFile(event.target.files?.[0])}
                />
            </div>
            )}

            <div ref={replayPanelRef} />
            {replay && (
                <ReplayPanel
                    lang={lang}
                    candles={replayCandles}
                    cursor={cursor}
                    playing={playing}
                    speed={speed}
                    account={account}
                    currency={replaySet?.currency || data?.currency || 'USD'}
                    loading={replayStatus === 'loading'}
                    error={orderError}
                    resumedFrom={resumedFrom}
                    onCursor={moveCursor}
                    onTogglePlay={togglePlayback}
                    onSpeed={setSpeed}
                    onStart={moveCursor}
                    onFirst={() => { if (replayCandles.length > 0) moveCursor(replayCandles[0].time); }}
                    onRandom={() => { if (replayCandles.length > 0) moveCursor(replayCandles[randomCursor(replayCandles.length)].time); }}
                    onExit={exitReplay}
                    onBuy={(quantity) => placePaperOrder('buy', quantity)}
                    onSell={(quantity) => placePaperOrder('sell', quantity)}
                    intent={intent}
                    onPlacePending={placePendingOrder}
                    onCancelOrder={cancelPendingOrder}
                    onSetBracket={setBracket}
                    onClearBracket={clearBracket}
                    onReset={resetPaperAccount}
                />
            )}

            {!replay && compareList.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-page/60 px-3 py-1.5 text-[12px]" dir="ltr">
                    <span className="text-[11px] font-semibold text-faint">{t('chart.compare')}</span>
                    {compareLegend.map((entry, i) => (
                        <span key={entry.symbol} className="flex items-center gap-1.5">
                            <span className="size-2 rounded-full" style={{ background: `var(${COMPARE_COLORS[i % COMPARE_COLORS.length]})` }} />
                            <span className="mono">{entry.symbol}</span>
                            {entry.change != null && (
                                <span className={entry.change >= 0 ? 'text-up' : 'text-down'}>
                                    {entry.change >= 0 ? '+' : ''}{entry.change.toFixed(2)}%
                                </span>
                            )}
                        </span>
                    ))}
                </div>
            )}

            {!replay && drawings.length > 0 && (
                <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-[10px] bg-page/60 p-1">
                    <p className="px-2 pt-0.5 text-[11px] font-semibold text-faint">
                        {t('chart.list')} · {drawings.length}
                    </p>
                    {drawings.map((drawing) => (
                        <div
                            key={drawing.id}
                            className={cn('flex items-center gap-2 rounded-[8px] px-2 py-1 text-[12.5px]', drawing.id === selectedId && 'bg-hover')}
                        >
                            <button
                                type="button"
                                onClick={() => cycleColor(drawing.id)}
                                title={t('chart.color')}
                                aria-label={`${t('chart.color')}: ${drawingColor(drawing)}`}
                                className="size-4 shrink-0 rounded-full border border-line-strong"
                                style={{ backgroundColor: drawingColor(drawing) }}
                            />
                            <button type="button" onClick={() => setSelectedId(drawing.id)} className="flex flex-1 items-center gap-2 text-start">
                                <span className="font-semibold">{toolLabel(drawing)}</span>
                                <span className="mono num truncate text-[11.5px] text-faint">{summary(drawing)}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleHidden(drawing.id)}
                                aria-pressed={!!drawing.hidden}
                                title={t(drawing.hidden ? 'chart.show' : 'chart.hide')}
                                aria-label={t(drawing.hidden ? 'chart.show' : 'chart.hide')}
                                className={cn('icon-btn', drawing.hidden && 'text-warn')}
                            >
                                {drawing.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleLock(drawing.id)}
                                aria-pressed={!!drawing.locked}
                                title={t(drawing.locked ? 'chart.tool.unlock' : 'chart.tool.lock')}
                                aria-label={t(drawing.locked ? 'chart.tool.unlock' : 'chart.tool.lock')}
                                className={cn('icon-btn', drawing.locked && 'text-warn')}
                            >
                                {drawing.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                            </button>
                            {carriesText(drawing.tool) && (
                                <button
                                    type="button"
                                    onClick={() => setEditRequest({ id: drawing.id, nonce: Date.now() })}
                                    title={t('chart.editText')}
                                    aria-label={t('chart.editText')}
                                    className="icon-btn"
                                >
                                    <Pencil className="size-3.5" />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => removeDrawing(drawing.id)}
                                title={t('chart.delete')}
                                aria-label={t('chart.delete')}
                                className="icon-btn is-danger"
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {!replay && (
                <p role="status" className="px-1 text-[11px] text-faint">
                    {t(
                        syncState === 'saving'
                            ? 'chart.sync.saving'
                            : syncState === 'loading'
                              ? 'chart.sync.loading'
                              : syncState === 'local'
                                ? 'chart.sync.local'
                                : syncState === 'error'
                                  ? 'chart.sync.error'
                                  : 'chart.sync.saved',
                    )}
                </p>
            )}

            {expanded && <div className="fixed inset-0 z-40 bg-page/70 backdrop-blur-[3px]" onClick={() => setExpanded(false)} />}
            <div className={cn(expanded && 'fixed inset-3 z-50 rounded-[14px] bg-card p-3 shadow-[0_0_0_4px_var(--frame),0_24px_60px_oklch(0_0_0/0.6)]')}>
                {body}
            </div>

            <p className="text-[12px] text-faint">{t(replay ? 'replay.noFuture' : 'chart.drawingHint')}</p>
            <p className="text-[12px] text-faint">
                <ExternalLink className="me-1 inline size-3.5" />
                <a href={tradingViewSymbolUrl(tvSymbol)} target="_blank" rel="noopener noreferrer" className="underline">
                    {t('stock.openTV')}
                </a>
            </p>

            {/* The whole keyboard on one card: the tool letters and the editing chords, from the same
                tables the handlers read, so the help can never drift from what the keys do. */}
            {shortcutsOpen && (
                <div
                    className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('chart.shortcuts.title')}
                    onClick={() => setShortcutsOpen(false)}
                >
                    <div className="card w-full max-w-lg p-5" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-[15px] font-bold">{t('chart.shortcuts.title')}</h2>
                            <button type="button" onClick={() => setShortcutsOpen(false)} className="icon-btn" aria-label={t('chart.shortcuts.close')}>
                                <X className="size-4" />
                            </button>
                        </div>
                        <div className="mt-4 grid gap-6 sm:grid-cols-2">
                            <div>
                                <p className="form-label">{t('chart.shortcuts.tools')}</p>
                                <ul className="mt-2 flex flex-col gap-1.5">
                                    {TOOL_SHORTCUTS.map((shortcut) => (
                                        <li key={shortcut.key} className="flex items-center justify-between gap-3 text-[13px]">
                                            <span className="text-muted-foreground">{t(`chart.tool.${shortcut.tool}` as StringKey)}</span>
                                            <kbd className="kbd">{shortcut.key.toUpperCase()}</kbd>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <p className="form-label">{t('chart.shortcuts.edit')}</p>
                                <ul className="mt-2 flex flex-col gap-1.5">
                                    {EDIT_SHORTCUTS.map((shortcut) => (
                                        <li key={shortcut.keys} className="flex items-center justify-between gap-3 text-[13px]">
                                            <span className="text-muted-foreground">{t(shortcut.labelKey)}</span>
                                            <kbd className="kbd">{shortcut.keys}</kbd>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

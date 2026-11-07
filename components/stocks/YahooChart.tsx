'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
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
    BarChart3,
    BellPlus,
    BringToFront,
    Camera,
    ChevronDown,
    ChevronsRight,
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
    LayoutTemplate,
    Loader2,
    Lock,
    Unlock,
    Maximize2,
    Minimize2,
    Pencil,
    Plus,
    RefreshCw,
    Repeat,
    Share2,
    Search,
    SendToBack,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import ChartDrawings, { type ActiveTool } from '@/components/stocks/ChartDrawings';
import { magnetPixels, nearestBar, nextMagnetStrength, snapPoint, type MagnetStrength } from '@/lib/chart-magnet';
import { EDIT_SHORTCUTS, TOOL_SHORTCUTS, toolForKey } from '@/lib/chart-hotkeys';
import {
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
import { getEarningsDates } from '@/lib/actions/finnhub.actions';
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
import { COLOR_KEYS, COUNT_GLYPHS, COUNT_TOOL, DRAWING_COLORS, DRAWING_DASHES, DRAWING_WIDTHS, FILL_OPACITIES, IMAGE_DATA_MAX, MAX_FIB_LEVELS, TEXT_SIZES, buildTransferPayload, carriesText, cloneDrawing, drawingColor, fibRatiosOf, fillOf, hasFibLevels, hasFill, isColorKey, layerDrawings, layerDrawingsMany, loadDrawings, mergeDrawings, nearestTime, newDrawingId, nextColor, parseTransferPayload, readStayDrawing, saveDrawings, textColorOf, toolDef, translateDrawing, type ColorKey, type CountDegree, type CountKind, type DrawPoint, type Drawing, type DrawingDash, type DrawingWidth, type LayerMove, type ScreenPoint, type ShapeTool, visibleOn, withPoint, withText, writeStayDrawing } from '@/lib/chart-drawings';
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
import { addTemplate, loadTemplates, removeTemplate, saveTemplates, styleOfDrawing, stylePatch, type DrawingTemplate } from '@/lib/drawing-templates';
import { addChartTemplate, chartTemplateCounts, instantiateChartTemplate, loadChartTemplates, removeChartTemplate, saveChartTemplates, type ChartTemplate } from '@/lib/chart-templates';
import { decodeChartShare, sharePath } from '@/lib/chart-share';
import { cn, tradingViewSymbolUrl } from '@/lib/utils';
import { AUTO_SENSITIVITIES, autoCount, type AutoSensitivity } from '@/lib/auto-count';
import { createCandleHost, token, type CandleHost } from '@/lib/candle-host';
import CandleTooltip from '@/components/stocks/CandleTooltip';
import { MAX_STUDIES, defaultStudy, type StudyConfig, type StudyId } from '@/lib/chart-studies';
import ToolPalette from '@/components/stocks/ToolPalette';
import ChartToolbarMore from '@/components/stocks/ChartToolbarMore';
import type { ToolEntry } from '@/lib/tools/catalog';
import { readStudies, writeStudies } from '@/lib/chart-studies-storage';
import {
    mergeSetup,
    mergeStudies,
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
import ChartPeriods from '@/components/stocks/ChartPeriods';
import { formatPrice, signedPercent } from '@/lib/market-ribbon';
import { riyadhNow, sessionChange, tadawulPhase, type TadawulPhase } from '@/lib/chart-quote';
import ChartSettingsMenu from '@/components/stocks/ChartSettingsMenu';
import {
    DEFAULT_PALETTE_STATE,
    FALLBACK_THEME_PALETTE,
    paletteVars,
    readPaletteState,
    resolvePalette,
    themePalette,
    writePaletteState,
    type ChartPalette,
    type ChartPaletteState,
} from '@/lib/chart-palette';
import CreateAlertModal from '@/components/watchlist/CreateAlertModal';
import {
    CHART_TYPES,
    CHART_TYPE_KEYS,
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
    readChartType,
    readScaleMode,
    writeChartType,
    writeScaleMode,
    type ChartType,
    type ScaleMode,
} from '@/lib/chart-view';
import { STRATEGY_IDS, type StrategyId } from '@/lib/strategies';
import { arDigits, fillReasonLabel, tx, type Lang, type StringKey } from '@/lib/i18n';
import { toolFromParam } from '@/lib/shell/command';

type MenuId = 'lines' | 'patterns' | 'elliott' | 'counts' | 'cycles' | 'transfer' | 'type' | 'scale' | 'tz' | 'templates' | 'layout' | 'visibility' | 'fib' | 'tools' | 'tf';

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
    /** Fill the container instead of standing 420px tall — the overview's pane owns the height. */
    fill?: boolean;
    /**
     * Draw the quote header above the chart. Defaults to `fill`: the overview needs it because the
     * pane has no other identity, while a symbol page already prints the same price in its header
     * card and would only be repeating itself.
     */
    quote?: boolean;
};

/**
 * A chart for exchanges TradingView will not embed. Candles come from Yahoo (the same free source the
 * Saudi quotes use), the indicators are computed here, and the drawings are kept in this browser.
 * Nothing about it depends on a paid provider or an API key.
 */
export default function YahooChart({ symbol, tvSymbol, lang, preferredInterval, fill = false, quote: quoteHeader }: Props) {
    const showQuote = quoteHeader ?? fill;
    const t = useCallback((key: StringKey) => tx(lang, key), [lang]);

    const hostRef = useRef<HTMLDivElement>(null);
    // The chart's outermost element: its nearest hatch shell takes the palette too, so the frame
    // around the pane is painted in the same five colours as the pane itself.
    const rootRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
    // Strategy markers live on the price series; the plugin is rebuilt with every host, so the
    // markers to draw are kept in a ref and re-applied to whichever series is standing.
    const markersRef = useRef<SeriesMarker<UTCTimestamp>[]>([]);
    /** The dividends and splits of the symbol, drawn beside whatever a strategy marks. */
    const eventMarkersRef = useRef<SeriesMarker<UTCTimestamp>[]>([]);
    /** Results days: the last report and the next scheduled one, when the feed knows them. */
    const earningsMarkersRef = useRef<SeriesMarker<UTCTimestamp>[]>([]);
    const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    // The candle host is kept so a replay step can replace the candles in place: rebuilding the
    // chart on every bar would throw away the trader's zoom, which is exactly what a replay needs.
    const candleHostRef = useRef<CandleHost | null>(null);
    const displayRef = useRef<CandleSet | null>(null);
    const replayRef = useRef(false);
    // Set when a background refresh lands while the trader is sitting at the newest bar: the view
    // should follow the new bar instead of quietly sliding the newest one off the right edge.
    const followLatestRef = useRef(false);
    const replayPanelRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const imageFileRef = useRef<HTMLInputElement>(null);

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
    const [volumeVisible, setVolumeVisible] = useState(true);
    const volumeVisibleRef = useRef(true);
    volumeVisibleRef.current = volumeVisible;
    const [sessionBreaks, setSessionBreaks] = useState(false);
    const sessionBreaksRef = useRef(false);
    sessionBreaksRef.current = sessionBreaks;
    const [invertScale, setInvertScale] = useState(false);
    const invertScaleRef = useRef(false);
    invertScaleRef.current = invertScale;
    // The chart's own colours: a preset plus any hand-picked override, remembered per browser.
    const [paletteState, setPaletteState] = useState<ChartPaletteState>(DEFAULT_PALETTE_STATE);
    const paletteStateRef = useRef<ChartPaletteState>(DEFAULT_PALETTE_STATE);
    paletteStateRef.current = paletteState;
    // The theme's five colours, read from the live tokens so the pickers can show and edit them.
    const [themeColors, setThemeColors] = useState<ChartPalette>(FALLBACK_THEME_PALETTE);
    // The palette the chart is painting with, and the five colours the pickers show: the preset's
    // own when one is set, the theme's when it is not.
    const resolvedPalette = useMemo(() => resolvePalette(paletteState), [paletteState]);
    const effectivePalette = resolvedPalette ?? themeColors;
    const [renkoBox, setRenkoBox] = useState<number | undefined>(undefined);
    const renkoBoxRef = useRef<number | undefined>(undefined);
    renkoBoxRef.current = renkoBox;
    const [pnfBox, setPnfBox] = useState<number | undefined>(undefined);
    const pnfBoxRef = useRef<number | undefined>(undefined);
    pnfBoxRef.current = pnfBox;
    const [pnfReversal, setPnfReversal] = useState<number | undefined>(undefined);
    const pnfReversalRef = useRef<number | undefined>(undefined);
    pnfReversalRef.current = pnfReversal;
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
        setPaletteState(readPaletteState());
    }, []);
    useEffect(() => {
        writePaletteState(paletteState);
    }, [paletteState]);
    // The theme's tokens are CSS variables, so they are read from the live document — and re-read
    // when the shell flips the theme, so the pickers never show a colour the chart is not using.
    useEffect(() => {
        const sync = () => setThemeColors(themePalette());
        sync();
        window.addEventListener('rovex:theme', sync);
        return () => window.removeEventListener('rovex:theme', sync);
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
    // The same bar plus the pointer, for the tooltip that follows a hovered candle.
    const [hover, setHover] = useState<{ readout: BarReadout | null; point: { x: number; y: number } | null }>({
        readout: null,
        point: null,
    });
    const [tool, setTool] = useState<ActiveTool | null>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    // Hide-all: the drawings stay in memory, the layer just stops rendering.
    const [drawingsHidden, setDrawingsHidden] = useState(false);
    // The list of drawings is a reference, not a workspace: it stays folded to one strip until asked.
    const [listOpen, setListOpen] = useState(false);
    // Magnet is a working mode, not a preference: it starts off and cycles weak → strong → off.
    const [magnet, setMagnet] = useState<MagnetStrength>('off');
    const magnetRef = useRef<MagnetStrength>('off');
    magnetRef.current = magnet;
    const [pendingLabels, setPendingLabels] = useState<string[] | null>(null);
    const [noteText, setNoteText] = useState('');
    // An uploaded picture is a data payload, not a note: it must not leak into the next text tool.
    useEffect(() => {
        if (tool !== 'image' && noteText.startsWith('data:image')) setNoteText('');
    }, [tool, noteText]);
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
        setSelectedId([]);
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
        setSelectedId([]);
    }, []);
    const redo = useCallback(() => {
        setTimeline((history) => redoHistory(history));
        setSelectedId([]);
    }, []);
    // Several drawings can be selected at once: shift-click adds to the set, and the whole set moves,
    // restyles and deletes together. `selectedId` is the one a control that takes a single drawing
    // acts on — a handle, a colour chip, an edit — namely the last one picked.
    const [selectedIds, setSelectedId] = useState<string[]>([]);
    const selectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
    const selectOnly = useCallback((id: string | null) => setSelectedId(id ? [id] : []), []);

    // A clipboard for drawings, in memory: a copy is a sketch until it is pasted.
    const clipboard = useRef<Drawing[]>([]);
    const copySelected = useCallback(() => {
        const chosen = drawings.filter((d) => selectedIds.includes(d.id));
        if (chosen.length > 0) clipboard.current = chosen;
    }, [drawings, selectedIds]);
    const offsetCopyList = (list: Drawing[]) =>
        list.map((drawing) =>
            cloneDrawing(drawing, newDrawingId(), { price: Math.max(0.001, Math.abs(drawing.points[0]?.price ?? 0) * 0.005) }),
        );
    const pasteClipboard = useCallback(() => {
        const source = clipboard.current;
        if (source.length === 0) return;
        const copies = offsetCopyList(source);
        setDrawings((list) => [...list, ...copies]);
        setSelectedId(copies.map((copy) => copy.id));
    }, [setDrawings]);
    const duplicateSelected = useCallback(() => {
        const chosen = drawings.filter((d) => selectedIds.includes(d.id));
        if (chosen.length === 0) return;
        const copies = offsetCopyList(chosen);
        setDrawings((list) => [...list, ...copies]);
        setSelectedId(copies.map((copy) => copy.id));
    }, [drawings, selectedIds, setDrawings]);
    const restyleDrawing = (patch: Partial<Pick<Drawing, 'width' | 'dash' | 'textSize' | 'bold' | 'italic' | 'background' | 'color' | 'textColor' | 'customColor' | 'customFill' | 'customTextColor' | 'fill' | 'fillOpacity' | 'timeframes' | 'fibLevels'>>) => {
        if (selectedIds.length === 0) return;
        const chosen = new Set(selectedIds);
        setDrawings((list) => list.map((d) => {
            if (!chosen.has(d.id)) return d;
            const next = { ...d, ...patch };
            // A cleared field must leave the drawing, not sit in it as undefined.
            for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
                if (patch[key] === undefined) delete next[key];
            }
            return next;
        }));
    };

    // A link from the share button carries a view, not a portfolio: apply it once, then drop the
    // parameter so a reload does not fight whatever the reader changes next.
    // The studies wait for the account's copy: applying them first would be overwritten by the merge
    // that runs when the sync settles. The interval and the chart type can go immediately.
    const pendingShare = useRef<ReturnType<typeof decodeChartShare>>(null);
    useEffect(() => {
        const token = new URLSearchParams(window.location.search).get('c');
        if (!token) return;
        const shared = decodeChartShare(token);
        if (shared) {
            pendingShare.current = shared;
            setIntervalId(shared.interval);
            setChartType(shared.chartType);
        }
        // The token is spent: a reload keeps whatever the reader changes from here on.
        const url = new URL(window.location.href);
        url.searchParams.delete('c');
        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    }, []);

    useEffect(() => {
        if (shareApplied.current || syncState === 'loading') return;
        const shared = pendingShare.current;
        if (!shared) return;
        shareApplied.current = true;
        pendingShare.current = null;
        if (shared.studies.length > 0) updateStudies(mergeStudies(studies, shared.studies));
    }, [syncState, studies, updateStudies]);

    // A template paints the selected drawing, or arms the current tool for the next one.
    const applyTemplate = (style: ReturnType<typeof styleOfDrawing>) => {
        if (selectedIds.length > 0) {
            const chosen = new Set(selectedIds);
            setDrawings((list) => list.map((drawing) => (chosen.has(drawing.id) ? { ...drawing, ...stylePatch(style) } : drawing)));
            return;
        }
        const armed = tool && tool !== 'select' && tool !== 'measure' ? tool : undefined;
        if (armed) {
            const next = withDrawingStyle(drawingStyles, armed, style);
            setDrawingStyles(next);
            saveDrawingStyles(next);
        }
    };

    // A whole-chart template: the drawings are stamped on with fresh ids (so they add rather than
    // overwrite), and the studies merge by id the same way an imported setup does.
    const applyChartTemplate = (template: ChartTemplate) => {
        const applied = instantiateChartTemplate(template);
        if (applied.drawings.length > 0) setDrawings((list) => mergeDrawings(list, applied.drawings));
        if (applied.studies.length > 0) updateStudies(mergeStudies(studies, applied.studies));
    };

    const saveChartTemplate = () => {
        const next = addChartTemplate(chartTemplates, chartTemplateName, drawings, studies);
        if (next === chartTemplates) return;
        setChartTemplates(next);
        saveChartTemplates(next);
        setChartTemplateName('');
    };

    const [editRequest, setEditRequest] = useState<{ id: string; nonce: number } | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [menu, setMenu] = useState<MenuId | null>(null);
    // The phone fold: one row of controls until the trader asks for the rest of the toolbar.
    const [toolbarMore, setToolbarMore] = useState(false);
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
    // True once the trader has panned or zoomed away from the newest bar; shows the "back to latest" pill.
    const [scrolledBack, setScrolledBack] = useState(false);
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
    // The ghost feed: the bars after the cursor, painted faintly. Off by default, because seeing the
    // future is a choice a replay should not make for the trader.
    const [ghost, setGhost] = useState(false);

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

    // The bars the replay has not reached. They go to their own faint series, never to the price
    // series, so no indicator, drawing or marker can be shaped by them.
    const ghostCandles = useMemo(
        () => (replay && ghost ? replayCandles.slice(cursor + 1) : []),
        [replay, ghost, replayCandles, cursor],
    );

    // The quote header the overview draws above the chart: the instrument, its last print, the day's
    // move and whether its market is open. Every number comes from the candles already on screen —
    // the header never asks the feed a second question.
    // TASI is Tadawul's own index and arrives without the .SR suffix its listings carry.
    const isTadawul = symbol.toUpperCase().endsWith('.SR') || symbol.toUpperCase() === 'TASI';
    const quote = useMemo(() => {
        const candles = data?.candles ?? [];
        const last = candles.at(-1);
        if (!last) return null;
        return { price: last.close, change: sessionChange(candles, isTadawul ? 'riyadh' : 'utc', data?.previousClose) };
    }, [data, isTadawul]);

    // The clock is read after mount: the server's minute and the browser's would otherwise disagree
    // in the markup, and a phase is only useful when it is the reader's own now.
    const [phase, setPhase] = useState<TadawulPhase | null>(null);
    useEffect(() => {
        if (!isTadawul) return;
        const tick = () => {
            const now = riyadhNow(new Date());
            setPhase(tadawulPhase(now.weekday, now.minutes));
        };
        tick();
        const timer = window.setInterval(tick, 60_000);
        return () => window.clearInterval(timer);
    }, [isTadawul]);

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

    // `silent` is the background refresh: it never flashes the loading overlay, never clears the
    // chart on a failed fetch, and never moves the view or the "back to latest" pill.
    const load = useCallback(async (options?: { silent?: boolean }) => {
        const silent = options?.silent === true;
        if (!silent) setStatus('loading');
        const result = await getYahooCandles(symbol, intervalId);
        if (!result || result.candles.length === 0) {
            if (silent) return;
            setData(null);
            setStatus('error');
            return;
        }
        if (silent) followLatestRef.current = candleHostRef.current?.isAtLatest() ?? true;
        setData(result);
        setStatus('ready');
        if (!silent) setScrolledBack(false);
    }, [symbol, intervalId]);

    useEffect(() => {
        void load();
    }, [load]);

    // The feed is delayed, but a chart left open should still pick up the next bar without a reload.
    // One request a minute matches the server's own one-minute cache; a hidden tab costs nothing and
    // catches up the moment it is shown again. Replay owns its own history, so it is left alone.
    useEffect(() => {
        const refresh = () => {
            if (replayRef.current) return;
            if (document.visibilityState !== 'visible') return;
            void load({ silent: true });
        };
        const timer = window.setInterval(refresh, 60_000);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', refresh);
        };
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
    const [templates, setTemplates] = useState<DrawingTemplate[]>([]);
    // Whole-chart templates: every drawing and study, saved under a name and stamped onto any symbol.
    const [chartTemplates, setChartTemplates] = useState<ChartTemplate[]>([]);
    const shareApplied = useRef(false);
    const [templateName, setTemplateName] = useState('');
    const [chartTemplateName, setChartTemplateName] = useState('');
    const [levelDraft, setLevelDraft] = useState('');
    useEffect(() => {
        setDrawingStyles(loadDrawingStyles());
        setTemplates(loadTemplates());
        setChartTemplates(loadChartTemplates());
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
            lang,
            sessionBreaks: sessionBreaksRef.current,
            volumeVisible: volumeVisibleRef.current,
            invertScale: invertScaleRef.current,
            palette: resolvePalette(paletteStateRef.current),
            renkoBox: renkoBoxRef.current,
            kagiReversal: kagiReversalRef.current,
            lineBreakCount: lineBreakCountRef.current,
            pnfBox: pnfBoxRef.current,
            pnfReversal: pnfReversalRef.current,
            onPriceSeries: (series) => {
                // The host replaces the price series when the chart type changes; the markers and the
                // coordinate reference must follow the series that is actually on screen.
                seriesRef.current = series;
                // Every list from the start: the events are already known when the chart is built.
                markersApiRef.current = createSeriesMarkers(
                    series,
                    [...eventMarkersRef.current, ...earningsMarkersRef.current, ...markersRef.current].sort(
                        (a, b) => Number(a.time) - Number(b.time)
                    ),
                );
            },
            extend,
            onRangeChange: () => {
                setFrame((frame) => frame + 1);
                // The host is still null while the chart is being built; the first fit lands at the
                // newest bar, so only a real pan or zoom away should raise the pill.
                const host = candleHostRef.current;
                if (host) setScrolledBack(!host.isAtLatest());
            },
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
        const unsubscribeHover = host.subscribeHover(setHover);
        chartRef.current = host.chart;

        return () => {
            unsubscribeReadout();
            unsubscribeHover();
            candleHostRef.current = null;
            chartRef.current = null;
            seriesRef.current = null;
            markersApiRef.current = null;
            host.destroy();
        };
    }, [hasDisplay, intervalId, compareList, compareData, symbol, compareFrom, lang]);

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
        candleHostRef.current?.setPnfBox(pnfBox);
    }, [pnfBox]);
    useEffect(() => {
        candleHostRef.current?.setPnfReversal(pnfReversal);
    }, [pnfReversal]);
    useEffect(() => {
        candleHostRef.current?.setKagiReversal(kagiReversal);
    }, [kagiReversal]);
    useEffect(() => {
        candleHostRef.current?.setLineBreakCount(lineBreakCount);
    }, [lineBreakCount]);
    useEffect(() => {
        candleHostRef.current?.setVolumeVisible(volumeVisible);
    }, [volumeVisible]);
    // A palette change repaints the candles, the tile and the grid without rebuilding the chart.
    useEffect(() => {
        candleHostRef.current?.setPalette(resolvePalette(paletteState));
    }, [paletteState]);
    // The shell around the chart is not inside the chart's own style scope, so its frame tokens are
    // mirrored onto the nearest `.hatch`. Removed on cleanup, which hands the frame back to the theme.
    useEffect(() => {
        const hatch = rootRef.current?.closest('.hatch') as HTMLElement | null;
        if (!hatch || !resolvedPalette) return;
        const vars = paletteVars(resolvedPalette);
        for (const [name, value] of Object.entries(vars)) hatch.style.setProperty(name, value);
        return () => {
            for (const name of Object.keys(vars)) hatch.style.removeProperty(name);
        };
    }, [resolvedPalette]);
    // The theme toggle lives in the shell; the chart repaints itself when it flips.
    useEffect(() => {
        const onTheme = () => candleHostRef.current?.setTheme();
        window.addEventListener('rovex:theme', onTheme);
        return () => window.removeEventListener('rovex:theme', onTheme);
    }, []);
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
        if (!displayData) return;
        const host = candleHostRef.current;
        if (!host) return;
        host.setData(displayData);
        // A background refresh that arrived while the trader was at the newest bar keeps them there.
        if (followLatestRef.current) {
            followLatestRef.current = false;
            host.toLatest();
        }
    }, [displayData]);

    // The ghost feed follows the cursor: a step forward shortens it, a step back lengthens it.
    useEffect(() => {
        candleHostRef.current?.setGhost(ghostCandles);
    }, [ghostCandles]);

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

    /** Every list on one series: events and results sit under whatever the strategy is marking. */
    const syncMarkers = useCallback(() => {
        const all = [...eventMarkersRef.current, ...earningsMarkersRef.current, ...markersRef.current].sort(
            (a, b) => Number(a.time) - Number(b.time)
        );
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

    // Results days. A report is a day, not a bar, so it is only marked on daily-and-lower intervals;
    // the last report and the next scheduled one are both worth seeing on a chart.
    useEffect(() => {
        const intraday = ['1m', '5m', '15m', '30m', '60m', '2h', '4h'].includes(intervalId);
        const candles = data?.candles ?? [];
        if (intraday || candles.length === 0) {
            earningsMarkersRef.current = [];
            syncMarkers();
            return;
        }
        let cancelled = false;
        void getEarningsDates(symbol)
            .then((dates) => {
                if (cancelled || !dates) return;
                const first = candles[0].time;
                const last = candles[candles.length - 1].time;
                const markers: SeriesMarker<UTCTimestamp>[] = [];
                const add = (ms: number | null, text: string, position: 'aboveBar' | 'belowBar') => {
                    if (ms == null) return;
                    const time = Math.floor(ms / 1000);
                    if (time < first || time > last) return;
                    markers.push({ time: time as UTCTimestamp, position, shape: 'arrowDown', color: '#A78BFA', text });
                };
                add(dates.last, 'E', 'aboveBar');
                add(dates.next, 'E?', 'belowBar');
                earningsMarkersRef.current = markers;
                syncMarkers();
            })
            .catch(() => {
                /* A missing calendar is not a chart error. */
            });
        return () => {
            cancelled = true;
        };
    }, [symbol, intervalId, data, syncMarkers]);

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
        const tolerance = magnetPixels(magnetRef.current);
        if (tolerance === 0) return point;
        const series = seriesRef.current;
        const bars = displayRef.current?.candles ?? [];
        if (!series || bars.length === 0) return point;
        const bar = nearestBar(bars, point.time);
        if (!bar) return point;
        return snapPoint(point, bar, (price) => series.priceToCoordinate(price), tolerance);
    }, []);

    const startTool = (next: ActiveTool | null, labels: string[] | null = null) => {
        setMenu(null);
        setSelectedId([]);
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
        setSelectedId([drawing.id]);
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

    /**
     * The palette hands back a catalog entry and this decides what "insert" means for its family: a
     * drawing arms its tool, a study is added with its defaults, a chart type is chosen, and a
     * formula function opens a Formula study already written with that function's example.
     */
    const insertTool = (entry: ToolEntry) => {
        setMenu(null);
        if (entry.family === 'drawing') {
            railPick(entry.key as ActiveTool);
            return;
        }
        if (entry.family === 'chartType') {
            setChartType(entry.key as ChartType);
            return;
        }
        if (studies.length >= MAX_STUDIES) return;
        if (entry.family === 'study') {
            updateStudies([...studies, defaultStudy(entry.key as StudyId)]);
            return;
        }
        const formula = defaultStudy('formula');
        updateStudies([...studies, { ...formula, params: { ...formula.params, expression: entry.example ?? formula.params.expression } }]);
    };

    // A command-bar pick arrives as an address: ?tool=drawing:fib. It is applied once, then the URL
    // forgets it, so a reload does not arm the tool again. The ref keeps the effect out of the
    // handler's dependency list without freezing an old closure in it.
    const insertToolRef = useRef(insertTool);
    insertToolRef.current = insertTool;
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const entry = toolFromParam(params.get('tool'));
        if (!entry) return;
        insertToolRef.current(entry);
        const url = new URL(window.location.href);
        url.searchParams.delete('tool');
        window.history.replaceState({}, '', url.toString());
        // Once per page load: the parameter is gone from the URL by the time this runs again.
    }, []);

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
    // The anchor is taken once per gesture: a body drag is one edit, and translating from the
    // anchor (not from the last position) keeps it exact however fast the pointer moves.
    const bodyAnchor = useRef<Map<string, DrawPoint[]> | null>(null);
    // A group drag keeps one anchor per drawing, so every shape moves by the same delta from where
    // it was when the drag began — not from wherever it has been pushed to in the meantime.
    const beginBodyDrag = (ids: string[]) => {
        const anchors = new Map(
            drawings
                .filter((d) => ids.includes(d.id))
                .map((d) => [d.id, d.points.map((point) => ({ ...point }))] as const),
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
            present: history.present.map((d) => {
                if (!moving.has(d.id)) return d;
                const points = anchors.get(d.id);
                return points ? translateDrawing({ ...d, points }, delta) : d;
            }),
        }));
    };
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
    /** The same two toggles for the whole selection: one click locks or hides everything picked. */
    const toggleLockSelected = () => {
        if (selectedIds.length === 0) return;
        const chosen = new Set(selectedIds);
        const lock = !drawings.filter((d) => chosen.has(d.id)).every((d) => d.locked);
        setDrawings((list) => list.map((d) => (chosen.has(d.id) ? { ...d, locked: lock } : d)));
    };
    const toggleHiddenSelected = () => {
        if (selectedIds.length === 0) return;
        const chosen = new Set(selectedIds);
        const hide = !drawings.filter((d) => chosen.has(d.id)).every((d) => d.hidden);
        setDrawings((list) => list.map((d) => (chosen.has(d.id) ? { ...d, hidden: hide } : d)));
    };
    const allLocked = drawings.length > 0 && drawings.every((drawing) => drawing.locked);
    const toggleLockAll = () => setDrawings((list) => list.map((drawing) => ({ ...drawing, locked: !allLocked })));
    /** Which end of the pile the selected drawing sits on. The list's order is the stacking order. */
    const layerSelected = (move: LayerMove) => {
        if (selectedIds.length === 0) return;
        setDrawings((list) => (selectedIds.length === 1 ? layerDrawings(list, selectedIds[0], move) : layerDrawingsMany(list, selectedIds, move)));
    };
    const removeDrawing = (id: string) => {
        setDrawings((list) => list.filter((d) => d.id !== id));
        setSelectedId((current) => current.filter((selected) => selected !== id));
    };
    const removeSelected = () => {
        if (selectedIds.length === 0) return;
        const gone = new Set(selectedIds);
        setDrawings((list) => list.filter((d) => !gone.has(d.id)));
        setSelectedId([]);
    };
    const clearAll = () => {
        setDrawings([]);
        setSelectedId([]);
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
        // A palette paints the tile, so the PNG gets the same tile instead of a transparent hole.
        if (resolvedPalette) {
            ctx.fillStyle = resolvedPalette.background;
            ctx.fillRect(0, 0, out.width, out.height);
        }
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
    }, [symbol, intervalId, resolvedPalette]);

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

    // The link carries the view, not the drawings: the next person reads the same chart, and their
    // own levels are untouched.
    const shareChart = async () => {
        const path = sharePath({ symbol, interval: intervalId, chartType, studies });
        const url = `${window.location.origin}${path}`;
        try {
            await navigator.clipboard.writeText(url);
            toast.success(t('chart.shareCopied'));
        } catch {
            // A blocked clipboard still lets the address be copied by hand.
            window.prompt(t('chart.shareCopyManual'), url);
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
    // Hidden means "not now"; timeframes means "not on this interval".
    const visibleDrawings = useMemo(
        () => drawings.filter((drawing) => !drawing.hidden && visibleOn(drawing, intervalId)),
        [drawings, intervalId],
    );

    // The drawing layer gets the candles themselves: a regression channel is fitted to them and the
    // anchored VWAP and volume profile count them.
    const drawingCandles = useMemo(() => data?.candles ?? [], [data]);



    const body = (
        // dir=ltr on the plotting area too: the labels drawn on the canvas overlay are SVG text
        // (Fibonacci ratios, notes), and in an RTL page "0.786" would otherwise reorder to "786.0".
        <div
            className={cn('relative', expanded ? 'size-full' : fill ? 'min-h-[300px] flex-1' : 'h-[420px]')}
            dir="ltr"
        >
            {/* The host element is the one lightweight-charts listens on; the data attribute keeps
                a browser check pointed at the chart rather than at the widget's inner canvases. */}
            <div ref={hostRef} data-chart="price" className="size-full" />

            {status === 'ready' && (
                <CandleTooltip readout={hover.readout} point={hover.point} lang={lang} zone={timeZone} />
            )}

            {status === 'ready' && <ChartLegend lang={lang} readout={readout} studies={studies} />}

            {status === 'ready' && !replay && (
                <DrawingRail
                    tool={tool}
                    onPick={railPick}
                    magnetStrength={magnet}
                    onMagnet={() => setMagnet((current) => nextMagnetStrength(current))}
                    locked={!!selectedDrawing?.locked}
                    canLock={selectedIds.length > 0}
                    onToggleLock={toggleLockSelected}
                    hidden={drawingsHidden}
                    onHideAll={() => setDrawingsHidden((value) => !value)}
                    canDelete={selectedIds.length > 0}
                    onDelete={removeSelected}
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
                    selectedIds={selectedIds}
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
                    onMoveBody={moveBody}
                    onMoveBodyStart={beginBodyDrag}
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

            {/* Only after the trader has panned or zoomed away from the newest bar: one tap slides
                the view back without touching the zoom width. Hidden in replay, where the cursor
                owns the right edge. */}
            {status === 'ready' && !replay && scrolledBack && (
                <button
                    type="button"
                    onClick={() => {
                        candleHostRef.current?.toLatest();
                        setScrolledBack(false);
                    }}
                    className="absolute bottom-10 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-card px-2.5 py-1 text-[11.5px] font-semibold text-foreground shadow-[0_0_0_1px_var(--line),0_8px_24px_oklch(0_0_0/0.35)] transition-colors hover:bg-hover"
                >
                    <ChevronsRight className="size-3.5" aria-hidden="true" />
                    {t('chart.toLatest')}
                </button>
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

    const dropdown = (id: MenuId, label: string, items: MenuItem[], footer?: ReactNode, className?: string) => (
        <div key={id} className={cn('relative', className)}>
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
        <div
            ref={rootRef}
            className={cn('flex flex-col gap-2', fill && 'h-full min-h-0')}
            // A palette makes the chart its own surface: the tile, the toolbar and the quote header
            // all read on the same background instead of the page's.
            style={resolvedPalette
                ? ({ background: resolvedPalette.background, ...paletteVars(resolvedPalette) } as CSSProperties)
                : undefined}
        >
            {/* The quote header, overview only: what the pane is showing, in the order a trader asks
                it — instrument, last, change, is the market open, is this data late. */}
            {showQuote && (
                <div className="chart-quote">
                    <Link
                        href={`/stocks/${encodeURIComponent(symbol)}`}
                        className="chart-quote-sym mono"
                        dir="ltr"
                    >
                        {symbol}
                    </Link>
                    {quote ? (
                        <>
                            <bdi className="chart-quote-last num" dir="ltr">{formatPrice(quote.price, lang)}</bdi>
                            {quote.change != null && (
                                <bdi
                                    className={cn(
                                        'chart-quote-change num',
                                        quote.change > 0 ? 'is-up' : quote.change < 0 ? 'is-down' : 'is-flat',
                                    )}
                                    dir="ltr"
                                >
                                    {signedPercent(quote.change, lang)}
                                </bdi>
                            )}
                        </>
                    ) : (
                        <span className="chart-quote-loading" aria-hidden="true" />
                    )}
                    <span className="chart-quote-spacer" aria-hidden="true" />
                    {phase && (
                        <span className={cn('chart-quote-phase', phase === 'open' && 'is-open')}>
                            <span className="chart-quote-dot" aria-hidden="true" />
                            {t(`market.${phase}`)}
                        </span>
                    )}
                    <span className="chart-quote-chip">{t('status.delayed')}</span>
                </div>
            )}
            {/* The chart itself stays LTR: mirrored axes and prices are the one thing RTL must not touch. */}
            <div className={cn('chart-toolbar chart-toolbar-main', toolbarMore && 'is-open')} dir="ltr">
                {/* One track, one choice: the intervals are a segmented control, not seven pills. */}
                <ChartPeriods periods={timeframes} active={intervalId} lang={lang} onPick={setIntervalId} />
                <span className="tool-divider" aria-hidden />
                {/* A phone cannot spend five rows on intervals: one button names the one in use. */}
                {dropdown(
                    'tf',
                    timeframes.find((timeframe) => timeframe.id === intervalId)?.label ?? timeframes[0].label,
                    timeframes.map((timeframe) => ({
                        key: timeframe.id,
                        label: timeframe.label,
                        onClick: () => {
                            setIntervalId(timeframe.id);
                            setMenu(null);
                        },
                        active: intervalId === timeframe.id,
                    })),
                    undefined,
                    'chart-tf-pick keep-mobile',
                )}
                {/* One field over every drawing, indicator, chart type and formula function. */}
                <div className="relative keep-mobile">
                    <button
                        type="button"
                        onClick={() => setMenu((current) => (current === 'tools' ? null : 'tools'))}
                        aria-expanded={menu === 'tools'}
                        className={cn('pill h-7 gap-1.5 px-2.5 text-[12px]', menu === 'tools' && 'is-up')}
                        title={t('tools.palette')}
                    >
                        <Search className="size-3.5" /> {t('tools.palette')}
                    </button>
                    {menu === 'tools' && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
                            <ToolPalette lang={lang} onInsert={insertTool} onClose={() => setMenu(null)} />
                        </>
                    )}
                </div>
                <ChartStudiesMenu lang={lang} studies={studies} onChange={updateStudies} />
                {chartType === 'linebreak' && (
                    <label className="keep-mobile flex items-center gap-1 text-[11px] text-faint">
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
                {chartType === 'pnf' && (
                    <>
                        <label className="keep-mobile flex items-center gap-1 text-[11px] text-faint">
                            {t('chart.pnfBox')}
                            <input
                                type="number"
                                inputMode="decimal"
                                min={0.01}
                                step={0.01}
                                value={pnfBox ?? ''}
                                placeholder={t('chart.auto')}
                                onChange={(event) => {
                                    const next = Number(event.target.value);
                                    setPnfBox(Number.isFinite(next) && next > 0 ? next : undefined);
                                }}
                                className="num h-7 w-20 rounded-[7px] bg-page px-2 text-foreground shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </label>
                        <label className="keep-mobile flex items-center gap-1 text-[11px] text-faint">
                            {t('chart.pnfReversal')}
                            <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={10}
                                step={1}
                                value={pnfReversal ?? ''}
                                placeholder="3"
                                onChange={(event) => {
                                    const next = Number(event.target.value);
                                    setPnfReversal(Number.isFinite(next) && next >= 1 ? Math.floor(next) : undefined);
                                }}
                                className="num h-7 w-14 rounded-[7px] bg-page px-2 text-foreground shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </label>
                    </>
                )}
                {chartType === 'kagi' && (
                    <label className="keep-mobile flex items-center gap-1 text-[11px] text-faint">
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
                    <label className="keep-mobile flex items-center gap-1 text-[11px] text-faint">
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
                    undefined,
                    'keep-mobile',
                )}
                <span className="tool-divider" aria-hidden />
                {/* Volume is a layer you flip while reading, so it stays on the bar. */}
                <button
                    type="button"
                    onClick={() => setVolumeVisible((value) => !value)}
                    aria-pressed={volumeVisible}
                    aria-label={t('chart.volume')}
                    className={cn('pill h-7 px-2.5 text-[12px]', volumeVisible && 'is-up')}
                    title={t('chart.volume')}
                >
                    <BarChart3 className="size-3.5" />
                </button>
                {/* Replay and compare are modes you flip, not labels you read: the glyph carries them
                    and the tooltip names them, so the bar keeps its width for the things it explains. */}
                <button
                    type="button"
                    onClick={() => (replay ? exitReplay() : startReplay())}
                    aria-pressed={replay}
                    aria-label={t('replay.open')}
                    className={cn('pill h-7 px-2 text-[12px]', replay && 'is-up')}
                    title={t('replay.title')}
                >
                    <History className="size-3.5" />
                </button>
                {!replay && (
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setCompareOpen((value) => !value)}
                        aria-expanded={compareOpen}
                        aria-label={t('chart.compare')}
                        className={cn('pill h-7 px-2 text-[12px] gap-1', compareList.length > 0 && 'is-up')}
                        title={t('chart.compare')}
                    >
                        <GitCompare className="size-3.5" />
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
                {/* Whole-chart templates: every drawing and study, saved once and stamped anywhere. It
                    lives on the always-visible bar, not the contextual drawing bar, because saving a
                    setup must not require selecting a shape first. */}
                {!replay && (
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setMenu((current) => (current === 'layout' ? null : 'layout'))}
                        aria-expanded={menu === 'layout'}
                        aria-label={t('chart.layout')}
                        title={t('chart.layout')}
                        className={cn('pill h-7 px-2 text-[12px] gap-1', menu === 'layout' && 'is-up')}
                    >
                        <LayoutTemplate className="size-3.5" />
                    </button>
                    {menu === 'layout' && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
                            <div className="chart-layout-menu absolute end-0 z-30 mt-1 flex w-72 flex-col gap-1.5 rounded-[12px] bg-card p-2 shadow-[0_0_0_1px_var(--line),0_16px_40px_oklch(0_0_0/0.5)]">
                                <p className="px-1 text-[11.5px] text-faint">{t('chart.layoutHint')}</p>
                                {chartTemplates.length === 0 && <p className="px-1 py-1 text-[12px] text-faint">{t('chart.layoutEmpty')}</p>}
                                {chartTemplates.map((template) => {
                                    const counts = chartTemplateCounts(template);
                                    return (
                                        <div key={template.id} className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => { applyChartTemplate(template); setMenu(null); }}
                                                className="pill h-7 min-w-0 flex-1 gap-2 px-2 text-[12px]"
                                            >
                                                <LayoutTemplate className="size-3.5 shrink-0 text-faint" />
                                                <span className="truncate">{template.name}</span>
                                                <span className="num ms-auto shrink-0 text-[10.5px] text-faint">
                                                    {arDigits(counts.drawings, lang)} · {arDigits(counts.studies, lang)}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = removeChartTemplate(chartTemplates, template.id);
                                                    setChartTemplates(next);
                                                    saveChartTemplates(next);
                                                }}
                                                aria-label={`${t('chart.layoutDelete')} ${template.name}`}
                                                title={t('chart.layoutDelete')}
                                                className="icon-btn is-danger"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </div>
                                    );
                                })}
                                <div className="mt-1 flex gap-1.5 border-t border-white/5 pt-2">
                                    <input
                                        value={chartTemplateName}
                                        onChange={(event) => setChartTemplateName(event.target.value)}
                                        placeholder={t('chart.layoutName')}
                                        maxLength={40}
                                        dir="auto"
                                        className="h-7 min-w-0 flex-1 rounded-full bg-page px-2.5 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                    <button
                                        type="button"
                                        onClick={saveChartTemplate}
                                        disabled={!chartTemplateName.trim() || (drawings.length === 0 && studies.length === 0)}
                                        className="pill h-7 px-2.5 text-[12px] is-up disabled:opacity-50"
                                    >
                                        {t('chart.layoutSave')}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
                )}
                {/* The far edge: settings, then the actions that take something out of the chart. The
                    spacer is a spacer, not an auto margin: the bar is forced LTR inside an RTL page,
                    and a logical auto margin lands on the wrong side of the gear. */}
                <span className="chart-toolbar-spacer" aria-hidden />
                <ChartSettingsMenu
                    lang={lang}
                    timeZone={timeZone}
                    scaleMode={scaleMode}
                    invert={invertScale}
                    sessionBreaks={sessionBreaks}
                    paletteState={paletteState}
                    palette={effectivePalette}
                    onTimeZone={setTimeZone}
                    onScaleMode={setScaleMode}
                    onInvert={setInvertScale}
                    onSessionBreaks={setSessionBreaks}
                    onPalette={setPaletteState}
                    onGoToDate={(time) => candleHostRef.current?.goToTime(time)}
                />
                <span className="tool-divider" aria-hidden />
                <button
                    type="button"
                    onClick={() => void shareChart()}
                    className="icon-btn"
                    aria-label={t('chart.share')}
                    title={t('chart.share')}
                >
                    <Share2 />
                </button>
                {/* Fill: the colour and the strength, for the shapes that enclose an area. */}
                {selectedDrawing && hasFill(selectedDrawing.tool) && (
                    <>
                        <div role="group" aria-label={t('chart.tool.fill')} className="flex items-center gap-0.5">
                            {COLOR_KEYS.map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => restyleDrawing({ fill: key, customFill: undefined })}
                                    aria-pressed={(selectedDrawing.fill ?? selectedDrawing.color) === key}
                                    aria-label={`${t('chart.tool.fill')} ${key}`}
                                    title={`${t('chart.tool.fill')} ${key}`}
                                    className={cn(
                                        'size-4 rounded-[4px] border border-white/25 transition-transform hover:scale-110',
                                        (selectedDrawing.fill ?? selectedDrawing.color) === key && 'ring-2 ring-brand',
                                    )}
                                    style={{ background: DRAWING_COLORS[key] }}
                                />
                            ))}
                        </div>
                        <label className="flex items-center gap-1 text-[11px] text-faint">
                            {t('chart.fillOpacity')}
                            <select
                                value={selectedDrawing.fillOpacity ?? fillOf(selectedDrawing).opacity}
                                onChange={(event) => restyleDrawing({ fillOpacity: Number(event.target.value) })}
                                aria-label={t('chart.fillOpacity')}
                                className="h-7 rounded-[7px] bg-page px-1.5 text-[11px] text-foreground shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {FILL_OPACITIES.map((step) => (
                                    <option key={step} value={step}>{arDigits(step, lang)}%</option>
                                ))}
                            </select>
                        </label>
                    </>
                )}
                {/* One chart-level action that must not hide with the contextual drawing bar: an alert.
                    The keyboard sheet is still ⌘/ and in the help menu, so the bar spends the pixel here. */}
                {alertSource(symbol) ? (
                    <CreateAlertModal
                        symbol={symbol}
                        currentPrice={alertPrice}
                        currency={data?.currency ?? 'USD'}
                        lang={lang}
                    >
                        <button
                            type="button"
                            className={cn('icon-btn', selectedLevel != null && 'is-up')}
                            aria-label={t('chart.alert')}
                            title={t('chart.alert')}
                        >
                            <Bell />
                        </button>
                    </CreateAlertModal>
                ) : (
                    <button
                        type="button"
                        onClick={() => setShortcutsOpen(true)}
                        className="icon-btn chart-toolbar-optional"
                        aria-label={t('chart.shortcuts.title')}
                        title={t('chart.shortcuts.title')}
                    >
                        <Keyboard />
                    </button>
                )}
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
                {/* Only a phone sees this: one row until the trader asks for the rest. */}
                <ChartToolbarMore lang={lang} open={toolbarMore} onToggle={() => setToolbarMore((value) => !value)} />
            </div>

            {/* The drawing toolkit is off in replay: a note drawn on a later turn would give the future away.
                It is also contextual: with nothing selected and no tool armed the chart keeps one row of
                chrome, and the bar returns the moment there is something to style. */}
            {!replay && (toolbarMore || selectedId !== null || (tool !== null && tool !== 'select')) && (
            <div className="chart-toolbar chart-toolbar-edit is-open">
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
                    <div className="flex items-center gap-1">
                        {tool === 'image' && noteText.startsWith('data:image') ? (
                            <span className="flex h-7 items-center gap-1.5 rounded-full bg-page px-2 text-[11px] shadow-[inset_0_0_0_1px_var(--line)]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={noteText} alt="" className="size-5 rounded-[4px] object-cover" />
                                <button
                                    type="button"
                                    onClick={() => setNoteText('')}
                                    aria-label={t('chart.imageRemove')}
                                    title={t('chart.imageRemove')}
                                    className="text-faint hover:text-foreground"
                                >
                                    <X className="size-3" />
                                </button>
                            </span>
                        ) : (
                            <input
                                value={noteText}
                                onChange={(event) => setNoteText(event.target.value)}
                                placeholder={t(tool === 'image' ? 'chart.imagePlaceholder' : 'chart.notePlaceholder')}
                                maxLength={tool === 'image' ? 300 : 80}
                                className="h-7 w-40 rounded-full bg-page px-3 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
                                dir="auto"
                            />
                        )}
                        {tool === 'image' && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => imageFileRef.current?.click()}
                                    className="icon-btn"
                                    aria-label={t('chart.imageUpload')}
                                    title={t('chart.imageUpload')}
                                >
                                    <Upload className="size-3.5" />
                                </button>
                                <input
                                    ref={imageFileRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    className="hidden"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        event.target.value = '';
                                        if (!file) return;
                                        if (file.size > 300_000) {
                                            toast.error(t('chart.imageTooLarge'));
                                            return;
                                        }
                                        const reader = new FileReader();
                                        reader.onload = () => {
                                            const result = typeof reader.result === 'string' ? reader.result : '';
                                            if (!result || result.length > IMAGE_DATA_MAX) {
                                                toast.error(t('chart.imageTooLarge'));
                                                return;
                                            }
                                            setNoteText(result);
                                        };
                                        reader.readAsDataURL(file);
                                    }}
                                />
                            </>
                        )}
                    </div>
                )}
                {/* The stroke palette: the eight colours the drawings ship with, one click each. */}
                <div role="group" aria-label={t('chart.tool.color')} className="flex items-center gap-0.5">
                    {COLOR_KEYS.map((key) => {
                        const active = selectedDrawing ? drawingColor(selectedDrawing) === DRAWING_COLORS[key].toLowerCase() : false;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => restyleDrawing({ color: key, customColor: undefined })}
                                disabled={!selectedId}
                                aria-pressed={active}
                                aria-label={`${t('chart.tool.color')} ${key}`}
                                title={`${t('chart.tool.color')} ${key}`}
                                className={cn(
                                    'size-4 rounded-[4px] border border-white/25 transition-transform hover:scale-110 disabled:opacity-40',
                                    active && 'ring-2 ring-brand',
                                )}
                                style={{ background: DRAWING_COLORS[key] }}
                            />
                        );
                    })}
                </div>
                {/* Any colour, not just the palette: a chart palette (black, grey, a broker's teal). */}
                <label
                    className={cn('relative size-6 cursor-pointer rounded-[6px] border border-white/25', !selectedId && 'opacity-50')}
                    title={t('chart.color.custom')}
                >
                    <span className="sr-only">{t('chart.color.custom')}</span>
                    <span
                        aria-hidden
                        className="absolute inset-0 rounded-[5px]"
                        style={{ background: selectedDrawing ? drawingColor(selectedDrawing) : 'transparent' }}
                    />
                    <input
                        type="color"
                        value={selectedDrawing ? drawingColor(selectedDrawing) : '#2962ff'}
                        disabled={!selectedId}
                        onChange={(event) => restyleDrawing({ customColor: event.target.value })}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                    />
                </label>
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
                        <div role="group" aria-label={t('chart.text.color')} className="flex items-center gap-0.5">
                            {COLOR_KEYS.map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => restyleDrawing({ textColor: key, customTextColor: undefined })}
                                    aria-pressed={textColorOf(selectedDrawing) === key}
                                    aria-label={`${t('chart.text.color')} ${key}`}
                                    title={`${t('chart.text.color')} ${key}`}
                                    className={cn(
                                        'size-4 rounded-[4px] border border-white/25 transition-transform hover:scale-110',
                                        textColorOf(selectedDrawing) === key && 'ring-2 ring-brand',
                                    )}
                                    style={{ background: DRAWING_COLORS[key] }}
                                />
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => restyleDrawing({ background: !selectedDrawing.background })}
                            aria-pressed={!!selectedDrawing.background}
                            aria-label={t('chart.text.background')}
                            title={t('chart.text.background')}
                            className={cn('icon-btn text-[12px]', selectedDrawing.background && 'text-brand')}
                        >
                            ▣
                        </button>
                        <button
                            type="button"
                            onClick={() => restyleDrawing({ italic: !selectedDrawing.italic })}
                            aria-pressed={!!selectedDrawing.italic}
                            aria-label={t('chart.text.italic')}
                            title={t('chart.text.italic')}
                            className={cn('icon-btn text-[13px] italic', selectedDrawing.italic && 'text-brand')}
                        >
                            I
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
                {/* Fibonacci levels: the classic set, unless the trader keeps their own. */}
                {selectedDrawing && hasFibLevels(selectedDrawing.tool) && (
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setMenu((current) => (current === 'fib' ? null : 'fib'))}
                            aria-expanded={menu === 'fib'}
                            className={cn('pill h-7 px-2.5 text-[12px] gap-1.5', menu === 'fib' && 'is-up')}
                        >
                            {t('chart.fibLevels')} <ChevronDown className="size-3" />
                        </button>
                        {menu === 'fib' && (
                            <>
                                <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
                                <div className="absolute end-0 z-30 mt-1 flex w-56 flex-col gap-1 rounded-[12px] bg-card p-2 shadow-[0_0_0_1px_var(--line),0_16px_40px_oklch(0_0_0/0.5)]">
                                    <p className="px-1 text-[11.5px] text-faint">{t('chart.fibLevelsHint')}</p>
                                    <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                                        {fibRatiosOf(selectedDrawing).map((ratio) => (
                                            <div key={ratio} className="flex items-center gap-1">
                                                <span className="num flex-1 px-1 text-[12.5px]">{arDigits(ratio, lang)}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const next = fibRatiosOf(selectedDrawing).filter((value) => value !== ratio);
                                                        restyleDrawing({ fibLevels: next.length ? [...next] : undefined });
                                                    }}
                                                    aria-label={`${t('chart.fibRemove')} ${ratio}`}
                                                    title={t('chart.fibRemove')}
                                                    className="icon-btn is-danger"
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-1 flex gap-1.5 border-t border-white/5 pt-2">
                                        <input
                                            value={levelDraft}
                                            onChange={(event) => setLevelDraft(event.target.value)}
                                            placeholder="0.75"
                                            inputMode="decimal"
                                            dir="ltr"
                                            className="num h-7 min-w-0 flex-1 rounded-full bg-page px-2.5 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const value = Number(levelDraft);
                                                if (!Number.isFinite(value) || value < -10 || value > 10) return;
                                                const next = [...new Set([...fibRatiosOf(selectedDrawing), value])].sort((a, b) => a - b);
                                                restyleDrawing({ fibLevels: next.slice(0, MAX_FIB_LEVELS) });
                                                setLevelDraft('');
                                            }}
                                            disabled={!levelDraft.trim()}
                                            className="pill h-7 px-2.5 text-[12px] is-up disabled:opacity-50"
                                        >
                                            {t('chart.fibAdd')}
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => restyleDrawing({ fibLevels: undefined })}
                                        className="pill h-7 px-2.5 text-[12px]"
                                    >
                                        {t('chart.fibReset')}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
                {/* Where a drawing is allowed to appear: everywhere (default), or the intervals picked. */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setMenu((current) => (current === 'visibility' ? null : 'visibility'))}
                        aria-expanded={menu === 'visibility'}
                        disabled={!selectedId}
                        className={cn('pill h-7 px-2.5 text-[12px] gap-1.5', menu === 'visibility' && 'is-up', !selectedId && 'opacity-50')}
                    >
                        <Eye className="size-3.5" /> {t('chart.visibility')} <ChevronDown className="size-3" />
                    </button>
                    {menu === 'visibility' && selectedDrawing && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
                            <div className="absolute end-0 z-30 mt-1 flex w-44 flex-col gap-0.5 rounded-[12px] bg-card p-1.5 shadow-[0_0_0_1px_var(--line),0_16px_40px_oklch(0_0_0/0.5)]">
                                <button
                                    type="button"
                                    onClick={() => { restyleDrawing({ timeframes: [] }); }}
                                    className={cn('flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-start text-[12.5px] font-semibold hover:bg-hover', !selectedDrawing.timeframes?.length && 'text-brand-ink')}
                                >
                                    {t('chart.visibilityAll')}
                                </button>
                                {CANDLE_INTERVALS.map((interval) => {
                                    const on = !!selectedDrawing.timeframes?.includes(interval.id);
                                    return (
                                        <button
                                            key={interval.id}
                                            type="button"
                                            onClick={() => {
                                                const current = selectedDrawing.timeframes ?? [];
                                                const next = on ? current.filter((id) => id !== interval.id) : [...current, interval.id];
                                                restyleDrawing({ timeframes: next });
                                            }}
                                            aria-pressed={on}
                                            className={cn('flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-start text-[12.5px] font-semibold hover:bg-hover', on && 'text-brand-ink')}
                                        >
                                            <span className="flex-1">{interval.id}</span>
                                            {on && <span className="text-[11px]">●</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
                {/* Named strokes: save the one on screen, then put it on anything. */}
                <div className="relative ms-auto">
                    <button
                        type="button"
                        onClick={() => setMenu((current) => (current === 'templates' ? null : 'templates'))}
                        aria-expanded={menu === 'templates'}
                        className={cn('pill h-7 px-2.5 text-[12px] gap-1.5', menu === 'templates' && 'is-up')}
                    >
                        <Bookmark className="size-3.5" /> {t('chart.templates')} <ChevronDown className="size-3" />
                    </button>
                    {menu === 'templates' && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
                            <div className="absolute end-0 z-30 mt-1 flex w-64 flex-col gap-1.5 rounded-[12px] bg-card p-2 shadow-[0_0_0_1px_var(--line),0_16px_40px_oklch(0_0_0/0.5)]">
                                <p className="px-1 text-[11.5px] text-faint">{t('chart.templatesHint')}</p>
                                {templates.length === 0 && <p className="px-1 py-1 text-[12px] text-faint">{t('chart.templatesEmpty')}</p>}
                                {templates.map((template) => (
                                    <div key={template.id} className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => { applyTemplate(template.style); setMenu(null); }}
                                            className="pill h-7 flex-1 gap-2 px-2 text-[12px]"
                                        >
                                            <span
                                                aria-hidden
                                                className="size-3 shrink-0 rounded-full"
                                                style={{ background: template.style.color ? `var(--${template.style.color})` : 'currentColor' }}
                                            />
                                            <span className="truncate">{template.name}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const next = removeTemplate(templates, template.id);
                                                setTemplates(next);
                                                saveTemplates(next);
                                            }}
                                            aria-label={`${t('chart.templateDelete')} ${template.name}`}
                                            title={t('chart.templateDelete')}
                                            className="icon-btn is-danger"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                ))}
                                <div className="mt-1 flex gap-1.5 border-t border-white/5 pt-2">
                                    <input
                                        value={templateName}
                                        onChange={(event) => setTemplateName(event.target.value)}
                                        placeholder={t('chart.templateName')}
                                        maxLength={24}
                                        dir="auto"
                                        className="h-7 min-w-0 flex-1 rounded-full bg-page px-2.5 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const source = selectedDrawing
                                                ? styleOfDrawing(selectedDrawing)
                                                : selectedTool
                                                  ? styleFor(selectedTool, drawingStyles)
                                                  : {};
                                            const next = addTemplate(templates, templateName, source);
                                            if (next !== templates) {
                                                setTemplates(next);
                                                saveTemplates(next);
                                                setTemplateName('');
                                            }
                                        }}
                                        disabled={!templateName.trim()}
                                        className="pill h-7 px-2.5 text-[12px] is-up disabled:opacity-50"
                                    >
                                        {t('chart.templateSave')}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
                {/* Porting a setup: the drawings travel as JSON, out and back in. */}
                <div className="relative">
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

            {/* A scroll anchor for the replay panel; out of the flow (and its gap) the rest of the time. */}
            <div ref={replayPanelRef} className={replay ? undefined : 'hidden'} />
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
                    ghost={ghost}
                    onToggleGhost={() => setGhost((value) => !value)}
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
                <div className="rounded-[10px] bg-page/60">
                    {/* Folded by default: the list is a reference, and 100px of it above the candles
                        costs more than it gives. The strip still names what is on the chart. */}
                    <button
                        type="button"
                        onClick={() => setListOpen((value) => !value)}
                        aria-expanded={listOpen}
                        className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1 text-[11px] font-semibold text-faint hover:bg-hover/40"
                    >
                        <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', !listOpen && '-rotate-90')} />
                        <span className="shrink-0">{t('chart.list')} · {arDigits(drawings.length, lang)}</span>
                        {!listOpen && (
                            <span className="truncate text-[11px] font-normal text-faint">
                                {drawings.map((drawing) => toolLabel(drawing)).join(' · ')}
                            </span>
                        )}
                    </button>
                    {listOpen && (
                <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto px-1 pb-1">
                    {drawings.length > 1 && (
                        <div className="flex items-center gap-2 px-2 pb-0.5">
                            <p className="flex-1 text-[10.5px] text-faint">{t('chart.multiHint')}</p>
                            {selectedIds.length > 0 && (
                                <>
                                    <button
                                        type="button"
                                        onClick={toggleHiddenSelected}
                                        className="text-[10.5px] font-semibold text-faint hover:text-foreground"
                                    >
                                        {t('chart.hide')} · {arDigits(selectedIds.length, lang)}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={toggleLockSelected}
                                        className="text-[10.5px] font-semibold text-faint hover:text-foreground"
                                    >
                                        {t('chart.tool.lock')} · {arDigits(selectedIds.length, lang)}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                    {drawings.map((drawing) => (
                        <div
                            key={drawing.id}
                            className={cn('flex items-center gap-2 rounded-[8px] px-2 py-1 text-[12.5px]', selectedIds.includes(drawing.id) && 'bg-hover')}
                        >
                            <button
                                type="button"
                                onClick={() => cycleColor(drawing.id)}
                                title={t('chart.color')}
                                aria-label={`${t('chart.color')}: ${drawingColor(drawing)}`}
                                className="size-4 shrink-0 rounded-full border border-line-strong"
                                style={{ backgroundColor: drawingColor(drawing) }}
                            />
                            <button
                                type="button"
                                onClick={(event) => {
                                    // Shift (or a command key) adds to the selection, the same rule the
                                    // chart itself follows, so the list and the canvas agree.
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
                                className="flex flex-1 items-center gap-2 text-start"
                            >
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
                </div>
            )}

            {!replay && (
                <p role="status" className={cn('px-1 text-[11px] text-faint', syncState === 'saved' && 'sr-only')}>
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
            <div className={cn(expanded && 'fixed inset-3 z-50 rounded-[14px] bg-card p-3 shadow-[0_0_0_4px_var(--frame),0_24px_60px_oklch(0_0_0/0.6)]', fill && !expanded && 'flex min-h-0 flex-1 flex-col')}>
                {body}
            </div>

            {/* A pane that owns the whole screen spends its pixels on the chart, not on footnotes. */}
            <p className={cn('text-[12px] text-faint', fill && 'hidden')}>{t(replay ? 'replay.noFuture' : 'chart.drawingHint')}</p>
            <p className={cn('text-[12px] text-faint', fill && 'hidden')}>
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

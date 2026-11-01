'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    CandlestickSeries,
    HistogramSeries,
    LineSeries,
    createChart,
    type IChartApi,
    type ISeriesApi,
    type UTCTimestamp,
} from 'lightweight-charts';
import {
    ChevronDown,
    Download,
    Eraser,
    ExternalLink,
    Loader2,
    Maximize2,
    Minimize2,
    MousePointer2,
    Pencil,
    RefreshCw,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import ChartDrawings, { type ActiveTool } from '@/components/stocks/ChartDrawings';
import { getYahooCandles } from '@/lib/actions/yahoo-candles.actions';
import { CANDLE_INTERVALS, DEFAULT_CANDLE_INTERVAL, type CandleSet } from '@/lib/yahoo-candles';
import { ema, macd, rsi, sma, type Series } from '@/lib/indicators';
import {
    COUNT_GLYPHS,
    COUNT_OPTIONS,
    COUNT_TOOL,
    buildTransferPayload,
    drawingColor,
    isColorKey,
    loadDrawings,
    mergeDrawings,
    nearestTime,
    nextColor,
    parseTransferPayload,
    saveDrawings,
    toolDef,
    withPoint,
    withText,
    type CountDegree,
    type CountKind,
    type Drawing,
    type DrawPoint,
    type ScreenPoint,
    type ShapeTool,
} from '@/lib/chart-drawings';
import { cn, tradingViewSymbolUrl } from '@/lib/utils';
import { AUTO_SENSITIVITIES, autoCount, type AutoSensitivity } from '@/lib/auto-count';
import { tx, type Lang, type StringKey } from '@/lib/i18n';

type Indicator = 'sma' | 'ema' | 'rsi' | 'macd';
type MenuId = 'lines' | 'patterns' | 'elliott' | 'counts' | 'cycles' | 'transfer';

/** A row of a dropdown. */
type MenuItem = { key: string; label: string; onClick: () => void; active?: boolean };

const INDICATORS: { id: Indicator; label: StringKey }[] = [
    { id: 'sma', label: 'chart.ind.sma' },
    { id: 'ema', label: 'chart.ind.ema' },
    { id: 'rsi', label: 'chart.ind.rsi' },
    { id: 'macd', label: 'chart.ind.macd' },
];

const TOOL_KEYS: Record<ShapeTool, StringKey> = {
    trend: 'chart.tool.trend',
    horizontal: 'chart.tool.horizontal',
    rectangle: 'chart.tool.rectangle',
    fib: 'chart.tool.fib',
    gann: 'chart.tool.gann',
    text: 'chart.tool.text',
    xabcd: 'chart.pat.xabcd',
    cypher: 'chart.pat.cypher',
    hs: 'chart.pat.hs',
    abcd: 'chart.pat.abcd',
    triangle: 'chart.pat.triangle',
    drives3: 'chart.pat.drives3',
    'ew-impulse': 'chart.pat.ewImpulse',
    'ew-abc': 'chart.pat.ewAbc',
    'ew-triangle': 'chart.pat.ewTriangle',
    'ew-double': 'chart.pat.ewDouble',
    'ew-triple': 'chart.pat.ewTriple',
    'ew-count': 'chart.count.impulse',
    'ew-count-abc': 'chart.count.correction',
    cycles: 'chart.pat.cycles',
    sine: 'chart.pat.sine',
};

const TIMEFRAME_KEYS: Record<string, StringKey> = {
    '1m': 'chart.tf.1m',
    '5m': 'chart.tf.5m',
    '15m': 'chart.tf.15m',
    '60m': 'chart.tf.60m',
    '1d': 'chart.tf.1d',
    '1wk': 'chart.tf.1wk',
};

// The app's design tokens are authored in oklch()/lab(), which lightweight-charts' own colour parser
// rejects. Rather than hard-coding a second palette, the browser is asked to rasterise each token and
// the resulting channels are handed back as rgba(), so the chart still follows the theme.
const toRgba = (css: string, fallback: string, alpha?: number): string => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback;
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0 && alpha == null) return fallback;
    return `rgba(${r}, ${g}, ${b}, ${alpha ?? Number((a / 255).toFixed(3))})`;
};

const token = (name: string, fallback: string, alpha?: number) => {
    if (typeof window === 'undefined') return fallback;
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return raw ? toRgba(raw, fallback, alpha) : fallback;
};

const line = (series: Series, candles: CandleSet['candles']) =>
    candles.flatMap((candle, i) => {
        const value = series[i];
        return value == null ? [] : [{ time: candle.time as UTCTimestamp, value }];
    });

type Props = {
    /** The app symbol, e.g. 2222.SR, 0700.HK. */
    symbol: string;
    /** The TradingView symbol, for the "open on TradingView" escape hatch. */
    tvSymbol: string;
    lang: Lang;
};

/**
 * A chart for exchanges TradingView will not embed. Candles come from Yahoo (the same free source the
 * Saudi quotes use), the indicators are computed here, and the drawings are kept in this browser.
 * Nothing about it depends on a paid provider or an API key.
 */
export default function YahooChart({ symbol, tvSymbol, lang }: Props) {
    const t = useCallback((key: StringKey) => tx(lang, key), [lang]);

    const hostRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const [intervalId, setIntervalId] = useState<string>(DEFAULT_CANDLE_INTERVAL);
    const [data, setData] = useState<CandleSet | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [on, setOn] = useState<Record<Indicator, boolean>>({ sma: false, ema: false, rsi: false, macd: false });
    const [tool, setTool] = useState<ActiveTool | null>(null);
    const [pendingLabels, setPendingLabels] = useState<string[] | null>(null);
    const [noteText, setNoteText] = useState('');
    const [drawings, setDrawings] = useState<Drawing[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
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

    // Drawings belong to the symbol, not to the session: switching symbols starts from that symbol's set.
    useEffect(() => {
        setDrawings(loadDrawings(symbol));
        setSelectedId(null);
        setTool(null);
        setPendingLabels(null);
        setEditRequest(null);
        setTransfer(null);
    }, [symbol]);

    const saved = useRef(false);
    useEffect(() => {
        if (!saved.current) {
            saved.current = true;
            return;
        }
        saveDrawings(symbol, drawings);
    }, [symbol, drawings]);

    const barTimes = useMemo(() => data?.candles.map((c) => c.time) ?? [], [data]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host || !data) return;

        const up = token('--up', '#4ade80');
        const down = token('--down', '#f87171');
        const grid = token('--line', '#1c2320');

        const chart = createChart(host, {
            autoSize: true,
            layout: {
                background: { color: 'transparent' },
                textColor: token('--faint', '#7d8a84'),
                attributionLogo: false,
                fontFamily: 'inherit',
            },
            grid: { vertLines: { color: grid }, horzLines: { color: grid } },
            rightPriceScale: { borderColor: grid },
            timeScale: {
                borderColor: grid,
                timeVisible: intervalId !== '1d' && intervalId !== '1wk',
                secondsVisible: false,
            },
            localization: { locale: 'en-US' },
        });

        const candles = chart.addSeries(CandlestickSeries, {
            upColor: up,
            downColor: down,
            wickUpColor: up,
            wickDownColor: down,
            borderVisible: false,
        });
        candles.setData(
            data.candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
        );

        const upFill = token('--up', '#4ade80', 0.4);
        const downFill = token('--down', '#f87171', 0.4);
        const volume = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
            priceLineVisible: false,
            lastValueVisible: false,
        });
        volume.setData(
            data.candles.map((c) => ({
                time: c.time as UTCTimestamp,
                value: c.volume,
                color: c.close >= c.open ? upFill : downFill,
            })),
        );
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

        const closes = data.candles.map((c) => c.close);
        if (on.sma) candlesAdd(chart, line(sma(closes, 20), data.candles), token('--brand', '#34d399'));
        if (on.ema) candlesAdd(chart, line(ema(closes, 50), data.candles), token('--muted-foreground', '#94a3b8'));

        // Oscillators get their own pane under the price, the way a trader expects to read them.
        const oscillators = Number(on.rsi) + Number(on.macd);
        if (on.rsi) {
            const index = addPane(chart, oscillators > 1 ? 0.2 : 0.28);
            const series = chart.addSeries(LineSeries, { color: token('--brand', '#34d399'), lineWidth: 1, priceLineVisible: false }, index);
            series.setData(line(rsi(closes, 14), data.candles));
        }
        if (on.macd) {
            const index = addPane(chart, oscillators > 1 ? 0.2 : 0.28);
            const { macd: macdLine, signal, histogram } = macd(closes);
            const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, index);
            // The palette is read once per render, not per bar: each lookup rasterises the token.
            const macdUp = token('--up', '#4ade80');
            const macdDown = token('--down', '#f87171');
            hist.setData(
                data.candles.flatMap((c, i) => {
                    const value = histogram[i];
                    return value == null ? [] : [{ time: c.time as UTCTimestamp, value, color: value >= 0 ? macdUp : macdDown }];
                }),
            );
            chart.addSeries(LineSeries, { color: token('--brand', '#34d399'), lineWidth: 1, priceLineVisible: false }, index).setData(line(macdLine, data.candles));
            chart.addSeries(LineSeries, { color: token('--muted-foreground', '#94a3b8'), lineWidth: 1, priceLineVisible: false }, index).setData(line(signal, data.candles));
        }

        chart.timeScale().fitContent();
        chartRef.current = chart;
        seriesRef.current = candles;

        // v5 returns void from subscribe*, so the handler is kept and handed back for the cleanup.
        const onRangeChange = () => setFrame((frame) => frame + 1);
        chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);

        return () => {
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, [data, on, intervalId]);

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

    const startTool = (next: ActiveTool | null, labels: string[] | null = null) => {
        setMenu(null);
        setSelectedId(null);
        setPendingLabels(labels);
        setTool((current) => (current === next && !labels ? null : next));
    };

    const commit = (drawing: Drawing) => setDrawings((list) => [...list, drawing]);

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

    const moveHandle = (id: string, index: number, point: DrawPoint) =>
        setDrawings((list) => list.map((d) => (d.id === id ? withPoint(d, index, point) : d)));
    const editText = (id: string, text: string) =>
        setDrawings((list) => list.map((d) => (d.id === id ? withText(d, text) : d)));
    const cycleColor = (id: string) =>
        setDrawings((list) =>
            list.map((d) => (d.id === id ? { ...d, color: nextColor(isColorKey(d.color) ? d.color : toolDef(d.tool).defaultColor) } : d)),
        );
    const removeDrawing = (id: string) => {
        setDrawings((list) => list.filter((d) => d.id !== id));
        setSelectedId((current) => (current === id ? null : current));
    };
    const clearAll = () => {
        setDrawings([]);
        setSelectedId(null);
    };

    const summary = (drawing: Drawing) => {
        const prices = drawing.points.map((point) => point.price.toFixed(2));
        if (drawing.tool === 'text') return drawing.text ?? '';
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
        () => CANDLE_INTERVALS.map((i) => ({ id: i.id as string, label: t(TIMEFRAME_KEYS[i.id] ?? 'chart.tf.1d') })),
        [t],
    );

    const body = (
        // dir=ltr on the plotting area too: the labels drawn on the canvas overlay are SVG text
        // (Fibonacci ratios, notes), and in an RTL page "0.786" would otherwise reorder to "786.0".
        <div className={cn('relative', expanded ? 'size-full' : 'h-[420px]')} dir="ltr">
            <div ref={hostRef} className="size-full" />

            {status === 'ready' && (
                <ChartDrawings
                    drawings={drawings}
                    selectedId={selectedId}
                    tool={tool}
                    text={noteText}
                    labels={pendingLabels}
                    editRequest={editRequest}
                    barTimes={barTimes}
                    toScreen={toScreen}
                    fromScreen={fromScreen}
                    onCommit={commit}
                    onSelect={setSelectedId}
                    onMoveHandle={moveHandle}
                    onEditText={editText}
                    onToolConsumed={() => setTool(null)}
                    label={t}
                />
            )}

            {status === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-[13px] text-faint">
                    <Loader2 className="size-4 animate-spin" /> {t('chart.loading')}
                </div>
            )}

            {status === 'error' && (
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

    /** The same wording the manual count rows use, so the automatic rows read as the same feature. */
    const countLabel = ({ degree, kind }: { degree: CountDegree; kind: CountKind }) =>
        `${t(COUNT_TOOL[kind] === 'ew-count' ? 'chart.count.impulse' : 'chart.count.correction')} · ${t(
            (`chart.count.degree${degree[0].toUpperCase()}${degree.slice(1)}`) as StringKey,
        )}`;

    const hasCandles = (data?.candles.length ?? 0) > 0;

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
            <div className="flex flex-wrap items-center gap-1.5" dir="ltr">
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
                {INDICATORS.map((indicator) => (
                    <button
                        key={indicator.id}
                        type="button"
                        onClick={() => setOn((state) => ({ ...state, [indicator.id]: !state[indicator.id] }))}
                        className={cn('pill h-7 px-2.5 text-[12px]', on[indicator.id] && 'is-up')}
                        aria-pressed={on[indicator.id]}
                    >
                        {t(indicator.label)}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    className="icon-btn ms-auto"
                    aria-label={t(expanded ? 'chart.exitFullscreen' : 'chart.fullscreen')}
                    title={t(expanded ? 'chart.exitFullscreen' : 'chart.fullscreen')}
                >
                    {expanded ? <Minimize2 /> : <Maximize2 />}
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => startTool('select')}
                    className={cn('pill h-7 px-2.5 text-[12px] gap-1.5', tool === 'select' && 'is-up')}
                    aria-pressed={tool === 'select'}
                    title={t('chart.tool.select')}
                >
                    <MousePointer2 className="size-3.5" /> {t('chart.tool.select')}
                </button>
                {dropdown(
                    'lines',
                    t('chart.group.lines'),
                    (['trend', 'horizontal', 'rectangle', 'fib', 'gann'] as ShapeTool[]).map((id) => ({
                        key: id,
                        label: t(TOOL_KEYS[id]),
                        onClick: () => startTool(id),
                        active: tool === id,
                    })),
                )}
                {dropdown(
                    'patterns',
                    t('chart.group.patterns'),
                    (['xabcd', 'cypher', 'hs', 'abcd', 'triangle', 'drives3'] as ShapeTool[]).map((id) => ({
                        key: id,
                        label: t(TOOL_KEYS[id]),
                        onClick: () => startTool(id),
                        active: tool === id,
                    })),
                )}
                {dropdown(
                    'elliott',
                    t('chart.group.elliott'),
                    (['ew-impulse', 'ew-abc', 'ew-triangle', 'ew-double', 'ew-triple'] as ShapeTool[]).map((id) => ({
                        key: id,
                        label: t(TOOL_KEYS[id]),
                        onClick: () => startTool(id),
                        active: tool === id,
                    })),
                )}
                {dropdown(
                    'counts',
                    t('chart.group.counts'),
                    COUNT_OPTIONS.map(({ degree, kind }) => ({
                        key: `${degree}-${kind}`,
                        label: countLabel({ degree, kind }),
                        onClick: () => {
                            setCountChoice({ degree, kind });
                            startTool(COUNT_TOOL[kind], COUNT_GLYPHS[degree][kind]);
                        },
                        active: tool === COUNT_TOOL[kind] && pendingLabels === COUNT_GLYPHS[degree][kind],
                    })),
                    <div key="auto" className="mt-1 border-t border-line pt-1.5">
                        <p className="px-2 pb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-faint">
                            {t('chart.count.auto')} · {countLabel(countChoice)}
                        </p>
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
                    </div>,
                )}
                {dropdown(
                    'cycles',
                    t('chart.group.cycles'),
                    (['cycles', 'sine'] as ShapeTool[]).map((id) => ({
                        key: id,
                        label: t(TOOL_KEYS[id]),
                        onClick: () => startTool(id),
                        active: tool === id,
                    })),
                )}
                <button
                    type="button"
                    onClick={() => startTool('text')}
                    className={cn('pill h-7 px-2.5 text-[12px]', tool === 'text' && 'is-up')}
                    aria-pressed={tool === 'text'}
                >
                    {t('chart.tool.text')}
                </button>
                {tool === 'text' && (
                    <input
                        value={noteText}
                        onChange={(event) => setNoteText(event.target.value)}
                        placeholder={t('chart.notePlaceholder')}
                        maxLength={80}
                        className="h-7 w-40 rounded-full bg-page px-3 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
                        dir="auto"
                    />
                )}
                <span className="mx-1 h-4 w-px bg-line" />
                <button
                    type="button"
                    onClick={() => removeDrawing(selectedId ?? '')}
                    disabled={!selectedId}
                    className="icon-btn is-danger"
                    title={t('chart.tool.delete')}
                    aria-label={t('chart.tool.delete')}
                >
                    <Trash2 />
                </button>
                <button
                    type="button"
                    onClick={clearAll}
                    disabled={drawings.length === 0}
                    className="icon-btn"
                    title={t('chart.tool.clear')}
                    aria-label={t('chart.tool.clear')}
                >
                    <Eraser />
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

            {drawings.length > 0 && (
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
                            {drawing.tool === 'text' && (
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

            {expanded && <div className="fixed inset-0 z-40 bg-page/70 backdrop-blur-[3px]" onClick={() => setExpanded(false)} />}
            <div className={cn(expanded && 'fixed inset-3 z-50 rounded-[14px] bg-card p-3 shadow-[0_0_0_4px_var(--frame),0_24px_60px_oklch(0_0_0/0.6)]')}>
                {body}
            </div>

            <p className="text-[12px] text-faint">{t('chart.drawingHint')}</p>
            <p className="text-[12px] text-faint">
                <ExternalLink className="me-1 inline size-3.5" />
                <a href={tradingViewSymbolUrl(tvSymbol)} target="_blank" rel="noopener noreferrer" className="underline">
                    {t('stock.openTV')}
                </a>
            </p>
        </div>
    );
}

/** Adds a line series to the price pane (pane 0) — the SMA and EMA overlays. */
function candlesAdd(chart: IChartApi, points: { time: UTCTimestamp; value: number }[], color: string) {
    if (points.length === 0) return;
    chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }).setData(points);
}

/** Creates a pane under the price and returns its index, so an oscillator can be added to it. */
function addPane(chart: IChartApi, stretch: number): number {
    const pane = chart.addPane();
    pane.setStretchFactor(stretch);
    return chart.panes().indexOf(pane);
}

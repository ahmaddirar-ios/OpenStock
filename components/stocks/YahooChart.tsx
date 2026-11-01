'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    Eraser,
    ExternalLink,
    Loader2,
    Maximize2,
    Minimize2,
    MousePointer2,
    Minus,
    RefreshCw,
    Ruler,
    Square,
    TrendingUp,
    Trash2,
    Type,
} from 'lucide-react';
import ChartDrawings, { type ActiveTool } from '@/components/stocks/ChartDrawings';
import { getYahooCandles } from '@/lib/actions/yahoo-candles.actions';
import { CANDLE_INTERVALS, DEFAULT_CANDLE_INTERVAL, type CandleSet } from '@/lib/yahoo-candles';
import { ema, macd, rsi, sma, type Series } from '@/lib/indicators';
import { loadDrawings, nearestTime, saveDrawings, type Drawing, type DrawPoint, type ScreenPoint } from '@/lib/chart-drawings';
import { cn, tradingViewSymbolUrl } from '@/lib/utils';
import { tx, type Lang, type StringKey } from '@/lib/i18n';

type Indicator = 'sma' | 'ema' | 'rsi' | 'macd';

const INDICATORS: { id: Indicator; label: StringKey }[] = [
    { id: 'sma', label: 'chart.ind.sma' },
    { id: 'ema', label: 'chart.ind.ema' },
    { id: 'rsi', label: 'chart.ind.rsi' },
    { id: 'macd', label: 'chart.ind.macd' },
];

const TOOLS: { id: ActiveTool; label: StringKey; Icon: typeof Minus }[] = [
    { id: 'select', label: 'chart.tool.select', Icon: MousePointer2 },
    { id: 'trend', label: 'chart.tool.trend', Icon: TrendingUp },
    { id: 'horizontal', label: 'chart.tool.horizontal', Icon: Minus },
    { id: 'rectangle', label: 'chart.tool.rectangle', Icon: Square },
    { id: 'fib', label: 'chart.tool.fib', Icon: Ruler },
    { id: 'text', label: 'chart.tool.text', Icon: Type },
];

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
    // The bar times of the interval currently on screen, so a stored drawing can be snapped to them.
    const timesRef = useRef<number[]>([]);

    const [intervalId, setIntervalId] = useState<string>(DEFAULT_CANDLE_INTERVAL);
    const [data, setData] = useState<CandleSet | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [on, setOn] = useState<Record<Indicator, boolean>>({ sma: false, ema: false, rsi: false, macd: false });
    const [tool, setTool] = useState<ActiveTool | null>(null);
    const [noteText, setNoteText] = useState('');
    const [drawings, setDrawings] = useState<Drawing[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);
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
    }, [symbol]);

    const saved = useRef(false);
    useEffect(() => {
        if (!saved.current) {
            saved.current = true;
            return;
        }
        saveDrawings(symbol, drawings);
    }, [symbol, drawings]);

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

        const volume = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
            priceLineVisible: false,
            lastValueVisible: false,
        });
        const upFill = token('--up', '#4ade80', 0.4);
        const downFill = token('--down', '#f87171', 0.4);
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
        timesRef.current = data.candles.map((c) => c.time);

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

    const toScreen = useCallback((point: DrawPoint): ScreenPoint | null => {
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!chart || !series) return null;
        // The drawing was stored on some interval's bars; on another interval it snaps to the nearest
        // bar of the one on screen, which is why it stays visible after a timeframe switch.
        const time = nearestTime(timesRef.current, point.time);
        if (time == null) return null;
        const x = chart.timeScale().timeToCoordinate(time as UTCTimestamp);
        const y = series.priceToCoordinate(point.price);
        return x == null || y == null ? null : { x, y };
    }, []);

    const fromScreen = useCallback((x: number, y: number): DrawPoint | null => {
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!chart || !series) return null;
        const time = chart.timeScale().coordinateToTime(x);
        const price = series.coordinateToPrice(y);
        if (time == null || price == null) return null;
        return { time: Number(time), price: Number(price) };
    }, []);

    const commit = (drawing: Drawing) => setDrawings((list) => [...list, drawing]);
    const moveHandle = (id: string, index: number, point: DrawPoint) =>
        setDrawings((list) => list.map((d) => (d.id === id ? { ...d, points: d.points.map((p, i) => (i === index ? point : p)) } : d)));
    const removeSelected = () =>
        setDrawings((list) => {
            const next = list.filter((d) => d.id !== selectedId);
            setSelectedId(null);
            return next;
        });

    const timeframes = useMemo(() => CANDLE_INTERVALS.map((i) => ({ id: i.id as string, label: t(`chart.tf.${i.id}` as StringKey) })), [t]);

    const body = (
        // dir=ltr on the plotting area too: the last labels drawn on the canvas overlay are SVG text
        // (Fibonacci levels, notes), and in an RTL page "0.786" would otherwise reorder to "786.0".
        <div className={cn('relative', expanded ? 'size-full' : 'h-[420px]')} dir="ltr">
            <div ref={hostRef} className="size-full" />

            {status === 'ready' && (
                <ChartDrawings
                    drawings={drawings}
                    selectedId={selectedId}
                    tool={tool}
                    text={noteText}
                    toScreen={toScreen}
                    fromScreen={fromScreen}
                    onCommit={commit}
                    onSelect={setSelectedId}
                    onMoveHandle={moveHandle}
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
                {TOOLS.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => {
                            setSelectedId(null);
                            setTool((current) => (current === id ? null : id));
                        }}
                        className={cn('pill h-7 px-2.5 text-[12px] gap-1.5', tool === id && 'is-up')}
                        aria-pressed={tool === id}
                        title={t(label)}
                    >
                        <Icon className="size-3.5" /> {t(label)}
                    </button>
                ))}
                {tool === 'text' && (
                    <input
                        value={noteText}
                        onChange={(event) => setNoteText(event.target.value)}
                        placeholder={t('chart.notePlaceholder')}
                        maxLength={60}
                        className="h-7 w-40 rounded-full bg-page px-3 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
                    />
                )}
                <span className="mx-1 h-4 w-px bg-line" />
                <button type="button" onClick={removeSelected} disabled={!selectedId} className="icon-btn is-danger" title={t('chart.tool.delete')} aria-label={t('chart.tool.delete')}>
                    <Trash2 />
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setDrawings([]);
                        setSelectedId(null);
                    }}
                    disabled={drawings.length === 0}
                    className="icon-btn"
                    title={t('chart.tool.clear')}
                    aria-label={t('chart.tool.clear')}
                >
                    <Eraser />
                </button>
                <a href={tradingViewSymbolUrl(tvSymbol)} target="_blank" rel="noopener noreferrer" className="pill h-7 px-2.5 text-[12px] gap-1.5 ms-auto">
                    <ExternalLink className="size-3.5" /> {t('stock.openTV')}
                </a>
            </div>

            {expanded && <div className="fixed inset-0 z-40 bg-page/70 backdrop-blur-[3px]" onClick={() => setExpanded(false)} />}
            <div className={cn(expanded && 'fixed inset-3 z-50 rounded-[14px] bg-card p-3 shadow-[0_0_0_4px_var(--frame),0_24px_60px_oklch(0_0_0/0.6)]')}>
                {body}
            </div>

            <p className="text-[12px] text-faint">{t('chart.drawingHint')}</p>
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

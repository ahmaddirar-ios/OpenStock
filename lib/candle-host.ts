// One place that builds a candle chart. The symbol page (YahooChart) and the grid's panes both come
// through here, so theme colours, the volume overlay and the indicator panes are defined once.
// Browser-only: it needs a real element and the page's computed CSS tokens.

import {
    AreaSeries,
    BarSeries,
    BaselineSeries,
    CandlestickSeries,
    HistogramSeries,
    LineSeries,
    LineStyle,
    PriceScaleMode,
    TickMarkType,
    createChart,
    createTextWatermark,
    type DeepPartial,
    type IChartApi,
    type ISeriesApi,
    type ITextWatermarkPluginApi,
    type MouseEventParams,
    type SeriesType,
    type Time,
    type TimeChartOptions,
    type TimeScaleOptions,
    type UTCTimestamp,
} from 'lightweight-charts';
import { heikinAshi, renko, type ChartType, type ScaleMode } from '@/lib/chart-view';
import { kagi } from '@/lib/chart-kagi';
import { KagiPaneView, type KagiDatum } from '@/lib/kagi-series';
import { PnfPaneView, type PnfDatum } from '@/lib/pnf-series';
import { pointAndFigure } from '@/lib/chart-pnf';
import { lineBreak } from '@/lib/chart-linebreak';
import { LineBreakPaneView, type LineBreakDatum } from '@/lib/linebreak-series';
import { tickLabel, timeLabel, type TickKind, type TimeZoneId } from '@/lib/chart-time';
import { withSessionBreaks } from '@/lib/chart-sessions';
import { centredRange, isAtLatest, latestRange, nearestBarIndex } from '@/lib/chart-goto';
import { readoutAt, type BarReadout, type ReadoutSeries } from '@/lib/chart-readout';
import { arNumberDigits, type Lang } from '@/lib/i18n';
import { STUDIES, STUDY_COLOR_SOURCES, bandSegments, studiesChoice, studiesParam, studyLineStyle, studyLines, studySymbols, studyWantsPane, studyWidth, type ColorToken, type StudyConfig, type StudyLineDash, type StudyWidth } from '@/lib/chart-studies';
import { BandFillPrimitive } from '@/lib/band-fill-primitive';
import { VolumeProfilePrimitive } from '@/lib/volume-profile-primitive';
import type { Series } from '@/lib/indicators';
import type { Candle, CandleSet } from '@/lib/yahoo-candles';
import type { ChartPalette } from '@/lib/chart-palette';

export type CandleHost = {
    chart: IChartApi;
    /**
     * The series the price is drawn on, and what screen coordinates are measured against. Its type
     * follows the chart type, so consumers hold this live reference rather than a snapshot.
     */
    price: ISeriesApi<SeriesType>;
    /** Adds a pane under the price and returns its index (the compare pane uses it). */
    addPane: (stretch: number) => number;
    /** Replaces the candles without touching the view, so a live update never jumps the zoom. */
    setData: (set: CandleSet | null) => void;
    /**
     * The bars after the replay cursor, painted faintly so the trader can see where the market went
     * without any indicator or drawing being allowed to read them. An empty list clears them.
     */
    setGhost: (candles: readonly Candle[]) => void;
    /** Replaces every study on the chart: overlays on the price, oscillators in their own panes. */
    setStudies: (studies: StudyConfig[]) => void;
    /** Redraws the same candles as bodies, hollow bodies, Heikin Ashi, bars, a line or an area. */
    setChartType: (type: ChartType) => void;
    /** Spaces the right axis arithmetically, logarithmically, or as percent from the base bar. */
    setScaleMode: (mode: ScaleMode) => void;
    /** Labels the time axis in this zone. */
    setTimeZone: (zone: TimeZoneId) => void;
    /** Flips the price axis top to bottom. */
    setInvertScale: (on: boolean) => void;
    /** The absolute Renko box; undefined means half a percent of the first close. */
    setRenkoBox: (box: number | undefined) => void;
    /** The Kagi retracement, as a fraction; undefined means four percent. */
    setKagiReversal: (value: number | undefined) => void;
    /** The Line Break count; undefined means the classic three. */
    setLineBreakCount: (value: number | undefined) => void;
    /** The Point & Figure box; 0 or undefined derives one from the first close. */
    setPnfBox: (box: number | undefined) => void;
    /** The Point & Figure reversal, in boxes. */
    setPnfReversal: (value: number | undefined) => void;
    /** Collapses closed-market gaps by inserting empty slots. */
    setSessionBreaks: (on: boolean) => void;
    /** Shows or hides the volume histogram under the price. */
    setVolumeVisible: (on: boolean) => void;
    /** The page's theme changed: re-read every token and repaint what depends on them. */
    setTheme: () => void;
    /**
     * The interval the bars belong to. Only a study that names another symbol reads it, and the
     * grid keeps one host across interval changes, so it moves through here rather than options.
     */
    setInterval: (interval: string) => void;
    /** Paints the chart with this palette, or follows the app theme again when null. */
    setPalette: (palette: ChartPalette | null) => void;
    setTimeVisible: (visible: boolean) => void;
    /** The faint symbol text behind the candles; null hides it. */
    setWatermark: (text: string | null) => void;
    /** The chart as an image, for the export button; null before the library is ready. */
    screenshot: () => HTMLCanvasElement | null;
    fit: () => void;
    /** Jumps the view to the bar nearest this time, keeping the current zoom width. */
    goToTime: (time: number) => void;
    /** Whether the view already shows the newest bar (the "back to latest" pill hides then). */
    isAtLatest: () => boolean;
    /** Slides the view to the newest bar without changing the zoom width. */
    toLatest: () => void;
    /**
     * The bar under the crosshair — or the last bar when the cursor is away — with the value of
     * every indicator drawn at it. Null before any candles exist.
     */
    readAt: (time?: number | null) => BarReadout | null;
    /**
     * Emits the readout on every crosshair move and whenever the candles or the indicators are
     * replaced, so a legend follows a replay step without knowing about replay.
     */
    subscribeReadout: (listener: (readout: BarReadout | null) => void) => () => void;
    /**
     * The same readout plus where the pointer is, in the chart's own pixels. The point is null once
     * the cursor leaves the pane, which is how a tooltip knows to hide.
     */
    subscribeHover: (listener: (state: HoverState) => void) => () => void;
    destroy: () => void;
};

/** The bar under the cursor and the cursor's position inside the chart, for a hover tooltip. */
export type HoverState = {
    readout: BarReadout | null;
    point: { x: number; y: number } | null;
};

export type CandleHostOptions = {
    /** Show clock times on the axis (intraday), or plain dates (daily and above). */
    timeVisible?: boolean;
    /** The candles the host starts with; more can arrive through setData. */
    data?: CandleSet | null;
    studies?: StudyConfig[];
    /** The type to open with; anything unknown reads as candles. */
    chartType?: ChartType;
    /** The axis spacing to open with. */
    scaleMode?: ScaleMode;
    /** The zone the time axis is labelled in; `local` is the browser's. */
    timeZone?: TimeZoneId;
    /** The interface language: Arabic labels the axis in Arabic months and Arabic-Indic digits. */
    lang?: Lang;
    /** Whether closed-market gaps are shown as empty space. */
    sessionBreaks?: boolean;
    /** Mirror the price axis. */
    invertScale?: boolean;
    /** The Renko box to open with; undefined keeps the half-percent default. */
    renkoBox?: number;
    /** The Kagi retracement to open with, as a fraction. */
    kagiReversal?: number;
    /** The Line Break count to open with. */
    lineBreakCount?: number;
    /** The Point & Figure box size; 0 or undefined derives one from the first close. */
    pnfBox?: number;
    /** The Point & Figure reversal, in boxes; undefined means the classic three. */
    pnfReversal?: number;
    /** Whether the volume histogram opens visible. */
    volumeVisible?: boolean;
    /** The faint symbol text behind the candles; null or absent leaves the pane clean. */
    watermark?: string | null;
    /** The interval the bars belong to; only studies that name another symbol read it. */
    interval?: string;
    /**
     * Loads another symbol's bars at this interval, for a study that names a symbol — `getCompareCandles`
     * on both pages. Omit it and such a study draws nothing rather than a line from stale data.
     */
    loadSymbol?: (symbol: string, interval: string) => Promise<CandleSet | null>;
    /** The colours to open with; null (or absent) follows the app theme. */
    palette?: ChartPalette | null;
    /**
     * Called with the price series now on screen — once at creation and again whenever the chart
     * type replaces it, so the page can re-attach markers to the series that exists.
     */
    onPriceSeries?: (series: ISeriesApi<SeriesType>) => void;
    /**
     * Extra series the page needs under the price and above the oscillators — the compare pane.
     * Runs once per host, before the indicator panes are laid out.
     */
    extend?: (host: CandleHost) => void;
    /** Fired when the visible range moves, so an overlay can be re-projected. */
    onRangeChange?: () => void;
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

/** A design token as a colour lightweight-charts accepts. Shared with the pages that draw legends. */
export const token = (name: string, fallback: string, alpha?: number) => {
    if (typeof window === 'undefined') return fallback;
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return raw ? toRgba(raw, fallback, alpha) : fallback;
};

const line = (series: Series, candles: CandleSet['candles']) =>
    candles.flatMap((candle, i) => {
        const value = series[i];
        return value == null ? [] : [{ time: candle.time as UTCTimestamp, value }];
    });

/** Adds a line series to the price pane (pane 0) — the SMA and EMA overlays. */
const overlay = (
    chart: IChartApi,
    points: { time: UTCTimestamp; value: number }[],
    color: string,
    lineWidth: StudyWidth,
    style: LineStyle,
) => {
    if (points.length === 0) return null;
    const series = chart.addSeries(LineSeries, {
        color,
        lineWidth,
        lineStyle: style,
        priceLineVisible: false,
        lastValueVisible: false,
    });
    series.setData(points);
    return series;
};

export function createCandleHost(container: HTMLElement, options: CandleHostOptions = {}): CandleHost {
    // Re-resolved on a theme change or a palette change: the tokens are CSS variables, and the
    // canvas cannot read them, so every colour the chart paints with is rasterised from the live
    // token at the moment it is used. A palette, when one is set, wins over the tokens outright.
    let palette: ChartPalette | null = options.palette ?? null;
    let up = '#4ade80';
    let down = '#f87171';
    let grid = '#1c2320';
    let upFill = 'rgba(74, 222, 128, 0.4)';
    let downFill = 'rgba(248, 113, 113, 0.4)';
    let brand = '#34d399';
    let brandFill = 'rgba(52, 211, 153, 0.24)';
    let text = '#7d8a84';
    let background = 'transparent';

    const resolveColors = () => {
        if (palette) {
            up = palette.up;
            down = palette.down;
            grid = palette.grid;
            text = palette.text;
            background = palette.background;
            upFill = toRgba(palette.up, palette.up, 0.4);
            downFill = toRgba(palette.down, palette.down, 0.4);
            // A line or an area has one colour, not two: it takes the rising colour so the chart
            // still reads as the same instrument in every type.
            brand = palette.up;
            brandFill = toRgba(palette.up, palette.up, 0.24);
            return;
        }
        up = token('--up', '#4ade80');
        down = token('--down', '#f87171');
        grid = token('--line', '#1c2320');
        text = token('--faint', '#7d8a84');
        background = 'transparent';
        upFill = token('--up', '#4ade80', 0.4);
        downFill = token('--down', '#f87171', 0.4);
        brand = token('--brand', '#34d399');
        brandFill = token('--brand', '#34d399', 0.24);
    };
    resolveColors();

    const lang: Lang = options.lang ?? 'en';
    // The canvas prints what the formatter returns; Arabic-Indic digits need no bidi isolates there.
    const formatPrice = (value: number) => arNumberDigits(value.toFixed(2), lang);
    // A study that measures in percent says so on its own axis; the chart-wide formatter would
    // otherwise print the number bare, and -38.28 could be read as a price.
    const formatPercent = (value: number) => `${arNumberDigits(value.toFixed(2), lang)}%`;

    const chartOptions: DeepPartial<TimeChartOptions> = {
        autoSize: true,
        layout: {
            background: { color: background },
            textColor: text,
            attributionLogo: false,
            fontFamily: 'inherit',
        },
        grid: { vertLines: { color: grid }, horzLines: { color: grid } },
        rightPriceScale: { borderColor: grid },
        timeScale: {
            borderColor: grid,
            timeVisible: options.timeVisible ?? true,
            secondsVisible: false,
            tickMarkFormatter: (time: Time, type: TickMarkType) =>
                tickLabel(TICK_KIND[type] ?? 'time', Number(time), timeZone, lang),
        },
        localization: {
            locale: lang === 'ar' ? 'ar-u-nu-arab' : 'en-US',
            priceFormatter: formatPrice,
            // The compare pane draws percent change: it keeps its own sign and unit, only the
            // digits turn Arabic-Indic like the price axis.
            percentageFormatter: (value: number) => `${arNumberDigits(value.toFixed(2), lang)}%`,
            timeFormatter: (time: Time) => timeLabel(Number(time), timeZone, lang),
        },
    };
    const chart = createChart(container, chartOptions);

    // A faint symbol name behind the candles, TradingView's watermark. It is a pane primitive rather
    // than a series, so it never enters the legend, the crosshair readout or the exported numbers;
    // the colour is derived from the live text token and follows every theme change.
    let watermarkText = options.watermark ?? null;
    let watermarkApi: ITextWatermarkPluginApi<Time> | null = null;
    const applyWatermark = () => {
        // The plugin stays attached and is hidden instead of detached: re-attaching a pane primitive
        // after detach does not repaint reliably, and a hidden watermark costs nothing.
        const visible = Boolean(watermarkText);
        const lines = watermarkText
            ? [{ text: watermarkText, color: toRgba(text, text, 0.08), fontSize: 44, fontStyle: 'bold' as const }]
            : [];
        if (watermarkApi) {
            watermarkApi.applyOptions({ visible, lines });
            return;
        }
        watermarkApi = createTextWatermark(chart.panes()[0], {
            visible,
            horzAlign: 'center',
            vertAlign: 'center',
            lines,
        });
    };
    applyWatermark();

    let chartType: ChartType = options.chartType ?? 'candles';

    const PRICE_SCALE_MODE: Record<ScaleMode, PriceScaleMode> = {
        linear: PriceScaleMode.Normal,
        log: PriceScaleMode.Logarithmic,
        percent: PriceScaleMode.Percentage,
        indexed: PriceScaleMode.IndexedTo100,
    };
    const LINE_STYLE: Record<StudyLineDash, LineStyle> = {
        solid: LineStyle.Solid,
        dashed: LineStyle.Dashed,
        dotted: LineStyle.Dotted,
    };

    const TICK_KIND: Record<TickMarkType, TickKind> = {
        [TickMarkType.Year]: 'year',
        [TickMarkType.Month]: 'month',
        [TickMarkType.DayOfMonth]: 'day',
        [TickMarkType.Time]: 'time',
        [TickMarkType.TimeWithSeconds]: 'seconds',
    };
    let timeZone: TimeZoneId = options.timeZone ?? 'local';
    let sessionBreaks = options.sessionBreaks ?? false;
    let renkoBox = options.renkoBox;
    let kagiReversal = options.kagiReversal;
    let lineBreakCount = options.lineBreakCount;
    let pnfBox = options.pnfBox;
    let pnfReversal = options.pnfReversal;
    const tickFormatter = () => (time: Time, type: TickMarkType) =>
        tickLabel(TICK_KIND[type] ?? 'time', Number(time), timeZone, lang);

    const applyScaleMode = (mode: ScaleMode) => {
        // The right axis only: the volume scale keeps its own units either way.
        chart.priceScale('right').applyOptions({ mode: PRICE_SCALE_MODE[mode] });
    };
    applyScaleMode(options.scaleMode ?? 'linear');
    if (options.invertScale) chart.priceScale('right').applyOptions({ invertScale: true });

    // A series' type is fixed at creation in lightweight-charts, so changing the chart type means
    // replacing this one series. The volume series is on its own scale at the bottom, so it can stay.
    const createPriceSeries = (): ISeriesApi<SeriesType> => {
        if (chartType === 'bars') {
            return chart.addSeries(BarSeries, { upColor: up, downColor: down, thinBars: false });
        }
        if (chartType === 'line') {
            return chart.addSeries(LineSeries, {
                color: brand,
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: false,
            });
        }
        if (chartType === 'area') {
            return chart.addSeries(AreaSeries, {
                lineColor: brand,
                topColor: brandFill,
                bottomColor: 'rgba(0,0,0,0)',
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: false,
            });
        }
        if (chartType === 'baseline') {
            // A baseline splits the picture at one price: above it reads as strength, below as weakness.
            // The base is the range's own middle until the data arrives and settles on its first close.
            return chart.addSeries(BaselineSeries, {
                baseValue: { type: 'price', price: 0 },
                topLineColor: up,
                topFillColor1: 'rgba(34,197,94,0.28)',
                topFillColor2: 'rgba(34,197,94,0.02)',
                bottomLineColor: down,
                bottomFillColor1: 'rgba(239,68,68,0.02)',
                bottomFillColor2: 'rgba(239,68,68,0.28)',
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: false,
            });
        }
        if (chartType === 'linebreak') {
            return chart.addCustomSeries(new LineBreakPaneView(), {}) as unknown as ISeriesApi<SeriesType>;
        }
        if (chartType === 'kagi') {
            // A custom series: the Kagi staircase has no built-in equivalent.
            return chart.addCustomSeries(new KagiPaneView(), {}) as unknown as ISeriesApi<SeriesType>;
        }
        if (chartType === 'pnf') {
            // Point & Figure has no time axis to hang bars on: columns of X's and O's, drawn here.
            return chart.addCustomSeries(new PnfPaneView(), {}) as unknown as ISeriesApi<SeriesType>;
        }
        if (chartType === 'hollow') {
            // The up body is not filled: its outline and wick carry the colour instead.
            return chart.addSeries(CandlestickSeries, {
                upColor: 'rgba(0,0,0,0)',
                downColor: down,
                borderVisible: true,
                borderUpColor: up,
                borderDownColor: down,
                wickUpColor: up,
                wickDownColor: down,
            });
        }
        return chart.addSeries(CandlestickSeries, {
            upColor: up,
            downColor: down,
            wickUpColor: up,
            wickDownColor: down,
            borderVisible: false,
        });
    };

    let price = createPriceSeries();

    // The ghost feed: the bars a replay has not reached yet, painted faintly. It is a separate
    // series on purpose — the price series, the studies and the legend never see these bars, so a
    // ghost can never shape an indicator. Created lazily, so a normal chart pays nothing for it.
    let ghost: ISeriesApi<'Candlestick'> | null = null;
    const ghostColors = () => ({
        upColor: toRgba(up, up, 0.2),
        downColor: toRgba(down, down, 0.2),
        wickUpColor: toRgba(up, up, 0.16),
        wickDownColor: toRgba(down, down, 0.16),
    });
    const ensureGhost = (): ISeriesApi<'Candlestick'> => {
        if (ghost) return ghost;
        ghost = chart.addSeries(CandlestickSeries, {
            ...ghostColors(),
            borderVisible: false,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        return ghost;
    };

    const volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        priceLineVisible: false,
        lastValueVisible: false,
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    let volumeVisible = options.volumeVisible ?? true;
    let data: CandleSet | null = options.data ?? null;
    let studies: StudyConfig[] = options.studies ?? [];
    // The interval the bars belong to, and where another symbol's bars come from. A study that
    // names a symbol asks for them once; while they travel the study draws nothing, which is the
    // same answer a study gives when its own window is not full yet.
    let interval = options.interval ?? '';
    const studySeries = new Map<string, { candles: readonly Candle[]; at: number }>();
    const studyRequests = new Set<string>();
    const studyKey = (symbol: string) => `${interval}|${symbol.trim().toUpperCase()}`;
    let torn = false;
    const studyContext = {
        candlesFor: (symbol: string) => studySeries.get(studyKey(symbol))?.candles ?? null,
    };
    const ensureStudySeries = async (symbol: string) => {
        if (!options.loadSymbol || !symbol.trim() || !interval) return;
        const key = studyKey(symbol);
        // A minute of freshness: the page refreshes its own bars on the same rhythm, and a study
        // that refetched on every tick would be a request per second for a line that barely moves.
        const cached = studySeries.get(key);
        if (cached && Date.now() - cached.at < 60_000) return;
        if (studyRequests.has(key)) return;
        studyRequests.add(key);
        try {
            const set = await options.loadSymbol(symbol.trim().toUpperCase(), interval);
            if (torn || !set || set.candles.length === 0) return;
            studySeries.set(key, { candles: set.candles, at: Date.now() });
            buildStudies();
            emitReadout();
        } catch {
            // A ticker that does not resolve is the trader's typo, not a broken chart.
        } finally {
            studyRequests.delete(key);
        }
    };
    const overlays: ISeriesApi<'Line'>[] = [];
    // Series primitives the studies own — the Keltner ribbon and the volume profile. They ride on a
    // series the host already has, so they are tracked separately from the series list.
    const artPrimitives: { series: ISeriesApi<SeriesType>; primitive: BandFillPrimitive | VolumeProfilePrimitive }[] = [];
    const colorCache = new Map<ColorToken, string>();
    const resolveColor = (color: ColorToken) => {
        const cached = colorCache.get(color);
        if (cached) return cached;
        const resolved = token(STUDY_COLOR_SOURCES[color].token, STUDY_COLOR_SOURCES[color].fallback);
        colorCache.set(color, resolved);
        return resolved;
    };
    // The panes this host owns. Everything the host adds sits under any pane the page extended, so
    // removing them from the end never touches a compare pane.
    let ownedPanes: number[] = [];
    // The legend's source: the same arrays the indicator panes are drawn from, plus the bar the
    // crosshair last stood on. Capturing them here means the legend cannot disagree with the chart.
    let readoutSeries: ReadoutSeries = {};
    let hoverTime: number | null = null;
    // Where the cursor is, in chart pixels. Null once it leaves the pane; the tooltip uses this to
    // follow the pointer and to know when to disappear.
    let hoverPoint: { x: number; y: number } | null = null;
    const readoutListeners = new Set<(readout: BarReadout | null) => void>();
    const hoverListeners = new Set<(state: HoverState) => void>();

    const readAt = (time: number | null = hoverTime) => readoutAt(bars(), readoutSeries, time);
    const emitReadout = () => {
        const readout = readAt();
        for (const listener of readoutListeners) listener(readout);
        for (const listener of hoverListeners) listener({ readout, point: hoverPoint });
    };

    // A time outside the candles (the empty space to the right) is "no hovered bar", which the
    // readout answers with the last bar — exactly the fallback TradingView's legend uses.
    const handleCrosshair = (param: MouseEventParams) => {
        const time = typeof param.time === 'number' ? param.time : null;
        const point = param.point ? { x: param.point.x, y: param.point.y } : null;
        if (time === hoverTime && point?.x === hoverPoint?.x && point?.y === hoverPoint?.y) return;
        hoverTime = time;
        hoverPoint = point;
        emitReadout();
    };

    const addPane = (stretch: number): number => {
        const pane = chart.addPane();
        pane.setStretchFactor(stretch);
        return chart.panes().indexOf(pane);
    };

    /**
     * The bars every consumer sees: the real candles, or their Heikin Ashi reading. Choosing Heikin
     * Ashi changes the chart's data, not just its paint — a study and the legend then agree with the
     * axis they are drawn against (and with TradingView), at the cost of the values differing from
     * the strategy lab, which always works on real candles.
     */
    const bars = () => {
        const candles = data?.candles ?? [];
        if (chartType === 'renko') return renko(candles, renkoBox);
        return chartType === 'heikin' ? heikinAshi(candles) : candles;
    };

    /**
     * What the price and volume series are drawn from: the bars, with empty slots where the market
     * was shut when session breaks are on. Studies and the legend keep reading the real bars, so a
     * gap changes the picture and nothing else.
     */
    const seriesBars = () => {
        const candles = bars();
        // Renko's times already encode direction, not the clock: breaks would insert thousands of
        // one-second slots across every real gap.
        return sessionBreaks && chartType !== 'renko' ? withSessionBreaks(candles) : candles;
    };

    const applyCandles = () => {
        if (chartType === 'linebreak') {
            const boxes = lineBreak(
                bars().map((candle) => ({ time: candle.time, close: candle.close })),
                lineBreakCount,
            );
            (price as unknown as ISeriesApi<'Custom'>).setData(boxes as LineBreakDatum[]);
            volume.setData([]);
            return;
        }
        if (chartType === 'pnf') {
            const columns = pointAndFigure(
                bars().map((candle) => ({ time: candle.time, close: candle.close })),
                pnfBox,
                pnfReversal,
            );
            (price as unknown as ISeriesApi<'Custom'>).setData(columns as PnfDatum[]);
            volume.setData([]);
            return;
        }
        if (chartType === 'kagi') {
            // Kagi is drawn from closes; the real bars still feed the studies and the legend.
            const segments = kagi(
                bars().map((candle) => ({ time: candle.time, close: candle.close })),
                kagiReversal,
            );
            (price as unknown as ISeriesApi<'Custom'>).setData(segments as KagiDatum[]);
            volume.setData([]);
            return;
        }
        const candles = seriesBars();
        if (chartType === 'baseline') {
            // The base is where the reading starts: the first close on screen. A series option can be
            // changed after creation, which is how the base follows the data it was created without.
            const base = candles.find((candle) => 'close' in candle) as { close: number } | undefined;
            if (base) price.applyOptions({ baseValue: { type: 'price', price: base.close } });
        }
        if (chartType === 'line' || chartType === 'area' || chartType === 'baseline') {
            price.setData(
                candles.map((candle) =>
                    'close' in candle
                        ? { time: candle.time as UTCTimestamp, value: candle.close }
                        : { time: candle.time as UTCTimestamp },
                ),
            );
        } else {
            price.setData(
                candles.map((candle) =>
                    'close' in candle
                        ? {
                              time: candle.time as UTCTimestamp,
                              open: candle.open,
                              high: candle.high,
                              low: candle.low,
                              close: candle.close,
                          }
                        : { time: candle.time as UTCTimestamp },
                ),
            );
        }
        volume.setData(
            candles.map((candle) =>
                'close' in candle
                    ? {
                          time: candle.time as UTCTimestamp,
                          value: candle.volume,
                          color: candle.close >= candle.open ? upFill : downFill,
                      }
                    : { time: candle.time as UTCTimestamp },
            ),
        );
    };

    const clearIndicators = () => {
        // Detach the primitives while their series is still on the chart, then let the series go.
        for (const { series, primitive } of artPrimitives.splice(0)) series.detachPrimitive(primitive);
        for (const series of overlays.splice(0)) chart.removeSeries(series);
        for (const index of [...ownedPanes].sort((a, b) => b - a)) chart.removePane(index);
        ownedPanes = [];
    };

    const buildStudies = () => {
        clearIndicators();
        readoutSeries = {};
        const candles = bars();
        if (candles.length === 0) return;

        // A study that names a symbol asks for its bars here; they arrive once and rebuild this
        // list, so the compute below stays synchronous and the chart never waits on the network.
        for (const study of studies) {
            for (const symbol of studySymbols(study)) void ensureStudySeries(symbol);
        }

        const oscillators = studies.filter((study) => studyWantsPane(study.id, study.params)).length;
        const stretch = oscillators > 1 ? 0.2 : 0.28;

        studies.forEach((study, index) => {
            const def = STUDIES[study.id];
            if (!def) return;
            const computed = def.compute(candles, study.params, studyContext);
            // A study that cannot fill its window draws nothing and opens no empty pane. A profile
            // has no lines to warm up, so it only needs the definition to ask for one.
            const specs = studyLines(study);
            const drawn = specs.filter((spec) => computed[spec.key]?.some((value) => value != null));
            if (drawn.length === 0 && !def.profile) return;

            // Oscillators get their own pane under the price, in the order the trader added them.
            let pane = -1;
            if (studyWantsPane(def.id, study.params)) {
                pane = addPane(stretch);
                ownedPanes.push(pane);
            }

            // A study-level stroke applies to all its lines; the colour only where it means nothing
            // structural — `studyColor` refuses an override on a multi-line study.
            const width = studyWidth(study);
            // The overlays by line key, so a fill can hang itself on the line it belongs to.
            const lines = new Map<string, ISeriesApi<'Line'>>();

            for (const spec of drawn) {
                const values = computed[spec.key];
                const style = studyLineStyle(study, spec);
                // Keyed by list position, not study id: two SMAs must stay distinguishable.
                readoutSeries[`${index}:${spec.key}`] = values;

                if (spec.kind === 'histogram') {
                    chart
                        .addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane >= 0 ? pane : undefined)
                        .setData(
                            candles.flatMap((candle, i) => {
                                const value = values[i];
                                return value == null
                                    ? []
                                    : [{ time: candle.time as UTCTimestamp, value, color: value >= 0 ? up : down }];
                            }),
                        );
                    continue;
                }

                const points = line(values, candles);
                if (pane >= 0) {
                    chart
                        .addSeries(
                            LineSeries,
                            {
                                color: resolveColor(style.color),
                                lineWidth: width,
                                lineStyle: LINE_STYLE[style.dash],
                                priceLineVisible: false,
                                lastValueVisible: false,
                                // A spread is already a percentage: label the axis in the unit the
                                // study thinks in, not as a bare number the eye has to translate.
                                ...(def.format === 'percent'
                                    ? { priceFormat: { type: 'custom' as const, formatter: formatPercent } }
                                    : {}),
                            },
                            pane,
                        )
                        .setData(points);
                } else {
                    const series = overlay(chart, points, resolveColor(style.color), width, LINE_STYLE[style.dash]);
                    if (series) {
                        overlays.push(series);
                        lines.set(spec.key, series);
                    }
                }
            }

            // The ribbon hangs on the upper line, which already sits in the price pane.
            if (pane < 0 && def.fill) {
                const upper = lines.get(def.fill.upper);
                const segments = bandSegments(candles, computed[def.fill.upper] ?? [], computed[def.fill.lower] ?? []);
                if (upper && segments.length > 0) {
                    const primitive = new BandFillPrimitive(segments, resolveColor(def.fill.color), def.fill.opacity);
                    upper.attachPrimitive(primitive);
                    artPrimitives.push({ series: upper, primitive });
                }
            }

            // The profile rides on the price series: it has no line to hang from, and the price scale
            // it must line up with is the candles'.
            if (pane < 0 && def.profile) {
                const rows = Math.round(studiesParam(study, def.profile.rowsParam));
                const area = def.profile.valueAreaParam ? studiesParam(study, def.profile.valueAreaParam) : 70;
                const side = def.profile.sideParam && studiesChoice(study, def.profile.sideParam) === 'left' ? 'left' : 'right';
                const primitive = new VolumeProfilePrimitive(candles, rows, area, side, resolveColor(def.profile.color));
                price.attachPrimitive(primitive);
                artPrimitives.push({ series: price, primitive });
            }
        });
    };

    // Every colour the chart paints with has just been re-resolved: push the ones the chart owns
    // (the tile, the grid, the axis text) and rebuild the price series, which carries its own.
    const repaint = () => {
        chart.applyOptions({
            layout: { textColor: text, background: { color: background } },
            grid: { vertLines: { color: grid }, horzLines: { color: grid } },
            rightPriceScale: { borderColor: grid },
            timeScale: { borderColor: grid },
        });
        // The profile hangs on the price series, so it has to come off before the series does.
        clearIndicators();
        chart.removeSeries(price);
        price = createPriceSeries();
        // The ghost is a separate series, so a theme change has to repaint it by hand.
        ghost?.applyOptions(ghostColors());
        applyCandles();
        buildStudies();
        emitReadout();
        options.onPriceSeries?.(price);
    };

    const host: CandleHost = {
        chart,
        get price() {
            return price;
        },
        addPane,
        setData: (set) => {
            data = set;
            applyCandles();
            buildStudies();
            emitReadout();
        },
        setGhost: (candles) => {
            if (candles.length === 0) {
                ghost?.setData([]);
                return;
            }
            ensureGhost().setData(
                candles.map((candle) => ({
                    time: candle.time as UTCTimestamp,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                })),
            );
        },
        setStudies: (next) => {
            studies = next;
            buildStudies();
            emitReadout();
        },
        setScaleMode: (mode) => applyScaleMode(mode),
        setInvertScale: (on) => chart.priceScale('right').applyOptions({ invertScale: on }),
        setLineBreakCount: (value) => {
            lineBreakCount = value;
            if (chartType === 'linebreak') {
                applyCandles();
                emitReadout();
            }
        },
        setPnfBox: (box) => {
            pnfBox = box;
            if (chartType === 'pnf') {
                applyCandles();
                buildStudies();
                emitReadout();
            }
        },
        setPnfReversal: (value) => {
            pnfReversal = value;
            if (chartType === 'pnf') {
                applyCandles();
                emitReadout();
            }
        },
        setKagiReversal: (value) => {
            kagiReversal = value;
            if (chartType === 'kagi') {
                applyCandles();
                emitReadout();
            }
        },
        setRenkoBox: (box) => {
            renkoBox = box;
            if (chartType === 'renko') {
                applyCandles();
                buildStudies();
                emitReadout();
            }
        },
        setTimeZone: (zone) => {
            timeZone = zone;
            // The formatters are closures over `timeZone`, so they are replaced to take effect.
            const tickOptions: DeepPartial<TimeScaleOptions> = { tickMarkFormatter: tickFormatter() };
            chart.timeScale().applyOptions(tickOptions);
            chart.applyOptions({ localization: { timeFormatter: (time: Time) => timeLabel(Number(time), timeZone, lang) } });
        },
        setSessionBreaks: (on) => {
            sessionBreaks = on;
            applyCandles();
        },
        setTheme: () => {
            colorCache.clear();
            resolveColors();
            repaint();
            applyWatermark();
        },
        setInterval: (next) => {
            if (next === interval) return;
            interval = next;
            // Bars of the old interval belong to another question: drop them and let the studies
            // that need them ask again. The cache is keyed by interval, so nothing is mislabelled.
            studySeries.clear();
            buildStudies();
            emitReadout();
        },
        setPalette: (next) => {
            palette = next;
            colorCache.clear();
            resolveColors();
            repaint();
            applyWatermark();
        },
        setVolumeVisible: (on) => {
            volumeVisible = on;
            // The pane is hidden by taking its scale out of the layout, so the price keeps the room
            // the volume was using instead of leaving a gap.
            chart.priceScale('volume').applyOptions({ visible: on, scaleMargins: on ? { top: 0.82, bottom: 0 } : { top: 1, bottom: 0 } });
            volume.applyOptions({ visible: on });
        },
        setChartType: (next) => {
            if (next === chartType) return;
            chartType = next;
            // The profile hangs on the price series, so it comes off before the series does.
            clearIndicators();
            chart.removeSeries(price);
            price = createPriceSeries();
            applyCandles();
            buildStudies();
            emitReadout();
            options.onPriceSeries?.(price);
        },
        setTimeVisible: (visible) => chart.timeScale().applyOptions({ timeVisible: visible }),
        setWatermark: (next) => {
            watermarkText = next;
            applyWatermark();
        },
        screenshot: () => {
            try {
                return chart.takeScreenshot();
            } catch {
                return null;
            }
        },
        // `fitContent()` waits on the chart's own layout pass, so a pane fitted while its container
        // is still settling keeps the default window instead of the data. The logical range is the
        // same intent, applied immediately and deterministically.
        readAt,
        subscribeReadout: (listener) => {
            readoutListeners.add(listener);
            // Immediately, so a legend mounted after the chart opens full instead of empty.
            listener(readAt());
            return () => {
                readoutListeners.delete(listener);
            };
        },
        subscribeHover: (listener) => {
            hoverListeners.add(listener);
            listener({ readout: readAt(), point: hoverPoint });
            return () => {
                hoverListeners.delete(listener);
            };
        },
        fit: () => {
            const count = bars().length;
            if (count === 0) {
                chart.timeScale().fitContent();
                return;
            }
            chart.timeScale().setVisibleLogicalRange({ from: -1, to: count + 1 });
        },
        goToTime: (time) => {
            const list = seriesBars();
            const index = nearestBarIndex(list.map((bar) => bar.time), time);
            if (index < 0) return;
            const current = chart.timeScale().getVisibleLogicalRange();
            const span = current ? Math.max(10, current.to - current.from) : Math.min(list.length, 120);
            chart.timeScale().setVisibleLogicalRange(centredRange(index, list.length, span));
        },
        isAtLatest: () => {
            const count = seriesBars().length;
            return isAtLatest(chart.timeScale().getVisibleLogicalRange(), count);
        },
        toLatest: () => {
            const count = seriesBars().length;
            if (count === 0) return;
            chart.timeScale().setVisibleLogicalRange(latestRange(chart.timeScale().getVisibleLogicalRange(), count));
        },
        destroy: () => {
            torn = true;
            studyRequests.clear();
            readoutListeners.clear();
            hoverListeners.clear();
            chart.unsubscribeCrosshairMove(handleCrosshair);
            if (options.onRangeChange) chart.timeScale().unsubscribeVisibleLogicalRangeChange(options.onRangeChange);
            resizeObserver?.disconnect();
            chart.remove();
        },
    };

    applyCandles();
    options.onPriceSeries?.(price);
    // The page's own panes (compare) go under the price and above the oscillators.
    options.extend?.(host);
    buildStudies();

    chart.subscribeCrosshairMove(handleCrosshair);

    if (options.onRangeChange) {
        // v5 returns void from subscribe*, so the handler is kept on the options and unsubscribed by destroy.
        chart.timeScale().subscribeVisibleLogicalRangeChange(options.onRangeChange);
    }

    // A resize moves every price and time coordinate without changing the visible range, so the
    // range subscription alone would leave an overlay (the drawings layer) painted at the old
    // geometry — and a click would miss the shape it can see. Watching the box repaints it.
    const resizeObserver =
        options.onRangeChange && typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => options.onRangeChange?.())
            : null;
    resizeObserver?.observe(container);

    return host;
}

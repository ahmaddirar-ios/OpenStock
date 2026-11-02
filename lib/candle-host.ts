// One place that builds a candle chart. The symbol page (YahooChart) and the grid's panes both come
// through here, so theme colours, the volume overlay and the indicator panes are defined once.
// Browser-only: it needs a real element and the page's computed CSS tokens.

import {
    AreaSeries,
    BarSeries,
    PriceScaleMode,
    CandlestickSeries,
    HistogramSeries,
    LineSeries,
    createChart,
    type IChartApi,
    type ISeriesApi,
    type MouseEventParams,
    type SeriesType,
    type UTCTimestamp,
} from 'lightweight-charts';
import { heikinAshi, type ChartType, type ScaleMode } from '@/lib/chart-view';
import { readoutAt, type BarReadout, type ReadoutSeries } from '@/lib/chart-readout';
import {
    STUDIES,
    STUDY_COLOR_SOURCES,
    studyColor,
    studyWidth,
    type ColorToken,
    type StudyConfig,
    type StudyWidth,
} from '@/lib/chart-studies';
import type { Series } from '@/lib/indicators';
import type { CandleSet } from '@/lib/yahoo-candles';

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
    /** Replaces every study on the chart: overlays on the price, oscillators in their own panes. */
    setStudies: (studies: StudyConfig[]) => void;
    /** Redraws the same candles as bodies, hollow bodies, Heikin Ashi, bars, a line or an area. */
    setChartType: (type: ChartType) => void;
    /** Spaces the right axis arithmetically, logarithmically, or as percent from the base bar. */
    setScaleMode: (mode: ScaleMode) => void;
    setTimeVisible: (visible: boolean) => void;
    fit: () => void;
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
    destroy: () => void;
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
) => {
    if (points.length === 0) return null;
    const series = chart.addSeries(LineSeries, { color, lineWidth, priceLineVisible: false, lastValueVisible: false });
    series.setData(points);
    return series;
};

export function createCandleHost(container: HTMLElement, options: CandleHostOptions = {}): CandleHost {
    const up = token('--up', '#4ade80');
    const down = token('--down', '#f87171');
    const grid = token('--line', '#1c2320');
    const upFill = token('--up', '#4ade80', 0.4);
    const downFill = token('--down', '#f87171', 0.4);

    const chart = createChart(container, {
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
            timeVisible: options.timeVisible ?? true,
            secondsVisible: false,
        },
        localization: { locale: 'en-US' },
    });

    const brand = token('--brand', '#34d399');
    const brandFill = token('--brand', '#34d399', 0.24);
    let chartType: ChartType = options.chartType ?? 'candles';

    const PRICE_SCALE_MODE: Record<ScaleMode, PriceScaleMode> = {
        linear: PriceScaleMode.Normal,
        log: PriceScaleMode.Logarithmic,
        percent: PriceScaleMode.Percentage,
    };
    const applyScaleMode = (mode: ScaleMode) => {
        // The right axis only: the volume scale keeps its own units either way.
        chart.priceScale('right').applyOptions({ mode: PRICE_SCALE_MODE[mode] });
    };
    applyScaleMode(options.scaleMode ?? 'linear');

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

    const volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        priceLineVisible: false,
        lastValueVisible: false,
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    let data: CandleSet | null = options.data ?? null;
    let studies: StudyConfig[] = options.studies ?? [];
    const overlays: ISeriesApi<'Line'>[] = [];
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
    const readoutListeners = new Set<(readout: BarReadout | null) => void>();

    const readAt = (time: number | null = hoverTime) => readoutAt(bars(), readoutSeries, time);
    const emitReadout = () => {
        const readout = readAt();
        for (const listener of readoutListeners) listener(readout);
    };

    // A time outside the candles (the empty space to the right) is "no hovered bar", which the
    // readout answers with the last bar — exactly the fallback TradingView's legend uses.
    const handleCrosshair = (param: MouseEventParams) => {
        const time = typeof param.time === 'number' ? param.time : null;
        if (time === hoverTime) return;
        hoverTime = time;
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
        return chartType === 'heikin' ? heikinAshi(candles) : candles;
    };

    const applyCandles = () => {
        const candles = bars();
        if (chartType === 'line' || chartType === 'area') {
            price.setData(candles.map((candle) => ({ time: candle.time as UTCTimestamp, value: candle.close })));
        } else {
            price.setData(
                candles.map((candle) => ({
                    time: candle.time as UTCTimestamp,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                })),
            );
        }
        volume.setData(
            candles.map((candle) => ({
                time: candle.time as UTCTimestamp,
                value: candle.volume,
                color: candle.close >= candle.open ? upFill : downFill,
            })),
        );
    };

    const clearIndicators = () => {
        for (const series of overlays.splice(0)) chart.removeSeries(series);
        for (const index of [...ownedPanes].sort((a, b) => b - a)) chart.removePane(index);
        ownedPanes = [];
    };

    const buildStudies = () => {
        clearIndicators();
        readoutSeries = {};
        const candles = bars();
        if (candles.length === 0) return;

        const oscillators = studies.filter((study) => STUDIES[study.id]?.group === 'oscillator').length;
        const stretch = oscillators > 1 ? 0.2 : 0.28;

        studies.forEach((study, index) => {
            const def = STUDIES[study.id];
            if (!def) return;
            const computed = def.compute(candles, study.params);
            // A study that cannot fill its window draws nothing and opens no empty pane.
            const drawn = def.lines.filter((spec) => computed[spec.key]?.some((value) => value != null));
            if (drawn.length === 0) return;

            // Oscillators get their own pane under the price, in the order the trader added them.
            let pane = -1;
            if (def.group === 'oscillator') {
                pane = addPane(stretch);
                ownedPanes.push(pane);
            }

            // A study-level stroke applies to all its lines; the colour only where it means nothing
            // structural — `studyColor` refuses an override on a multi-line study.
            const width = studyWidth(study);

            for (const spec of drawn) {
                const values = computed[spec.key];
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
                                color: resolveColor(studyColor(study, spec)),
                                lineWidth: width,
                                priceLineVisible: false,
                                lastValueVisible: false,
                            },
                            pane,
                        )
                        .setData(points);
                } else {
                    const series = overlay(chart, points, resolveColor(studyColor(study, spec)), width);
                    if (series) overlays.push(series);
                }
            }
        });
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
        setStudies: (next) => {
            studies = next;
            buildStudies();
            emitReadout();
        },
        setScaleMode: (mode) => applyScaleMode(mode),
        setChartType: (next) => {
            if (next === chartType) return;
            chartType = next;
            chart.removeSeries(price);
            price = createPriceSeries();
            applyCandles();
            buildStudies();
            emitReadout();
            options.onPriceSeries?.(price);
        },
        setTimeVisible: (visible) => chart.timeScale().applyOptions({ timeVisible: visible }),
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
        fit: () => {
            const count = data?.candles.length ?? 0;
            if (count === 0) {
                chart.timeScale().fitContent();
                return;
            }
            chart.timeScale().setVisibleLogicalRange({ from: -1, to: count + 1 });
        },
        destroy: () => {
            readoutListeners.clear();
            chart.unsubscribeCrosshairMove(handleCrosshair);
            if (options.onRangeChange) chart.timeScale().unsubscribeVisibleLogicalRangeChange(options.onRangeChange);
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

    return host;
}

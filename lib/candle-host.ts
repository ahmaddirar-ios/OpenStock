// One place that builds a candle chart. The symbol page (YahooChart) and the grid's panes both come
// through here, so theme colours, the volume overlay and the indicator panes are defined once.
// Browser-only: it needs a real element and the page's computed CSS tokens.

import {
    CandlestickSeries,
    HistogramSeries,
    LineSeries,
    createChart,
    type IChartApi,
    type ISeriesApi,
    type MouseEventParams,
    type UTCTimestamp,
} from 'lightweight-charts';
import { readoutAt, type BarReadout, type ReadoutSeries } from '@/lib/chart-readout';
import { ema, macd, rsi, sma, type Series } from '@/lib/indicators';
import type { CandleSet } from '@/lib/yahoo-candles';

export type IndicatorFlags = { sma: boolean; ema: boolean; rsi: boolean; macd: boolean };

export const NO_INDICATORS: IndicatorFlags = { sma: false, ema: false, rsi: false, macd: false };

export type CandleHost = {
    chart: IChartApi;
    /** The candle series, which is what screen coordinates are measured against. */
    price: ISeriesApi<'Candlestick'>;
    /** Adds a pane under the price and returns its index (the compare pane uses it). */
    addPane: (stretch: number) => number;
    /** Replaces the candles without touching the view, so a live update never jumps the zoom. */
    setData: (set: CandleSet | null) => void;
    setIndicators: (flags: IndicatorFlags) => void;
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
    indicators?: IndicatorFlags;
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
const overlay = (chart: IChartApi, points: { time: UTCTimestamp; value: number }[], color: string) => {
    if (points.length === 0) return null;
    const series = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    series.setData(points);
    return series;
};

export function createCandleHost(container: HTMLElement, options: CandleHostOptions = {}): CandleHost {
    const up = token('--up', '#4ade80');
    const down = token('--down', '#f87171');
    const grid = token('--line', '#1c2320');
    const brand = token('--brand', '#34d399');
    const muted = token('--muted-foreground', '#94a3b8');
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

    const price = chart.addSeries(CandlestickSeries, {
        upColor: up,
        downColor: down,
        wickUpColor: up,
        wickDownColor: down,
        borderVisible: false,
    });

    const volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        priceLineVisible: false,
        lastValueVisible: false,
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    let data: CandleSet | null = options.data ?? null;
    let flags: IndicatorFlags = options.indicators ?? NO_INDICATORS;
    const overlays: ISeriesApi<'Line'>[] = [];
    // The panes this host owns. Everything the host adds sits under any pane the page extended, so
    // removing them from the end never touches a compare pane.
    let ownedPanes: number[] = [];
    // The legend's source: the same arrays the indicator panes are drawn from, plus the bar the
    // crosshair last stood on. Capturing them here means the legend cannot disagree with the chart.
    let readoutSeries: ReadoutSeries = {};
    let hoverTime: number | null = null;
    const readoutListeners = new Set<(readout: BarReadout | null) => void>();

    const readAt = (time: number | null = hoverTime) => readoutAt(data?.candles ?? [], readoutSeries, time);
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

    const applyCandles = () => {
        const candles = data?.candles ?? [];
        price.setData(
            candles.map((candle) => ({
                time: candle.time as UTCTimestamp,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
            })),
        );
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

    const buildIndicators = () => {
        clearIndicators();
        readoutSeries = {};
        const candles = data?.candles ?? [];
        if (candles.length === 0) return;
        const closes = candles.map((candle) => candle.close);

        if (flags.sma) {
            const values = sma(closes, 20);
            readoutSeries.sma = values;
            const series = overlay(chart, line(values, candles), brand);
            if (series) overlays.push(series);
        }
        if (flags.ema) {
            const values = ema(closes, 50);
            readoutSeries.ema = values;
            const series = overlay(chart, line(values, candles), muted);
            if (series) overlays.push(series);
        }

        // Oscillators get their own pane under the price, the way a trader expects to read them.
        const oscillators = Number(flags.rsi) + Number(flags.macd);
        if (flags.rsi) {
            const index = addPane(oscillators > 1 ? 0.2 : 0.28);
            ownedPanes.push(index);
            const values = rsi(closes, 14);
            readoutSeries.rsi = values;
            chart
                .addSeries(LineSeries, { color: brand, lineWidth: 1, priceLineVisible: false }, index)
                .setData(line(values, candles));
        }
        if (flags.macd) {
            const index = addPane(oscillators > 1 ? 0.2 : 0.28);
            ownedPanes.push(index);
            const { macd: macdLine, signal, histogram } = macd(closes);
            readoutSeries.macd = macdLine;
            readoutSeries.signal = signal;
            readoutSeries.histogram = histogram;
            chart
                .addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, index)
                .setData(
                    candles.flatMap((candle, i) => {
                        const value = histogram[i];
                        return value == null
                            ? []
                            : [{ time: candle.time as UTCTimestamp, value, color: value >= 0 ? up : down }];
                    }),
                );
            chart
                .addSeries(LineSeries, { color: brand, lineWidth: 1, priceLineVisible: false }, index)
                .setData(line(macdLine, candles));
            chart
                .addSeries(LineSeries, { color: muted, lineWidth: 1, priceLineVisible: false }, index)
                .setData(line(signal, candles));
        }
    };

    const host: CandleHost = {
        chart,
        price,
        addPane,
        setData: (set) => {
            data = set;
            applyCandles();
            buildIndicators();
            emitReadout();
        },
        setIndicators: (next) => {
            flags = next;
            buildIndicators();
            emitReadout();
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
    // The page's own panes (compare) go under the price and above the oscillators.
    options.extend?.(host);
    buildIndicators();

    chart.subscribeCrosshairMove(handleCrosshair);

    if (options.onRangeChange) {
        // v5 returns void from subscribe*, so the handler is kept on the options and unsubscribed by destroy.
        chart.timeScale().subscribeVisibleLogicalRangeChange(options.onRangeChange);
    }

    return host;
}

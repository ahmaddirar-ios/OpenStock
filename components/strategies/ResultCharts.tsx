'use client';

import { useEffect, useRef } from 'react';
import { AreaSeries, LineSeries, createChart, type UTCTimestamp } from 'lightweight-charts';
import { token } from '@/lib/candle-host';
import { tx, type Lang } from '@/lib/i18n';
import type { DrawdownPoint, EquityPoint } from '@/lib/strategies';

/** The chart is created inside a grid that may still be settling; a fit at zero width keeps the
 *  default window instead of the data, so the fit is retried until the container has a real width. */
const fitWhenSized = (el: HTMLElement, chart: ReturnType<typeof createChart>): (() => void) => {
    let tries = 0;
    let frame = requestAnimationFrame(function attempt() {
        if (el.clientWidth < 40 && tries < 40) {
            tries += 1;
            frame = requestAnimationFrame(attempt);
            return;
        }
        chart.timeScale().fitContent();
    });
    return () => cancelAnimationFrame(frame);
};

type Props = {
    equity: EquityPoint[];
    drawdown: DrawdownPoint[];
    lang: Lang;
};

/**
 * Two small charts, read together: the strategy against buy & hold as percent growth, and the
 * drawdown underneath. Both are drawn from the same equity series the metrics were computed from,
 * so the picture and the table can never disagree.
 */
export default function ResultCharts({ equity, drawdown, lang }: Props) {
    const equityRef = useRef<HTMLDivElement>(null);
    const drawRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = equityRef.current;
        if (!el || equity.length < 2) return;
        const brand = token('--brand', '#34d399');
        const muted = token('--muted-foreground', '#94a3b8');
        const grid = token('--line', '#1c2320');
        const chart = createChart(el, {
            autoSize: true,
            layout: { background: { color: 'transparent' }, textColor: token('--faint', '#7d8a84'), attributionLogo: false, fontFamily: 'inherit' },
            grid: { vertLines: { color: grid }, horzLines: { color: grid } },
            rightPriceScale: { borderColor: grid },
            timeScale: { borderColor: grid, timeVisible: false, secondsVisible: false },
            localization: { locale: 'en-US' },
        });
        const first = equity[0].value || 1;
        const benchFirst = equity[0].benchmark || 1;
        const strategy = chart.addSeries(LineSeries, { color: brand, lineWidth: 2, priceLineVisible: false });
        strategy.setData(equity.map((point) => ({ time: point.time as UTCTimestamp, value: (point.value / first - 1) * 100 })));
        const bench = chart.addSeries(LineSeries, { color: muted, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        bench.setData(equity.map((point) => ({ time: point.time as UTCTimestamp, value: (point.benchmark / benchFirst - 1) * 100 })));
        const cancelFit = fitWhenSized(el, chart);

        return () => {
            cancelFit();
            chart.remove();
        };
    }, [equity]);

    useEffect(() => {
        const el = drawRef.current;
        if (!el || drawdown.length < 2) return;
        const down = token('--down', '#f87171');
        const grid = token('--line', '#1c2320');
        const chart = createChart(el, {
            autoSize: true,
            layout: { background: { color: 'transparent' }, textColor: token('--faint', '#7d8a84'), attributionLogo: false, fontFamily: 'inherit' },
            grid: { vertLines: { color: grid }, horzLines: { color: grid } },
            rightPriceScale: { borderColor: grid },
            timeScale: { borderColor: grid, timeVisible: false, secondsVisible: false },
            localization: { locale: 'en-US' },
        });
        const series = chart.addSeries(AreaSeries, {
            lineColor: down,
            topColor: token('--down', '#f87171', 0.28),
            bottomColor: token('--down', '#f87171', 0.02),
            priceLineVisible: false,
            lastValueVisible: false,
        });
        series.setData(drawdown.map((point) => ({ time: point.time as UTCTimestamp, value: point.value * 100 })));
        const cancelFit = fitWhenSized(el, chart);

        return () => {
            cancelFit();
            chart.remove();
        };
    }, [drawdown]);

    return (
        <div className="grid gap-2.5 lg:grid-cols-2">
            <figure className="card m-0 flex flex-col gap-1.5 p-2.5">
                <figcaption className="flex items-center justify-between gap-2 px-0.5 text-[11.5px] text-faint">
                    <span>{tx(lang, 'strat.chart.equity')}</span>
                    <span className="flex items-center gap-2">
                        <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-brand" aria-hidden="true" />{tx(lang, 'strat.chart.strategy')}</span>
                        <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-muted-foreground" aria-hidden="true" />{tx(lang, 'strat.chart.benchmark')}</span>
                    </span>
                </figcaption>
                <div ref={equityRef} className="h-[220px] w-full" dir="ltr" />
            </figure>
            <figure className="card m-0 flex flex-col gap-1.5 p-2.5">
                <figcaption className="px-0.5 text-[11.5px] text-faint">{tx(lang, 'strat.chart.drawdown')}</figcaption>
                <div ref={drawRef} className="h-[220px] w-full" dir="ltr" />
            </figure>
        </div>
    );
}

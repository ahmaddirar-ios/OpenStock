'use client';

import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import { compactVolume, type BarReadout, type ReadoutKey } from '@/lib/chart-readout';
import { cn } from '@/lib/utils';

// The chart's own reading of the bar under the crosshair: O H L C, the change against the previous
// close, the volume, and the value of every indicator drawn at that bar — TradingView's legend, in
// the app's two languages. Presentation only: the numbers come from `readoutAt`, and the host hands
// them over on every crosshair move and every data change, so nothing here knows about replay.

const NAME: Record<ReadoutKey, StringKey> = {
    sma: 'chart.ind.sma',
    ema: 'chart.ind.ema',
    rsi: 'chart.ind.rsi',
    macd: 'chart.ind.macd',
    signal: 'chart.legend.signal',
    histogram: 'chart.legend.histogram',
};

/** The order the legend lists indicators in, whatever order the host happened to draw them. */
const ORDER: ReadoutKey[] = ['sma', 'ema', 'rsi', 'macd', 'signal'];

const price = (value: number, lang: Lang) => arDigits(value.toFixed(2), lang);

/** RSI reads as one decimal, MACD needs three until it grows past one, prices keep two. */
const measure = (key: ReadoutKey, value: number, lang: Lang) => {
    if (key === 'rsi') return arDigits(value.toFixed(1), lang);
    if ((key === 'macd' || key === 'signal') && Math.abs(value) < 1) return arDigits(value.toFixed(3), lang);
    return arDigits(value.toFixed(2), lang);
};

type Props = {
    lang: Lang;
    readout: BarReadout | null;
    className?: string;
};

export default function ChartLegend({ lang, readout, className }: Props) {
    if (!readout) return null;
    const t = (key: StringKey) => tx(lang, key);
    const change = readout.change;
    const percent = readout.changePercent;
    const tone = change == null ? 'text-faint' : change >= 0 ? 'text-up' : 'text-down';
    // The sign is written here rather than by the formatter, so `-0.004` never prints as `+-0.00`.
    const signed = change == null ? null : `${change >= 0 ? '+' : '-'}${Math.abs(change).toFixed(2)}`;
    const signedPercent =
        percent == null ? null : `${percent >= 0 ? '+' : '-'}${Math.abs(percent).toFixed(2)}%`;
    const drawn = ORDER.filter((key) => readout.indicators[key] != null);

    return (
        <div
            className={cn(
                // Physical `left`, not `start`: the plotting area is LTR in both languages (the
                // price axis and the canvas labels depend on it), so the legend sits by its corner.
                'pointer-events-none absolute left-3 top-2 z-[2] flex max-w-[calc(100%-5.5rem)] flex-col gap-0.5 text-[11px] leading-tight',
                className,
            )}
        >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 whitespace-nowrap">
                {(
                    [
                        ['open', 'O', readout.open],
                        ['high', 'H', readout.high],
                        ['low', 'L', readout.low],
                        ['close', 'C', readout.close],
                    ] as const
                ).map(([key, letter, number]) => (
                    <span key={key} className="inline-flex items-baseline gap-1" title={t(`chart.legend.${key}`)}>
                        <span aria-hidden="true" className="text-faint">
                            {letter}
                        </span>
                        <span className="sr-only">{t(`chart.legend.${key}`)}</span>
                        <bdi className="num text-foreground">{price(number, lang)}</bdi>
                    </span>
                ))}
                {signed != null && (
                    <span className={cn('num font-semibold', tone)}>
                        {arDigits(signed, lang)}
                        {signedPercent == null ? null : (
                            <span className="ms-1 font-normal">({arDigits(signedPercent, lang)})</span>
                        )}
                    </span>
                )}
                <span className="inline-flex items-baseline gap-1" title={t('chart.legend.volume')}>
                    <span aria-hidden="true" className="text-faint">
                        {t('chart.legend.volume')}
                    </span>
                    <bdi className="num text-muted-foreground">{arDigits(compactVolume(readout.volume), lang)}</bdi>
                </span>
            </div>

            {drawn.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 whitespace-nowrap">
                    {drawn.map((key) => (
                        <span key={key} className="inline-flex items-baseline gap-1">
                            <span className={key === 'ema' || key === 'signal' ? 'text-muted-foreground' : 'text-brand'}>
                                {t(NAME[key])}
                            </span>
                            <bdi className="num text-foreground">{measure(key, readout.indicators[key] as number, lang)}</bdi>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

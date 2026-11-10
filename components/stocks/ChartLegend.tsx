'use client';

import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import { compactVolume, type BarReadout } from '@/lib/chart/readout';
import {
    STUDIES,
    describeStudy,
    studyColor,
    studyLines,
    studyLineStyle,
    type ColorToken,
    type StudyConfig,
    type StudyId,
    type StudyLine,
} from '@/lib/chart/studies';
import { cn } from '@/lib/utils';

// The chart's own reading of the bar under the crosshair: O H L C, the change against the previous
// close, the volume, and the value of every study drawn at that bar — TradingView's legend, in the
// app's two languages. Presentation only: the numbers come from `readoutAt`, the host hands them
// over on every crosshair move and every data change, so nothing here knows about replay.

const LABEL_TONE: Record<ColorToken, string> = {
    brand: 'text-brand',
    warn: 'text-warn',
    up: 'text-up',
    down: 'text-down',
    faint: 'text-faint',
    muted: 'text-muted-foreground',
};

const price = (value: number, lang: Lang) => arDigits(value.toFixed(2), lang);

/** The oscillators that read as a bare score, so one decimal is all that means anything. */
const ONE_DECIMAL: readonly StudyId[] = ['rsi', 'stoch', 'wr', 'adx', 'cci'];

/** OBV is a running volume total, so it reads like the volume above it. */
const measure = (study: StudyId, line: StudyLine, value: number, lang: Lang) => {
    if (study === 'obv') return arDigits(compactVolume(value), lang);
    // A spread is a percentage: the sign carries the meaning, the unit says what it means.
    if (study === 'spread') return `${arDigits(value.toFixed(2), lang)}%`;
    if (ONE_DECIMAL.includes(study)) return arDigits(value.toFixed(1), lang);
    if (line.key === 'macd' || line.key === 'signal' || line.key === 'histogram') {
        return arDigits(value.toFixed(Math.abs(value) < 1 ? 3 : 2), lang);
    }
    return arDigits(value.toFixed(2), lang);
};

type Props = {
    lang: Lang;
    readout: BarReadout | null;
    studies: readonly StudyConfig[];
    className?: string;
};

export default function ChartLegend({ lang, readout, studies, className }: Props) {
    if (!readout) return null;
    const t = (key: StringKey) => tx(lang, key);
    const change = readout.change;
    const percent = readout.changePercent;
    const tone = change == null ? 'text-faint' : change >= 0 ? 'text-up' : 'text-down';
    // The sign is written here rather than by the formatter, so `-0.004` never prints as `+-0.00`.
    const signed = change == null ? null : `${change >= 0 ? '+' : '-'}${Math.abs(change).toFixed(2)}`;
    const signedPercent =
        percent == null ? null : `${percent >= 0 ? '+' : '-'}${Math.abs(percent).toFixed(2)}%`;

    return (
        <div
            className={cn(
                // Physical `left`, not `start`: the plotting area is LTR in both languages (the
                // price axis and the canvas labels depend on it), so the legend sits by its corner.
                // Clear of the drawing rail (8px inset + a 30px strip): the legend used to start under it,
                // which clipped the first characters of every line.
                'pointer-events-none absolute left-12 top-2 z-[2] flex max-w-[calc(100%-7rem)] flex-col gap-0.5 text-[11px] leading-tight',
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

            {studies.length > 0 && (
                // One study per line. A formula's label is long enough to wrap, and sharing a line
                // with the next study put its tail under this one's values.
                <div className="flex flex-col gap-0.5 whitespace-nowrap">
                    {studies.map((study, index) => {
                        const def = STUDIES[study.id];
                        if (!def) return null;
                        const lines = studyLines(study);
                        const values = lines
                            .map((line) => ({ line, value: readout.indicators[`${index}:${line.key}`] }))
                            .filter((entry): entry is { line: StudyLine; value: number } => typeof entry.value === 'number');
                        // A study with no line at all (a volume profile) still belongs in the legend by
                        // name; one whose lines are all still warming up has nothing to say yet.
                        if (values.length === 0 && lines.length > 0) return null;
                        return (
                            <span key={`${index}:${study.id}`} className="flex min-w-0 items-baseline gap-1">
                                <span className={cn('min-w-0 truncate', LABEL_TONE[lines[0] ? studyColor(study, lines[0]) : 'muted'])}>{describeStudy(study, lang)}</span>
                                {values.map(({ line, value }) => (
                                    <span
                                        key={line.key}
                                        className="inline-flex items-baseline gap-1"
                                        title={t(line.name)}
                                    >
                                        {lines.length > 1 && (
                                            <span aria-hidden="true" className={LABEL_TONE[studyLineStyle(study, line).color]}>
                                                {line.short}
                                            </span>
                                        )}
                                        <bdi className="num text-foreground">{measure(study.id, line, value, lang)}</bdi>
                                    </span>
                                ))}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

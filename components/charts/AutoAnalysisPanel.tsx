'use client';

import { Activity, RefreshCw, Sparkles, X } from 'lucide-react';
import { PATTERN_LABEL_KEY } from '@/lib/patterns';
import type { AnalysisFactor, AutoAnalysis } from '@/lib/chart/auto-analysis';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    lang: Lang;
    symbol: string;
    /** Null while the read is still in flight, or when the timeframe has too little history. */
    analysis: AutoAnalysis | null;
    loading: boolean;
    onRefresh: () => void;
    onClose: () => void;
};

const FACTOR_KEY = {
    trend: 'auto.factor.trend',
    structure: 'auto.factor.structure',
    momentum: 'auto.factor.momentum',
    macd: 'auto.factor.macd',
    volume: 'auto.factor.volume',
    position: 'auto.factor.position',
} as const;

const biasClass = (bias: AutoAnalysis['bias']) =>
    bias === 'bullish'
        ? 'bg-up-soft text-up'
        : bias === 'bearish'
          ? 'bg-down-soft text-down'
          : 'bg-hover text-muted';

const biasKey = (bias: AutoAnalysis['bias']) =>
    bias === 'bullish' ? 'auto.bias.bullish' : bias === 'bearish' ? 'auto.bias.bearish' : 'auto.bias.neutral';

/** One factor's row: what it measured, which way it leans, and how hard. */
function FactorRow({ lang, factor }: { lang: Lang; factor: AnalysisFactor }) {
    const width = Math.round(Math.abs(factor.score) * 50);
    return (
        <li className="flex items-center gap-2 py-1">
            <span className="w-20 shrink-0 text-[11.5px] text-faint">{tx(lang, FACTOR_KEY[factor.id])}</span>
            <span className="mono num w-24 shrink-0 text-[11.5px] text-muted" dir="ltr">
                {factor.value}
            </span>
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <span className="absolute inset-y-0 start-1/2 w-px bg-line-strong" />
                <span
                    className={cn(
                        'absolute inset-y-0 rounded-full',
                        factor.bias === 'bullish' && 'bg-up',
                        factor.bias === 'bearish' && 'bg-down',
                        factor.bias === 'neutral' && 'bg-line-strong',
                    )}
                    style={
                        factor.bias === 'bullish'
                            ? { insetInlineStart: '50%', width: `${width}%` }
                            : { insetInlineEnd: '50%', width: `${width}%` }
                    }
                />
            </span>
            <span className="w-10 shrink-0 text-end text-[11px] text-faint" dir="ltr">
                {factor.score > 0 ? '+' : ''}
                {factor.score.toFixed(2)}
            </span>
        </li>
    );
}

/**
 * The auto analysis panel: one chart, read mechanically. It sits over the pane it belongs to rather
 * than in a page of its own, because the whole point of the grid is to compare four reads at once —
 * which is also why it says out loud that it is not a recommendation.
 */
export default function AutoAnalysisPanel({ lang, symbol, analysis, loading, onRefresh, onClose }: Props) {
    return (
        <section
            className="absolute inset-x-2 bottom-2 top-11 z-30 flex flex-col overflow-hidden rounded-[12px] border border-line bg-card shadow-[0_18px_48px_oklch(0_0_0/0.5)]"
            aria-label={tx(lang, 'auto.title')}
        >
            <header className="flex items-center gap-2 border-b border-line px-2.5 py-1.5">
                <Sparkles className="size-3.5 text-brand-ink" />
                <span className="text-[12.5px] font-semibold">{tx(lang, 'auto.title')}</span>
                <span className="mono truncate text-[11px] text-faint" dir="ltr">
                    {symbol}
                </span>
                <button
                    type="button"
                    onClick={onRefresh}
                    className="icon-btn ms-auto size-6"
                    aria-label={tx(lang, 'chart.grid.refresh')}
                    title={tx(lang, 'chart.grid.refresh')}
                >
                    <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="icon-btn size-6"
                    aria-label={tx(lang, 'auto.close')}
                    title={tx(lang, 'auto.close')}
                >
                    <X className="size-3.5" />
                </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
                {loading && (
                    <p className="flex items-center gap-2 py-6 text-[12px] text-faint">
                        <Activity className="size-4 animate-pulse" />
                        {tx(lang, 'auto.loading')}
                    </p>
                )}

                {!loading && !analysis && <p className="py-6 text-[12px] text-faint">{tx(lang, 'auto.empty')}</p>}

                {!loading && analysis && (
                    <div className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-2">
                            <span
                                className={cn(
                                    'num rounded-[7px] px-2 py-0.5 text-[15px] font-bold',
                                    biasClass(analysis.bias),
                                )}
                                dir="ltr"
                            >
                                {arDigits(analysis.score, lang)}
                            </span>
                            <span className={cn('rounded-[7px] px-1.5 py-0.5 text-[11px] font-semibold', biasClass(analysis.bias))}>
                                {tx(lang, biasKey(analysis.bias))}
                            </span>
                            <span className="text-[11px] text-faint">
                                {tx(lang, `auto.confidence.${analysis.confidence}` as 'auto.confidence.high')}
                            </span>
                        </div>

                        <div className="relative h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                            <span
                                className={cn(
                                    'absolute inset-y-0 start-0 rounded-full',
                                    analysis.bias === 'bullish' && 'bg-up',
                                    analysis.bias === 'bearish' && 'bg-down',
                                    analysis.bias === 'neutral' && 'bg-line-strong',
                                )}
                                style={{ width: `${analysis.score}%` }}
                            />
                            <span className="absolute inset-y-0 start-1/2 w-px bg-line-strong" />
                        </div>

                        <p className="text-[12.5px] leading-snug text-muted">{tx(lang, analysis.headline)}</p>

                        <ul className="flex flex-col border-y border-line py-1">
                            {analysis.factors.map((factor) => (
                                <FactorRow key={factor.id} lang={lang} factor={factor} />
                            ))}
                        </ul>

                        {analysis.levels.length > 0 && (
                            <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-semibold text-faint">{tx(lang, 'auto.levels')}</span>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                    {analysis.levels.map((level) => (
                                        <div
                                            key={`${level.kind}-${level.price}`}
                                            className="flex items-center gap-1.5 text-[11.5px]"
                                            dir="ltr"
                                        >
                                            <span
                                                className={cn(
                                                    'w-14 shrink-0 text-[10.5px] font-semibold',
                                                    level.kind === 'support' ? 'text-up' : 'text-down',
                                                )}
                                            >
                                                {tx(lang, level.kind === 'support' ? 'auto.support' : 'auto.resistance')}
                                            </span>
                                            <span className="mono num">{level.price.toFixed(2)}</span>
                                            <span className="text-faint">×{arDigits(level.touches, lang)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {analysis.patterns.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                                <span className="text-[11px] font-semibold text-faint">{tx(lang, 'auto.patterns')}</span>
                                {analysis.patterns.map((pattern) => (
                                    <span
                                        key={pattern.id}
                                        className={cn(
                                            'rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-semibold',
                                            pattern.direction === 'bullish' ? 'bg-up-soft text-up' : 'bg-down-soft text-down',
                                        )}
                                    >
                                        {tx(lang, PATTERN_LABEL_KEY[pattern.id])}
                                        {pattern.confirmed ? ' ✓' : ''}
                                    </span>
                                ))}
                            </div>
                        )}

                        <p className="text-[11px] text-faint" dir="ltr">
                            {tx(lang, 'auto.meta')
                                .replace('{bars}', arDigits(analysis.bars, lang))
                                .replace('{atr}', arDigits(analysis.atrPercent.toFixed(2), lang))
                                .replace('{adx}', arDigits(Math.round(analysis.trendStrength), lang))}
                        </p>
                        <p className="text-[10.5px] leading-snug text-faint">{tx(lang, 'auto.disclaimer')}</p>
                    </div>
                )}
            </div>
        </section>
    );
}

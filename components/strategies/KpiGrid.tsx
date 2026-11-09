'use client';

import type { Metrics } from '@/lib/strategy/strategies';
import { tx, type Lang } from '@/lib/i18n';
import { bars, num, pct } from '@/components/strategies/format';
import { cn } from '@/lib/utils';

type Cell = { key: string; label: string; value: string; tone?: 'up' | 'down' | 'muted' };

/**
 * The twelve metrics an investment committee asks for, plus the benchmark that keeps them honest.
 * Colour is used only where it carries a verdict: the return against buy & hold, and the drawdown.
 */
export default function KpiGrid({ metrics, lang }: { metrics: Metrics; lang: Lang }) {
    const beat = metrics.totalReturn != null && metrics.benchmarkReturn != null && metrics.totalReturn >= metrics.benchmarkReturn;

    const cells: Cell[] = [
        { key: 'totalReturn', label: tx(lang, 'strat.m.totalReturn'), value: pct(metrics.totalReturn, lang), tone: metrics.totalReturn == null ? 'muted' : metrics.totalReturn >= 0 ? 'up' : 'down' },
        { key: 'benchmark', label: tx(lang, 'strat.m.benchmark'), value: pct(metrics.benchmarkReturn, lang), tone: beat ? 'muted' : 'muted' },
        { key: 'cagr', label: tx(lang, 'strat.m.cagr'), value: pct(metrics.cagr, lang), tone: metrics.cagr == null ? 'muted' : metrics.cagr >= 0 ? 'up' : 'down' },
        { key: 'sharpe', label: tx(lang, 'strat.m.sharpe'), value: num(metrics.sharpe, lang) },
        { key: 'sortino', label: tx(lang, 'strat.m.sortino'), value: num(metrics.sortino, lang) },
        { key: 'maxDD', label: tx(lang, 'strat.m.maxDD'), value: pct(metrics.maxDrawdown == null ? null : -metrics.maxDrawdown, lang), tone: 'down' },
        { key: 'maxDDBars', label: tx(lang, 'strat.m.maxDDBars'), value: bars(metrics.maxDrawdownBars, lang) },
        { key: 'profitFactor', label: tx(lang, 'strat.m.profitFactor'), value: num(metrics.profitFactor, lang) },
        { key: 'expectancy', label: tx(lang, 'strat.m.expectancy'), value: num(metrics.expectancy, lang) },
        { key: 'winRate', label: tx(lang, 'strat.m.winRate'), value: pct(metrics.winRate, lang, 1) },
        { key: 'avgWin', label: tx(lang, 'strat.m.avgWin'), value: num(metrics.avgWin, lang) },
        { key: 'avgLoss', label: tx(lang, 'strat.m.avgLoss'), value: num(metrics.avgLoss, lang) },
        { key: 'avgBars', label: tx(lang, 'strat.m.avgBars'), value: bars(metrics.avgBars, lang) },
        { key: 'exposure', label: tx(lang, 'strat.m.exposure'), value: pct(metrics.exposure, lang, 0) },
        { key: 'trades', label: tx(lang, 'strat.m.trades'), value: bars(metrics.trades, lang) },
    ];

    return (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-5">
            {cells.map((cell) => (
                <div key={cell.key} className="rounded-[10px] bg-page px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--line)]">
                    <p className="truncate text-[11px] text-faint" title={cell.label}>{cell.label}</p>
                    <p
                        dir="ltr"
                        className={cn(
                            'num text-[15px] font-semibold tabular-nums',
                            cell.tone === 'up' && 'text-up',
                            cell.tone === 'down' && 'text-down',
                            (!cell.tone || cell.tone === 'muted') && 'text-fg',
                        )}
                    >
                        {cell.value}
                    </p>
                </div>
            ))}
        </div>
    );
}

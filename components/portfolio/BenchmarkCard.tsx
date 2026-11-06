"use client";

import React from "react";
import Panel from "@/components/Panel";
import type { PortfolioBenchmark } from "@/lib/actions/portfolio.actions";
import { tx, arDigits, type Lang } from "@/lib/i18n";

const num = (value: number, lang: Lang, digits = 2) =>
    arDigits(value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }), lang);

/** A tiny line for the index series; no axes, because the number beside it carries the meaning. */
function Spark({ points, positive }: { points: { value: number }[]; positive: boolean }) {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const width = 160;
    const height = 44;
    const path = values
        .map((value, index) => {
            const x = (index / (values.length - 1)) * width;
            const y = height - ((value - min) / span) * height;
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-11 w-full" aria-hidden preserveAspectRatio="none">
            <path d={path} fill="none" stroke={positive ? 'var(--up)' : 'var(--down)'} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

export default function BenchmarkCard({
    benchmark,
    portfolioReturnPct,
    lang,
}: {
    benchmark: PortfolioBenchmark | null;
    portfolioReturnPct: number;
    lang: Lang;
}) {
    const tone = (value: number) => (value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-foreground');

    if (!benchmark) {
        return (
            <Panel title={tx(lang, 'pf.benchmark')} sub={tx(lang, 'pf.benchmarkSub')} className="self-start">
                <p className="px-3.5 py-3 text-[13px] text-faint">{tx(lang, 'pf.benchmarkUnavailable')}</p>
            </Panel>
        );
    }

    const diff = portfolioReturnPct - benchmark.returnPct;
    const start = new Date(benchmark.startDate);
    const end = new Date(benchmark.endDate);
    const range = `${arDigits(start.toLocaleDateString(lang === 'ar' ? 'ar-u-nu-arab' : 'en-GB', { month: 'short', year: 'numeric' }), lang)} — ${arDigits(end.toLocaleDateString(lang === 'ar' ? 'ar-u-nu-arab' : 'en-GB', { month: 'short', year: 'numeric' }), lang)}`;

    return (
        <Panel title={tx(lang, 'pf.benchmark')} sub={tx(lang, 'pf.benchmarkSub')} className="self-start">
            <div className="flex flex-col gap-3 px-3.5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                    <div>
                        <p className="kicker text-faint">{tx(lang, 'pf.portfolioReturn')}</p>
                        <p className={`num mt-1 text-xl font-bold ${tone(portfolioReturnPct)}`}>
                            {portfolioReturnPct > 0 ? '+' : ''}{num(portfolioReturnPct, lang)}%
                        </p>
                    </div>
                    <div className="text-end">
                        <p className="kicker text-faint" dir="ltr">{benchmark.label}</p>
                        <p className={`num mt-1 text-xl font-bold ${tone(benchmark.returnPct)}`}>
                            {benchmark.returnPct > 0 ? '+' : ''}{num(benchmark.returnPct, lang)}%
                        </p>
                    </div>
                </div>

                <Spark points={benchmark.series} positive={benchmark.returnPct >= 0} />

                <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5">
                    <span className="text-[12px] text-faint">{range}</span>
                    <span className={`num text-[12.5px] font-semibold ${tone(diff)}`}>
                        {tx(lang, diff >= 0 ? 'pf.ahead' : 'pf.behind').replace('{n}', `${num(Math.abs(diff), lang)}%`)}
                    </span>
                </div>
            </div>
        </Panel>
    );
}

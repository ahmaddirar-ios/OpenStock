"use client";

import React, { useMemo, useState } from "react";
import Panel from "@/components/Panel";
import type { EquityPoint } from "@/lib/portfolio-ledger";
import { tx, arDigits, type Lang } from "@/lib/i18n";

const num = (value: number, lang: Lang, digits = 2) =>
    arDigits(value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }), lang);

const dateLabel = (seconds: number, lang: Lang) =>
    arDigits(
        new Date(seconds * 1000).toLocaleDateString(lang === 'ar' ? 'ar-u-nu-arab' : 'en-GB', { day: '2-digit', month: 'short' }),
        lang
    );

/**
 * The equity curve: portfolio value against its cost basis, day by day. Two lines, no axes clutter —
 * the shape is the story, and the numbers live in the header. Hovering picks the nearest day.
 */
export default function EquityCurveCard({ points, lang }: { points: EquityPoint[]; lang: Lang }) {
    const [hover, setHover] = useState<number | null>(null);

    const geometry = useMemo(() => {
        if (points.length < 2) return null;
        const width = 720;
        const height = 180;
        const values = points.flatMap((point) => [point.value, point.costBasis]);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const span = max - min || 1;
        const x = (index: number) => (index / (points.length - 1)) * width;
        const y = (value: number) => height - ((value - min) / span) * height;
        const line = (pick: (point: EquityPoint) => number) =>
            points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(pick(point)).toFixed(1)}`).join(' ');
        const area = `${line((point) => point.value)} L${width},${height} L0,${height} Z`;
        return { width, height, min, max, x, y, valuePath: line((point) => point.value), costPath: line((point) => point.costBasis), area };
    }, [points]);

    if (points.length < 2) {
        return (
            <Panel title={tx(lang, 'pf.equity')} sub={tx(lang, 'pf.equitySub')}>
                <p className="px-3.5 py-3 text-[13px] text-faint">{tx(lang, 'pf.equityEmpty')}</p>
            </Panel>
        );
    }

    const first = points[0];
    const last = points[points.length - 1];
    const active = hover != null ? points[hover] : last;
    const gain = active.value - active.costBasis;
    const gainPct = active.costBasis > 0 ? (gain / active.costBasis) * 100 : 0;
    const tone = (value: number) => (value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-foreground');
    const periodReturn = first.costBasis > 0 ? ((last.value - last.costBasis) / last.costBasis) * 100 : 0;

    return (
        <Panel
            title={tx(lang, 'pf.equity')}
            sub={tx(lang, 'pf.equitySub')}
            action={
                <span className={`num text-[13px] font-semibold ${tone(periodReturn)}`}>
                    {periodReturn > 0 ? '+' : ''}{num(periodReturn, lang)}%
                </span>
            }
        >
            <div className="flex flex-col gap-3 px-3.5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                    <div>
                        <p className="kicker text-faint">{tx(lang, 'pf.equityValue')}</p>
                        <p className="num mt-1 text-xl font-bold text-foreground">{num(active.value, lang)}</p>
                    </div>
                    <div className="text-end">
                        <p className="kicker text-faint">{tx(lang, 'pf.equityGain')}</p>
                        <p className={`num mt-1 text-xl font-bold ${tone(gain)}`}>
                            {gain > 0 ? '+' : ''}{num(gain, lang)}
                            <span className="ms-2 text-[13px] font-semibold">{gainPct > 0 ? '+' : ''}{num(gainPct, lang)}%</span>
                        </p>
                    </div>
                </div>

                <div
                    className="relative"
                    onMouseLeave={() => setHover(null)}
                    onMouseMove={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
                        setHover(Math.round(ratio * (points.length - 1)));
                    }}
                >
                    <svg viewBox={`0 0 ${geometry!.width} ${geometry!.height}`} className="h-44 w-full" preserveAspectRatio="none" aria-hidden>
                        <defs>
                            <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
                                <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <path d={geometry!.area} fill="url(#equity-fill)" />
                        <path d={geometry!.costPath} fill="none" stroke="var(--faint)" strokeWidth="1.3" strokeDasharray="4 3" />
                        <path d={geometry!.valuePath} fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                        {hover != null && (
                            <>
                                <line x1={geometry!.x(hover)} y1="0" x2={geometry!.x(hover)} y2={geometry!.height} stroke="var(--faint)" strokeWidth="1" strokeDasharray="3 3" />
                                <circle cx={geometry!.x(hover)} cy={geometry!.y(active.value)} r="3.4" fill="var(--brand)" />
                            </>
                        )}
                    </svg>
                    {hover != null && (
                        <span className="num pointer-events-none absolute top-1 rounded-md border border-line bg-page px-2 py-0.5 text-[11px] text-muted-foreground" style={{ insetInlineStart: `${(geometry!.x(hover) / geometry!.width) * 100}%` }}>
                            {dateLabel(active.time, lang)}
                        </span>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5 text-[12px] text-faint">
                    <span className="num">{dateLabel(first.time, lang)}</span>
                    <span className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded-full" style={{ background: 'var(--brand)' }} />{tx(lang, 'pf.equityValue')}</span>
                        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded-full" style={{ background: 'var(--faint)' }} />{tx(lang, 'pf.equityCost')}</span>
                    </span>
                    <span className="num">{dateLabel(last.time, lang)}</span>
                </div>
            </div>
        </Panel>
    );
}

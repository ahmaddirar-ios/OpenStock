'use client';

import Link from 'next/link';
import { LineChart } from 'lucide-react';
import ChangePill from '@/components/ChangePill';
import DataFreshness from '@/components/DataFreshness';
import { tadawulAppSymbol, type YahooDailyQuote } from '@/lib/yahoo';
import { useLiveQuotes } from '@/hooks/useLiveQuotes';
import { tx, type Lang } from '@/lib/i18n';
import { saudiSymbolNameAr } from '@/lib/saudi-symbols';
import { arDigits } from "@/lib/i18n";
import Price from '@/components/Price';

const formatAmount = (value: number) =>
    value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Pulse tile priced from Yahoo quotes (SAR). Used for Tadawul, whose TradingView quote widgets are blocked in free embeds.
// While the Riyadh session runs it polls /api/quotes, so the price follows Yahoo's ~15-minute feed instead of waiting for a reload.
export default function SaudiPulseTile({ tvSymbol, label, quote, lang }: { tvSymbol: string; label: string; quote: YahooDailyQuote | null; lang: Lang }) {
    const live = useLiveQuotes([tvSymbol])[tvSymbol];
    const appSymbol = tadawulAppSymbol(tvSymbol);
    // The Arabic table names the company the way the Arabic press does; the market config is English.
    const title = (lang === 'ar' && appSymbol ? saudiSymbolNameAr(appSymbol) : null) ?? label;
    const price = live?.c ?? quote?.price ?? null;
    const changePercent = live?.dp ?? quote?.changePercent ?? null;
    const change = live?.d ?? quote?.change ?? null;
    const body = (
        <>
            <div className="bento-head">
                <span className="bento-ico"><LineChart /></span>
                <span className="truncate">{title}</span>
                <span className="mono ms-auto text-xs text-faint">{tvSymbol.replace('TADAWUL:', '')}</span>
            </div>
            <p className="bento-value self-start num">
                {price != null ? <Price value={price} currency="SAR" lang={lang} /> : '—'}
            </p>
            <div className="bento-foot">
                {price != null ? (
                    <>
                        <ChangePill value={changePercent ?? undefined} lang={lang} />
                        <span className="num truncate">
                            {/* <bdi> keeps the signed number a single left-to-right run; without it
                                Arabic renders "-0.08" as "0.08-". */}
                            <bdi>{change != null && change > 0 ? '+' : ''}{arDigits(formatAmount(change ?? 0), lang)}</bdi> {tx(lang, 'tile.prevClose')}
                        </span>
                    </>
                ) : (
                    <span>{tx(lang, 'tile.noQuote')}</span>
                )}
            </div>
            <DataFreshness tradeTime={live?.t} delayed lang={lang} />
        </>
    );
    // The TASI index has no stock page
    if (!appSymbol) return <div className="bento-tile">{body}</div>;
    return <Link href={`/stocks/${appSymbol}`} className="bento-tile transition-colors hover:bg-hover/60">{body}</Link>;
}

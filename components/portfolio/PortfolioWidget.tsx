import Link from 'next/link';
import { ArrowUpRight, Wallet } from 'lucide-react';
import Panel from '@/components/Panel';
import Price from '@/components/Price';
import ChangePill from '@/components/ChangePill';
import { getPortfolioSummary } from '@/lib/actions/portfolio.actions';
import { tx, arDigits, type Lang } from '@/lib/i18n';

/**
 * The overview's portfolio line: what the book is worth, how the day moved it, and the open profit.
 * It reads the same ledger the portfolio page does, so the two can never disagree. With nothing
 * held it says so and points at the page instead of printing zeros.
 */
export default async function PortfolioWidget({ lang }: { lang: Lang }) {
    const summary = await getPortfolioSummary().catch(() => null);

    return (
        <Panel
            title={tx(lang, 'pf.title')}
            sub={summary ? tx(lang, 'pf.widgetSub').replace('{n}', arDigits(summary.count, lang)) : tx(lang, 'pf.widgetEmptySub')}
            dense
            action={
                <Link href="/portfolio" className="pill h-7 px-2.5 text-[12px] transition-colors hover:bg-hover">
                    {tx(lang, 'pf.open')} <ArrowUpRight className="size-3.5" />
                </Link>
            }
        >
            {summary ? (
                <div className="flex items-center justify-between gap-3 px-3.5 py-3">
                    <div className="min-w-0">
                        <p className="kicker text-faint">{tx(lang, 'pf.equityValue')}</p>
                        <p className="num mt-1 truncate text-lg font-bold text-foreground">
                            <Price value={summary.value} currency={summary.currency} lang={lang} />
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <ChangePill value={summary.dayChangePct} lang={lang} />
                        <span className={`num text-[12px] font-semibold ${summary.openPnl > 0 ? 'text-up' : summary.openPnl < 0 ? 'text-down' : 'text-muted-foreground'}`}>
                            {summary.openPnl > 0 ? '+' : ''}
                            <Price value={summary.openPnl} currency={summary.currency} lang={lang} />
                        </span>
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-3 px-3.5 py-3">
                    <span className="empty-icon size-8"><Wallet className="size-4" /></span>
                    <p className="text-[13px] text-faint">{tx(lang, 'pf.widgetEmpty')}</p>
                </div>
            )}
        </Panel>
    );
}

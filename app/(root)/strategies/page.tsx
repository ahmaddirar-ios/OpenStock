import Link from 'next/link';
import { Wand2 } from 'lucide-react';
import StrategyIndex from '@/components/strategies/StrategyIndex';
import SavedStrategies from '@/components/strategies/SavedStrategies';
import { getLang } from '@/lib/i18n-server';
import { tx } from '@/lib/i18n';

// The library is content plus pure logic, so the index needs no data of its own: the filters and the
// cards run in the browser, and every strategy's numbers are computed only when a lab is asked to run.
export default async function StrategiesPage() {
    const lang = await getLang();

    return (
        <>
            <header className="page-head">
                <div>
                    <h1 className="page-title">{tx(lang, 'strat.title')}</h1>
                    <p className="page-sub">{tx(lang, 'strat.sub')}</p>
                </div>
            </header>

            <Link
                href="/strategies/custom"
                className="card group flex flex-wrap items-center gap-3 p-3.5 transition-colors hover:bg-hover"
            >
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand/12 text-brand">
                    <Wand2 className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-fg">{tx(lang, 'cs.ctaTitle')}</span>
                    <span className="block text-[12px] leading-relaxed text-muted-foreground">{tx(lang, 'cs.ctaBody')}</span>
                </span>
                <span className="text-[11.5px] text-brand">{tx(lang, 'cs.ctaOpen')} →</span>
            </Link>

            <SavedStrategies lang={lang} />

            <StrategyIndex lang={lang} />
        </>
    );
}

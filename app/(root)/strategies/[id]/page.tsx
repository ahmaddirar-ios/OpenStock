import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import StrategyLab from '@/components/strategies/StrategyLab';
import { STRATEGY_LIBRARY, strategyById } from '@/lib/strategy/library';
import { getLang } from '@/lib/i18n-server';
import { tx, type Lang } from '@/lib/i18n';

type Props = {
    params: Promise<{ id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const pick = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export function generateStaticParams() {
    return STRATEGY_LIBRARY.map((doc) => ({ id: doc.id }));
}

function Section({ title, body }: { title: string; body: string }) {
    return (
        <section className="flex flex-col gap-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-faint">{title}</h2>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{body}</p>
        </section>
    );
}

export default async function StrategyPage({ params, searchParams }: Props) {
    const { id } = await params;
    const doc = strategyById(id);
    if (!doc) notFound();

    const [lang, query] = await Promise.all([getLang(), searchParams]);
    const l = lang as Lang;
    const ar = l === 'ar';
    const symbol = pick(query.symbol);

    return (
        <>
            <header className="page-head">
                <div className="flex flex-col gap-1.5">
                    <Link href="/strategies" className="inline-flex items-center gap-1.5 text-[12px] text-faint hover:text-fg">
                        <ArrowLeft className="size-3.5 rtl:rotate-180" /> {tx(l, 'nav.strategies')}
                    </Link>
                    <h1 className="page-title">{ar ? doc.nameAr : doc.name}</h1>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="pill h-6 px-2 text-[11px]">{tx(l, `strat.cat.${doc.category}` as const)}</span>
                        <span className="pill h-6 px-2 text-[11px] text-faint">
                            {tx(l, 'strat.card.best')} {ar ? doc.timeframe.ar : doc.timeframe.en}
                        </span>
                    </div>
                </div>
            </header>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.55fr)] lg:items-start">
                <article className="card flex flex-col gap-3 p-3.5">
                    <Section title={tx(l, 'strat.doc.idea')} body={ar ? doc.ideaAr : doc.idea} />

                    <section className="flex flex-col gap-1">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-faint">{tx(l, 'strat.doc.formula')}</h2>
                        <pre
                            dir="ltr"
                            className="mono overflow-x-auto rounded-[10px] bg-page px-3 py-2 text-[12px] leading-relaxed text-fg shadow-[inset_0_0_0_1px_var(--line)]"
                        >
                            {doc.formula.join('\n')}
                        </pre>
                    </section>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Section title={tx(l, 'strat.doc.entry')} body={ar ? doc.entryAr : doc.entry} />
                        <Section title={tx(l, 'strat.doc.exit')} body={ar ? doc.exitAr : doc.exit} />
                        <Section title={tx(l, 'strat.doc.risk')} body={ar ? doc.riskAr : doc.risk} />
                        <Section title={tx(l, 'strat.doc.failure')} body={ar ? doc.failureAr : doc.failure} />
                    </div>

                    <section className="flex flex-col gap-1 rounded-[10px] bg-page/60 px-3 py-2 shadow-[inset_0_0_0_1px_var(--line)]">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-faint">{tx(l, 'strat.doc.assumptions')}</h2>
                        <p className="text-[12px] leading-relaxed text-muted-foreground">{tx(l, 'strat.doc.assumptionsBody')}</p>
                    </section>
                </article>

                <div className="flex flex-col gap-2">
                    <h2 className="px-0.5 text-[13px] font-semibold">{tx(l, 'strat.lab.title')}</h2>
                    <StrategyLab doc={doc} lang={l} initialSymbol={symbol} />
                </div>
            </div>
        </>
    );
}

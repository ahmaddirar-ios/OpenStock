'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Search } from 'lucide-react';
import { STRATEGY_LIBRARY, CATEGORY_KEYS, type StrategyCategory } from '@/lib/strategy-library';
import { tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** The library index: search over names and ideas, and filter by the four families of rule. */
export default function StrategyIndex({ lang }: { lang: Lang }) {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<StrategyCategory | 'all'>('all');

    const docs = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return STRATEGY_LIBRARY.filter((doc) => {
            if (category !== 'all' && doc.category !== category) return false;
            if (!needle) return true;
            const haystack = [doc.name, doc.nameAr, doc.idea, doc.ideaAr, doc.category].join(' ').toLowerCase();
            return haystack.includes(needle);
        });
    }, [query, category]);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
                <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-[10px] bg-card px-3 shadow-[inset_0_0_0_1px_var(--line)] focus-within:ring-2 focus-within:ring-ring">
                    <Search className="size-4 shrink-0 text-faint" aria-hidden="true" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={tx(lang, 'strat.search')}
                        aria-label={tx(lang, 'strat.search')}
                        className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
                    />
                </label>
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label={tx(lang, 'strat.search')}>
                    <button
                        type="button"
                        onClick={() => setCategory('all')}
                        aria-pressed={category === 'all'}
                        className={cn('pill h-8 px-3 text-[12.5px]', category === 'all' && 'is-up')}
                    >
                        {tx(lang, 'strat.all')}
                    </button>
                    {CATEGORY_KEYS.map((key) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setCategory(key)}
                            aria-pressed={category === key}
                            className={cn('pill h-8 px-3 text-[12.5px]', category === key && 'is-up')}
                        >
                            {tx(lang, `strat.cat.${key}` as const)}
                        </button>
                    ))}
                </div>
            </div>

            {docs.length === 0 ? (
                <div className="card flex flex-col items-center gap-2 p-8 text-center">
                    <p className="text-[13.5px] text-muted-foreground">{tx(lang, 'strat.empty')}</p>
                    <button
                        type="button"
                        className="pill h-8 px-3 text-[12.5px]"
                        onClick={() => {
                            setQuery('');
                            setCategory('all');
                        }}
                    >
                        {tx(lang, 'strat.reset')}
                    </button>
                </div>
            ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {docs.map((doc) => (
                        <Link
                            key={doc.id}
                            href={`/strategies/${doc.id}`}
                            className="card group flex flex-col gap-2 p-3.5 transition-colors hover:bg-hover"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <h2 className="text-[14.5px] font-semibold text-fg">{lang === 'ar' ? doc.nameAr : doc.name}</h2>
                                <ArrowUpRight className="size-4 shrink-0 text-faint transition-colors group-hover:text-brand" aria-hidden="true" />
                            </div>
                            <p className="line-clamp-3 text-[12.5px] leading-relaxed text-muted-foreground">
                                {lang === 'ar' ? doc.ideaAr : doc.idea}
                            </p>
                            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="pill h-6 px-2 text-[11px]">{tx(lang, `strat.cat.${doc.category}` as const)}</span>
                                <span className="pill h-6 px-2 text-[11px] text-faint">
                                    {tx(lang, 'strat.card.best')} {lang === 'ar' ? doc.timeframe.ar : doc.timeframe.en}
                                </span>
                                <span className="ms-auto text-[11.5px] text-brand">{tx(lang, 'strat.card.open')}</span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Bookmark } from 'lucide-react';
import { loadStrategies } from '@/lib/actions/strategy.actions';
import { loadSavedStrategies, mergeStrategies, storeSavedStrategies, type SavedStrategy } from '@/lib/strategy-library-custom';
import { arDigits, tx, type Lang } from '@/lib/i18n';

/**
 * The trader's own shelf, on the library page rather than buried in the studio. The browser copy is
 * read first so the list is there before the account answers; the account's copy then merges in, the
 * same way the studio does it, so the two pages can never disagree about what is saved.
 */
export default function SavedStrategies({ lang }: { lang: Lang }) {
    const t = (key: Parameters<typeof tx>[1]) => tx(lang, key);
    const [saved, setSaved] = useState<SavedStrategy[]>([]);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const local = loadSavedStrategies();
        setSaved(local);
        setReady(true);
        let cancelled = false;
        loadStrategies()
            .then((result) => {
                if (cancelled || !result.ok) return;
                const merged = mergeStrategies(local, result.items);
                setSaved(merged);
                storeSavedStrategies(merged);
            })
            .catch(() => {
                /* the browser copy stands */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!ready) return null;

    return (
        <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-fg">
                    <Bookmark className="size-4 text-brand" /> {t('strat.mine')}
                </h2>
                <p className="text-[12px] text-faint">{t('strat.mine.sub')}</p>
            </div>

            {saved.length === 0 ? (
                <p className="card p-3.5 text-[12.5px] text-muted-foreground">{t('strat.mine.empty')}</p>
            ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {saved.map((entry) => (
                        <Link
                            key={entry.id}
                            href={`/strategies/custom?load=${encodeURIComponent(entry.id)}`}
                            className="card group flex flex-col gap-1.5 p-3.5 transition-colors hover:bg-hover"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="text-[13.5px] font-semibold text-fg">{entry.name}</h3>
                                <ArrowUpRight className="size-4 shrink-0 text-faint transition-colors group-hover:text-brand" aria-hidden="true" />
                            </div>
                            <p className="mono line-clamp-1 text-[11px] text-muted-foreground" dir="ltr">
                                {entry.strategy.entry}
                            </p>
                            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="pill h-6 px-2 text-[11px]">
                                    {t('strat.mine.params').replace('{n}', arDigits(String(entry.strategy.params.length), lang))}
                                </span>
                                {entry.strategy.stopPct > 0 && (
                                    <span className="pill h-6 px-2 text-[11px] text-faint">
                                        {t('strat.mine.stop').replace('{n}', arDigits(String(entry.strategy.stopPct), lang))}
                                    </span>
                                )}
                                <span className="ms-auto text-[11.5px] text-brand">{t('strat.mine.open')}</span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </section>
    );
}

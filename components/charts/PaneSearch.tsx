'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { compareYahooSymbol } from '@/lib/compare';
import { paneOwning, searchUniverse, universeName } from '@/lib/chart-grid';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    lang: Lang;
    /** Every symbol on the screen, so a duplicate can be named instead of silently swapped. */
    symbols: string[];
    paneIndex: number;
    watchlist: string[];
    onPick: (symbol: string) => void;
    onClose: () => void;
};

/**
 * The pane's symbol field. Matching happens against the local universe — 906 companies with their
 * Arabic names — so it answers on the first keystroke, and a suffix symbol outside the universe is
 * still accepted when it resolves. The watchlist row is the fast path for symbols already followed.
 */
export default function PaneSearch({ lang, symbols, paneIndex, watchlist, onPick, onClose }: Props) {
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const results = useMemo(() => (query.trim() ? searchUniverse(query, 6) : []), [query]);
    const quickPicks = watchlist.slice(0, 8);

    const choose = (symbol: string) => {
        const owner = paneOwning(symbols, symbol, paneIndex);
        if (owner >= 0) {
            setError(tx(lang, 'chart.grid.duplicate').replace('{n}', arDigits(owner + 1, lang)));
            return;
        }
        onPick(symbol);
    };

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const symbol = compareYahooSymbol(query);
        if (!symbol) {
            setError(tx(lang, 'chart.grid.searchError'));
            return;
        }
        choose(symbol);
    };

    return (
        <div className="absolute inset-x-0 top-full z-40 mt-1 flex flex-col gap-1.5 rounded-[12px] bg-card p-2 shadow-[0_0_0_1px_var(--line),0_16px_40px_oklch(0_0_0/0.5)]">
            <form onSubmit={submit} className="flex gap-1.5">
                <div className="flex h-8 flex-1 items-center gap-1.5 rounded-[8px] bg-page px-2 shadow-[inset_0_0_0_1px_var(--line)] focus-within:ring-2 focus-within:ring-ring">
                    <Search className="size-3.5 shrink-0 text-faint" aria-hidden="true" />
                    <input
                        ref={inputRef}
                        value={query}
                        dir="auto"
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setError(null);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') onClose();
                        }}
                        placeholder={tx(lang, 'chart.grid.search')}
                        aria-label={tx(lang, 'chart.grid.search')}
                        className="mono h-full w-full bg-transparent text-[12px] outline-none placeholder:font-sans placeholder:text-faint"
                    />
                </div>
                <button type="submit" className="pill h-8 px-2.5" aria-label={tx(lang, 'chart.grid.choose')}>
                    {tx(lang, 'chart.grid.choose')}
                </button>
            </form>

            <p className="px-1 text-[11px] leading-relaxed text-faint">{tx(lang, 'chart.grid.searchHint')}</p>

            {error && <p className="px-1 text-[11.5px] text-down" role="alert">{error}</p>}

            {query.trim() ? (
                results.length > 0 ? (
                    <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                        {results.map((entry) => {
                            const name = (lang === 'ar' && entry.nameAr) || entry.name;
                            return (
                                <li key={entry.symbol}>
                                    <button
                                        type="button"
                                        onClick={() => choose(entry.symbol)}
                                        className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-start hover:bg-hover"
                                    >
                                        <span className="mono text-[12px] font-semibold" dir="ltr">{entry.symbol}</span>
                                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-faint">{name}</span>
                                        <span className="text-[10.5px] uppercase text-faint">{entry.exchange}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="px-1 text-[11.5px] text-faint">{tx(lang, 'chart.grid.noResults')}</p>
                )
            ) : (
                quickPicks.length > 0 && (
                    <div className="flex flex-col gap-1">
                        <p className="px-1 text-[11px] text-faint">{tx(lang, 'chart.grid.watchlist')}</p>
                        <div className="flex flex-wrap gap-1">
                            {quickPicks.map((symbol) => (
                                <button
                                    key={symbol}
                                    type="button"
                                    onClick={() => choose(symbol)}
                                    title={universeName(symbol, lang) ?? symbol}
                                    className={cn('pill mono h-7 px-2 text-[11.5px]')}
                                >
                                    {symbol}
                                </button>
                            ))}
                        </div>
                    </div>
                )
            )}
        </div>
    );
}

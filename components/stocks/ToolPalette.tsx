'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { groupedTools, searchTools, toolTotal, type ToolEntry } from '@/lib/tools/catalog';
import { toolIcon } from '@/lib/tools/icons';

/**
 * One field over every tool the chart has: the 77 drawings, the 27 studies, the 11 chart types and
 * the 15 formula functions, read from the catalog so the list cannot go stale.
 *
 * Typing searches every tool by its Arabic or English name, by a synonym, or by the function name.
 * An empty field shows the sections in the order the rail uses, which is what makes the panel a map
 * of the chart rather than a second menu. Enter takes the first result, so "fib" and a return key
 * arms the tool without the mouse.
 */
export default function ToolPalette({
    lang,
    onInsert,
    onClose,
    className,
}: {
    lang: Lang;
    onInsert: (entry: ToolEntry) => void;
    onClose: () => void;
    className?: string;
}) {
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const results = useMemo(() => searchTools(query), [query]);
    // A search answers with a ranked flat list; an empty query answers with the catalog's sections,
    // which is the "where is everything" view.
    const sections = useMemo(() => (query.trim() ? null : groupedTools()), [query]);

    // The badge is only worth its space where families are mixed: under a section header the
    // heading already says what everything in it is.
    const renderRow = (entry: ToolEntry, showFamily: boolean) => {
        const Icon = toolIcon(entry);
        return (
        <button
            key={entry.id}
            type="button"
            onClick={() => onInsert(entry)}
            className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-start transition-colors hover:bg-hover"
        >
            <Icon className="size-3.5 shrink-0 text-faint" aria-hidden />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-foreground">{tx(lang, entry.nameKey)}</span>
                <span className="block truncate text-[10.5px] text-faint">{describe(entry, lang)}</span>
            </span>
            {showFamily && (
                <span className="pill shrink-0 text-[10px]">{tx(lang, `tools.family.${entry.family}` as StringKey)}</span>
            )}
        </button>
        );
    };

    return (
        <div
            role="dialog"
            aria-label={tx(lang, 'tools.palette')}
            className={cn(
                // Physically right-anchored, in both directions: the button sits right of centre in
                // either layout, so the panel has to grow leftwards. A logical `end-0` flips with the
                // page direction and pushed the panel off-screen in Arabic.
                'tool-palette absolute right-0 z-30 mt-1 flex max-h-[26rem] w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col rounded-[12px] bg-card p-2 shadow-[0_0_0_1px_var(--line),0_16px_40px_oklch(0_0_0/0.5)]',
                className,
            )}
        >
            <div className="flex items-center gap-2">
                <Search className="size-3.5 shrink-0 text-faint" />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    dir="auto"
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') onClose();
                        // The first result is the one a searcher meant; the mouse stays optional.
                        if (event.key === 'Enter' && results.length > 0) onInsert(results[0]);
                    }}
                    placeholder={tx(lang, 'tools.searchPlaceholder')}
                    aria-label={tx(lang, 'tools.searchPlaceholder')}
                    className="h-8 min-w-0 flex-1 rounded-[8px] bg-page px-2 text-[12.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <button type="button" onClick={onClose} aria-label={tx(lang, 'dialog.close')} className="icon-btn size-7">
                    <X className="size-3.5" />
                </button>
            </div>
            <p className="px-1 pt-1.5 text-[10.5px] text-faint">{tx(lang, 'tools.paletteHint')}</p>

            <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {sections
                    ? sections.map((group) => (
                        <section key={group.section.id} className="mb-1">
                            <h3 className="sticky top-0 z-10 bg-card px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-faint">
                                {tx(lang, group.section.nameKey)}
                            </h3>
                            {group.tools.map((entry) => renderRow(entry, false))}
                        </section>
                    ))
                    : results.length > 0
                        ? results.map((entry) => renderRow(entry, true))
                        : (
                            <p className="px-2 py-4 text-center text-[12px] text-faint">
                                {tx(lang, 'tools.searchEmpty').replace('{q}', query.trim())}
                            </p>
                        )}
            </div>

            <p className="border-t border-line px-2 pt-1.5 text-[10.5px] text-faint">
                {tx(lang, 'tools.results')
                    .replace('{n}', arDigits(query.trim() ? results.length : toolTotal(), lang))
                    .replace('{total}', arDigits(toolTotal(), lang))}
            </p>
        </div>
    );
}

/** The one line under a tool's name: what it is for, or how it is placed. */
function describe(entry: ToolEntry, lang: Lang): string {
    if (entry.family === 'formula' && entry.example) return entry.example;
    const family = tx(lang, `tools.family.${entry.family}` as StringKey);
    if (entry.section === 'cursor') return family; // a cursor is clicked, not drawn
    if (entry.hotkey) return `${family} · ${entry.hotkey.toUpperCase()}`;
    if (entry.family !== 'drawing') return family;
    const clicks = entry.clicks ?? 1;
    const key: StringKey = clicks === 1 ? 'tools.place.1' : clicks === 2 ? 'tools.place.2' : 'tools.place.3';
    return `${family} · ${tx(lang, key)}`;
}

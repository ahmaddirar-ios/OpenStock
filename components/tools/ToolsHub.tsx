'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import type { Role } from '@/lib/authz';
import type { Feature } from '@/lib/plans';
import { PAGE_SECTIONS, visiblePages, type PageDef } from '@/lib/shell/pages';

/**
 * The index of the terminal: every destination the signed-in role can open, grouped by the same
 * sections the rail uses, with one filter box. It reads `PAGES` directly, so a page added to the
 * shell appears here without a second edit.
 */
const ToolsHub = ({ lang, role, features }: { lang: Lang; role: Role; features: readonly Feature[] }) => {
    const [query, setQuery] = useState('');

    const groups = useMemo(() => {
        const needle = query.trim().toLowerCase();
        // The hub indexes destinations; it is not one of them. Listing itself under a "Tools"
        // heading only ever read as a duplicate of the page the reader is standing on.
        const pages = visiblePages(role, features)
            .filter((page) => page.href !== '/tools' && !page.subpage)
            .filter((page) => {
                if (!needle) return true;
                const haystack = [tx(lang, page.labelKey), page.href, ...page.keywords].join(' ').toLowerCase();
                return haystack.includes(needle);
            });
        return PAGE_SECTIONS
            // Administration is not a tool: it belongs to the account door in the menu bar, and
            // repeating it here was the main reason this page read as an unlabelled dumping ground.
            .filter((section) => section.id !== 'admin')
            .map((section) => ({
                section,
                pages: pages.filter((page) => page.section === section.id),
            }))
            .filter((group) => group.pages.length > 0);
    }, [lang, role, features, query]);

    const total = groups.reduce((sum, group) => sum + group.pages.length, 0);

    return (
        <>
            <div className="card flex items-center gap-2 p-2">
                <Search className="ms-1 size-4 shrink-0 text-faint" />
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={tx(lang, 'toolsHub.filter')}
                    aria-label={tx(lang, 'toolsHub.filter')}
                    className="form-input border-0 bg-transparent shadow-none focus:ring-0"
                />
            </div>

            {total === 0 ? (
                <p className="empty-state">{tx(lang, 'toolsHub.empty')}</p>
            ) : (
                groups.map(({ section, pages }) => (
                    <section key={section.id} className="hatch">
                        <div className="section-head">
                            <h2 className="section-title">{tx(lang, section.labelKey)}</h2>
                            <span className="pill">{arDigits(pages.length, lang)}</span>
                        </div>
                        <div className="grid gap-2 p-3.5 sm:grid-cols-2 xl:grid-cols-3">
                            {pages.map((page: PageDef) => {
                                const Icon = page.icon;
                                return (
                                    <Link key={page.href} href={page.href} className="card group flex items-start gap-3 p-3.5 transition-colors hover:bg-hover">
                                        <span className="bento-ico"><Icon /></span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-semibold">{tx(lang, page.labelKey)}</span>
                                            <span className="mt-0.5 block truncate text-[12px] text-faint" dir="ltr">{page.href}</span>
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                ))
            )}
        </>
    );
};

export default ToolsHub;

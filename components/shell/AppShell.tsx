'use client';

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/shell/Sidebar";
import TabBar from "@/components/shell/TabBar";
import MenuBar from "@/components/shell/MenuBar";
import ShortcutSheet, { openShortcuts } from "@/components/shell/ShortcutSheet";
import { MarketStrip, NoticeBar, StatusBar } from "@/components/shell/TerminalBars";
import SearchCommand from "@/components/SearchCommand";
import { cn } from "@/lib/utils";
import { langCookie, otherLang, tx, type Lang } from "@/lib/i18n";
import { LAST_SYMBOL_KEY } from "@/lib/shell/command";
import { shortcutFor } from "@/lib/shell/shortcuts";
import { MotionProvider } from "@/components/motion";

type AppShellProps = {
    user: User;
    watchlist: { symbol: string; company: string }[];
    initialStocks: StockWithWatchlistStatus[];
    lang: Lang;
    children: React.ReactNode;
};

const COLLAPSED_KEY = 'openstock:sidebar-collapsed';

const AppShell = ({ user, watchlist, initialStocks, lang, children }: AppShellProps) => {
    const pathname = usePathname();
    const router = useRouter();
    const [navOpen, setNavOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [focus, setFocus] = useState(false);
    const workspaceRef = useRef<HTMLElement>(null);

    // The workspace is the scroll container, so reset it on navigation
    useEffect(() => {
        setNavOpen(false);
        workspaceRef.current?.scrollTo({ top: 0 });
        // The command bar opens a tool on "your" chart, so remember where the trader was.
        const stock = /^\/stocks\/([^/]+)/.exec(pathname);
        if (stock) {
            try { localStorage.setItem(LAST_SYMBOL_KEY, decodeURIComponent(stock[1])); } catch { /* storage unavailable */ }
        }
    }, [pathname]);

    // A collapsed navigation is a preference, like the theme: read once, then remembered.
    useEffect(() => {
        try { setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1'); } catch { /* storage unavailable */ }
    }, []);

    const toggleCollapsed = () => {
        setCollapsed((value) => {
            try { localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1'); } catch { /* storage unavailable */ }
            return !value;
        });
    };

    // ⌘K belongs to the command palette, which mounts its own listener; the rest are the shell's.
    // The sheet is the one place that names them all, so the keys and the list can never drift.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const shortcut = shortcutFor(event);
            if (!shortcut || shortcut === 'command') return;
            event.preventDefault();
            if (shortcut === 'sidebar') toggleCollapsed();
            else if (shortcut === 'language') {
                document.cookie = langCookie(otherLang(lang));
                // Refresh, not reload: the server renders in the new language and the page stays put.
                router.refresh();
            } else if (shortcut === 'sheet') {
                openShortcuts();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [lang, router]);

    return (
        <MotionProvider>
        <div className={cn('desk', collapsed && 'is-collapsed', focus && 'is-focus')}>
            <a href="#main" className="skip-link">{tx(lang, 'a11y.skip')}</a>

            <NoticeBar lang={lang} />
            <MenuBar
                lang={lang}
                userName={user.name ?? ''}
                onMenu={() => setNavOpen(true)}
                onCollapse={toggleCollapsed}
                onFocus={() => setFocus((value) => !value)}
            />
            <MarketStrip lang={lang} />

            <div className="desk-body">
                <div
                    className={cn(
                        'desk-nav min-h-0 max-lg:fixed max-lg:inset-y-0 max-lg:z-50 max-lg:w-[272px] max-lg:transition-transform max-lg:duration-200',
                        // The drawer slides in from the reading side: right in Arabic, left otherwise.
                        lang === 'ar' ? 'max-lg:right-0' : 'max-lg:left-0',
                        navOpen ? 'max-lg:translate-x-0' : lang === 'ar' ? 'max-lg:translate-x-full' : 'max-lg:-translate-x-full',
                    )}
                >
                    <Sidebar user={user} lang={lang} />
                </div>
                {navOpen && (
                    <div className="fixed inset-0 z-40 bg-page/60 backdrop-blur-[2px] lg:hidden" onClick={() => setNavOpen(false)} />
                )}

                <div className="shell-container">
                    <div className="app">
                        <TabBar onMenu={() => setNavOpen(true)} lang={lang} />
                        <main id="main" tabIndex={-1} ref={workspaceRef} className={cn('workspace', pathname === '/dashboard' && 'is-first-tab')}>
                            <div className="workspace-inner">
                                {children}
                            </div>
                        </main>
                    </div>
                </div>
            </div>

            <StatusBar lang={lang} />

            <SearchCommand initialStocks={initialStocks} lang={lang} defaultSymbol={watchlist[0]?.symbol} />
            <ShortcutSheet lang={lang} />
        </div>
        </MotionProvider>
    );
};

export default AppShell;

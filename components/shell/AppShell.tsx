'use client';

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/shell/Sidebar";
import TabBar from "@/components/shell/TabBar";
import MenuBar from "@/components/shell/MenuBar";
import ShortcutSheet, { openShortcuts } from "@/components/shell/ShortcutSheet";
import AlertNotifier from "@/components/shell/AlertNotifier";
import { MarketStrip, NoticeBar, StatusBar } from "@/components/shell/TerminalBars";
import SearchCommand from "@/components/SearchCommand";
import { cn } from "@/lib/utils";
import { langCookie, otherLang, tx, type Lang } from "@/lib/i18n";
import type { Role } from "@/lib/authz";
import type { Feature } from "@/lib/plans";
import type { SiteNotice } from "@/lib/notice";
import { LAST_SYMBOL_KEY, isSymbolLike } from "@/lib/shell/command";
import { shortcutFor } from "@/lib/shell/shortcuts";
import { MotionProvider } from "@/components/motion";
import { AccessProvider } from "@/components/shell/AccessContext";

type AppShellProps = {
    user: User;
    watchlist: { symbol: string; company: string }[];
    initialStocks: StockWithWatchlistStatus[];
    lang: Lang;
    role: Role;
    /** The account's resolved features, so locked pages never appear in the shell. */
    features: readonly Feature[];
    notice: SiteNotice | null;
    children: React.ReactNode;
};

const COLLAPSED_KEY = 'openstock:sidebar-collapsed';

const AppShell = ({ user, watchlist, initialStocks, lang, role, features, notice, children }: AppShellProps) => {
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
        // The command bar opens a tool on "your" chart, so remember where the trader was. The cookie
        // is the same fact for the server: the overview renders that symbol on its first paint.
        const stock = /^\/stocks\/([^/]+)/.exec(pathname);
        if (stock) {
            try {
                const symbol = decodeURIComponent(stock[1]);
                localStorage.setItem(LAST_SYMBOL_KEY, symbol);
                if (isSymbolLike(symbol)) {
                    document.cookie = `${LAST_SYMBOL_KEY}=${symbol}; path=/; max-age=31536000; samesite=lax`;
                }
            } catch { /* storage unavailable */ }
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
        <AccessProvider features={features}>
        <div className={cn('desk', collapsed && 'is-collapsed', focus && 'is-focus')}>
            <a href="#main" className="skip-link">{tx(lang, 'a11y.skip')}</a>

            <NoticeBar lang={lang} notice={notice} />
            <MenuBar
                lang={lang}
                userName={user.name ?? ''}
                role={role}
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
                    <Sidebar user={user} lang={lang} role={role} features={features} />
                </div>
                {navOpen && (
                    <div className="fixed inset-0 z-40 bg-page/60 backdrop-blur-[2px] lg:hidden" onClick={() => setNavOpen(false)} />
                )}

                <div className="shell-container">
                    <div className="app">
                        <TabBar onMenu={() => setNavOpen(true)} lang={lang} role={role} features={features} />
                        <main id="main" tabIndex={-1} ref={workspaceRef} className={cn('workspace', pathname === '/dashboard' && 'is-first-tab')}>
                            <div className={cn('workspace-inner', pathname === '/charts' && 'is-charts', pathname === '/dashboard' && 'is-overview')}>
                                {children}
                            </div>
                        </main>
                    </div>
                </div>
            </div>

            <StatusBar lang={lang} />

            {/* The app's own alert clock: any page open and visible checks the rules once a minute. */}
            <AlertNotifier lang={lang} />
            <SearchCommand initialStocks={initialStocks} lang={lang} role={role} features={features} defaultSymbol={watchlist[0]?.symbol} />
            <ShortcutSheet lang={lang} />
        </div>
        </AccessProvider>
        </MotionProvider>
    );
};

export default AppShell;

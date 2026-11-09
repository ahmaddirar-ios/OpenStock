'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    BellRing,
    BookOpen,
    Building2,
    CandlestickChart,
    ChevronDown,
    FlaskConical,
    Globe,
    Info,
    Keyboard,
    Landmark,
    LayoutDashboard,
    LifeBuoy,
    LogOut,
    Maximize2,
    Menu as MenuIcon,
    Minus,
    Moon,
    Search,
    ScanSearch,
    ShieldCheck,
    SlidersHorizontal,
    Star,
    Sun,
    User,
    Users,
    Wallet,
    Wrench,
    X,
    type LucideIcon,
} from 'lucide-react';
import { openSearch } from '@/components/SearchCommand';
import { openShortcuts } from '@/components/shell/ShortcutSheet';
import { signOut } from '@/lib/actions/auth.actions';
import { isStaff, type Role } from '@/lib/authz';
import { canOpen, pageByHref } from '@/lib/shell/pages';
import { langCookie, otherLang, tx, type Lang, type StringKey } from '@/lib/i18n';
import { applyTheme, readTheme, writeTheme } from '@/lib/theme';
import RovexLogo from '@/components/brand/RovexLogo';
import { cn } from '@/lib/utils';

type MenuAction = 'search' | 'theme' | 'lang' | 'shortcuts' | 'signout';

type MenuItem = {
    labelKey: StringKey;
    href?: string;
    action?: MenuAction;
    icon: LucideIcon;
    /** Drawn between groups of rows, so a menu can hold two subjects without a second menu. */
    divider?: boolean;
    /** Staff-door rows: never rendered for an ordinary account, whatever the page list says. */
    staffOnly?: boolean;
};

type MenuDef = {
    id: string;
    labelKey: StringKey;
    items: MenuItem[];
    /** The account pill, drawn as the avatar and the name instead of a text label. */
    account?: boolean;
    /** An action rather than a drop-down; `run` decides what it does. */
    action?: MenuAction;
    /** `end` pins the de-facto door (account) to the far edge of the bar. */
    align?: 'end';
};

/**
 * The bar of a terminal, not an index of pages.
 *
 * TradeView, Thinkorswim and Lightspeed all keep the top strip for the few things a trader does
 * constantly — markets, research, trade, account — and leave the long list of destinations to the
 * command palette. Before this the bar repeated the whole sidebar three times over (view, tools,
 * trade) and buried the admin door in the account drop-down, which is exactly what made it read as
 * unsorted. One menu per job now, and every row is a page the shell already owns.
 */
export const MENUS: MenuDef[] = [
    {
        id: 'markets',
        labelKey: 'menu.markets',
        items: [
            { labelKey: 'nav.overview', href: '/dashboard', icon: LayoutDashboard },
            { labelKey: 'nav.saudi', href: '/saudi', icon: Landmark },
            { labelKey: 'nav.world', href: '/world', icon: Globe },
        ],
    },
    {
        id: 'research',
        labelKey: 'menu.research',
        items: [
            { labelKey: 'nav.screener', href: '/screener', icon: SlidersHorizontal },
            { labelKey: 'nav.scanner', href: '/scanner', icon: ScanSearch },
            { labelKey: 'nav.strategies', href: '/strategies', icon: FlaskConical },
            { labelKey: 'nav.charts', href: '/charts', icon: CandlestickChart, divider: true },
            { labelKey: 'nav.tools', href: '/tools', icon: Wrench },
        ],
    },
    {
        id: 'trade',
        labelKey: 'menu.trade',
        items: [
            { labelKey: 'nav.watchlist', href: '/watchlist', icon: Star },
            { labelKey: 'nav.portfolio', href: '/portfolio', icon: Wallet },
            { labelKey: 'nav.alerts', href: '/alerts', icon: BellRing },
        ],
    },
    {
        id: 'settings',
        labelKey: 'menu.settings',
        items: [
            { labelKey: 'menu.settings.theme', action: 'theme', icon: Moon },
            { labelKey: 'menu.settings.lang', action: 'lang', icon: Globe },
            { labelKey: 'nav.help', href: '/help', icon: LifeBuoy, divider: true },
            { labelKey: 'shortcut.open', action: 'shortcuts', icon: Keyboard },
            { labelKey: 'nav.about', href: '/about', icon: Info },
            { labelKey: 'nav.terms', href: '/terms', icon: BookOpen },
        ],
    },
    {
        id: 'account',
        labelKey: 'menu.account',
        account: true,
        align: 'end',
        items: [
            { labelKey: 'nav.profile', href: '/profile', icon: User },
            // Staff tools live in the account menu, beside the profile, and only for the roles
            // that can open them. `allowed` drops each row the reader has no capability for.
            { labelKey: 'nav.admin', href: '/admin', icon: ShieldCheck, divider: true, staffOnly: true },
            { labelKey: 'admin.nav.users', href: '/admin/users', icon: Users, staffOnly: true },
            { labelKey: 'admin.nav.content', href: '/admin/content', icon: BookOpen, staffOnly: true },
            { labelKey: 'admin.nav.flags', href: '/admin/flags', icon: SlidersHorizontal, staffOnly: true },
            { labelKey: 'admin.nav.ops', href: '/admin/ops', icon: Building2, staffOnly: true },
            { labelKey: 'nav.signOut', action: 'signout', icon: LogOut, divider: true },
        ],
    },
];

type Props = {
    lang: Lang;
    userName: string;
    role: Role;
    onMenu: () => void;
    onCollapse: () => void;
    onFocus: () => void;
};

/** Rows the role can open; an action has no page, so it always stays. */
const allowed = (items: MenuItem[], role: Role): MenuItem[] => {
    const kept = items.filter((item) => {
        if (item.staffOnly && !isStaff(role)) return false;
        const page = item.href ? pageByHref(item.href) : undefined;
        return !page || canOpen(page, role);
    });
    // A divider that lost its neighbour would hang below the last row of the previous group.
    return kept.map((item, index) => ({
        ...item,
        divider: item.divider && index > 0 && index < kept.length - 1 ? true : undefined,
    }));
};

/** The page a menu row opens, for the dot that marks the current one. */
const isCurrent = (href: string | undefined, pathname: string): boolean =>
    !!href && (pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`)));

export default function MenuBar({ lang, userName, role, onMenu, onCollapse, onFocus }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const [open, setOpen] = useState<string | null>(null);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => setTheme(readTheme()), []);

    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent) => {
            if (!barRef.current?.contains(event.target as Node)) setOpen(null);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(null);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    // A menu never survives a navigation it started.
    useEffect(() => setOpen(null), [pathname]);

    const flipTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        applyTheme(next);
        writeTheme(next);
        window.dispatchEvent(new CustomEvent('rovex:theme', { detail: next }));
    };

    const flipLang = () => {
        document.cookie = langCookie(otherLang(lang));
        router.refresh();
    };

    const run = (item: { action?: MenuAction }) => {
        setOpen(null);
        if (item.action === 'search') return openSearch();
        if (item.action === 'theme') return flipTheme();
        if (item.action === 'lang') return flipLang();
        if (item.action === 'shortcuts') return openShortcuts();
        if (item.action === 'signout') {
            void signOut().then(() => router.push('/sign-in'));
        }
    };

    const fullscreen = () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
    };

    const menus = MENUS
        .map((menu) => ({ ...menu, items: allowed(menu.items, role) }))
        .filter((menu) => (menu.action ? true : menu.items.length > 0));
    const lead = menus.filter((menu) => menu.align !== 'end');
    const tail = menus.filter((menu) => menu.align === 'end');

    const drawMenu = (menu: MenuDef) => {
        // The account menubar row is the avatar and the name, the same mark as the rail.
        if (menu.account) {
            return (
                <div key={menu.id} className="menubar-menu">
                    <button
                        type="button"
                        className={cn('menubar-item menubar-account', open === menu.id && 'is-open')}
                        aria-expanded={open === menu.id}
                        aria-haspopup="menu"
                        title={userName}
                        onClick={() => setOpen((current) => (current === menu.id ? null : menu.id))}
                    >
                        <span className="menubar-avatar" aria-hidden="true">
                            {userName?.[0]?.toUpperCase() ?? '?'}
                        </span>
                        <span className="menubar-user-name">{userName}</span>
                        <ChevronDown className="size-3 opacity-60" />
                    </button>
                    {open === menu.id && (
                        <div role="menu" className="menubar-drop is-end">
                            {menu.items.map((item) => {
                                const Icon = item.icon;
                                const current = isCurrent(item.href, pathname);
                                const body = (
                                    <>
                                        <Icon className="size-3.5 shrink-0 text-faint" />
                                        <span className="flex-1">{tx(lang, item.labelKey)}</span>
                                        {current && <span className="menubar-dot" aria-hidden="true" />}
                                    </>
                                );
                                return (
                                    <span key={`${item.labelKey}:${item.href ?? item.action}`} className="contents">
                                        {item.divider && <span role="separator" className="menubar-sep" />}
                                        {item.href ? (
                                            <Link role="menuitem" href={item.href} className="menubar-row" onClick={() => setOpen(null)}>
                                                {body}
                                            </Link>
                                        ) : (
                                            <button role="menuitem" type="button" className="menubar-row" onClick={() => run(item)}>
                                                {body}
                                            </button>
                                        )}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        }

        if (menu.action) {
            return (
                <div key={menu.id} className="menubar-menu">
                    <button type="button" className="menubar-item" onClick={() => run(menu)}>
                        {tx(lang, menu.labelKey)}
                    </button>
                </div>
            );
        }

        const current = menu.items.some((item) => isCurrent(item.href, pathname));
        return (
            <div key={menu.id} className="menubar-menu">
                <button
                    type="button"
                    className={cn('menubar-item', open === menu.id && 'is-open', current && 'is-current')}
                    aria-expanded={open === menu.id}
                    aria-haspopup="menu"
                    onClick={() => setOpen((value) => (value === menu.id ? null : menu.id))}
                >
                    {tx(lang, menu.labelKey)}
                    <ChevronDown className="size-3 opacity-60" />
                </button>
                {open === menu.id && (
                    <div role="menu" className="menubar-drop">
                        {menu.items.map((item) => {
                            const Icon = item.icon;
                            const active = isCurrent(item.href, pathname);
                            const body = (
                                <>
                                    <Icon className="size-3.5 shrink-0 text-faint" />
                                    <span className="flex-1">{tx(lang, item.labelKey)}</span>
                                    {active && <span className="menubar-dot" aria-hidden="true" />}
                                </>
                            );
                            return (
                                <span key={`${item.labelKey}:${item.href}`} className="contents">
                                    {item.divider && <span role="separator" className="menubar-sep" />}
                                    <Link role="menuitem" href={item.href ?? '/'} className="menubar-row" onClick={() => setOpen(null)}>
                                        {body}
                                    </Link>
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="menubar" ref={barRef}>
            <button type="button" onClick={onMenu} className="win-btn lg:hidden" aria-label={tx(lang, 'nav.menu')}>
                <MenuIcon />
            </button>

            <Link href="/dashboard" className="menubar-brand" aria-label="Rovex">
                <RovexLogo size={20} lang={lang} />
            </Link>

            <nav className="menubar-menus" aria-label={tx(lang, 'menu.markets')}>
                {lead.map(drawMenu)}
            </nav>

            <div className="menubar-end">
                <button type="button" onClick={openSearch} className="menubar-search" aria-label={tx(lang, 'cmd.open')} title={`${tx(lang, 'cmd.open')} (⌘K)`}>
                    <Search />
                    <span>{tx(lang, 'cmd.placeholder')}</span>
                    <kbd className="kbd">⌘K</kbd>
                </button>
                <button type="button" onClick={flipTheme} className="win-btn" title={tx(lang, theme === 'dark' ? 'theme.light' : 'theme.dark')} aria-label={tx(lang, theme === 'dark' ? 'theme.light' : 'theme.dark')}>
                    {theme === 'dark' ? <Sun /> : <Moon />}
                </button>
                <nav className="menubar-menus" aria-label={tx(lang, 'menu.account')}>
                    {tail.map(drawMenu)}
                </nav>
            </div>

            <div className="win-controls" aria-hidden={false}>
                <button type="button" className="win-btn is-close" onClick={onFocus} title={tx(lang, 'win.focus')} aria-label={tx(lang, 'win.focus')}>
                    <X />
                </button>
                <button type="button" className="win-btn" onClick={fullscreen} title={tx(lang, 'win.maximize')} aria-label={tx(lang, 'win.maximize')}>
                    <Maximize2 />
                </button>
                <button type="button" className="win-btn" onClick={onCollapse} title={tx(lang, 'win.minimize')} aria-label={tx(lang, 'win.minimize')}>
                    <Minus />
                </button>
            </div>
        </div>
    );
}

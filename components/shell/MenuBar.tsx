'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    BellRing,
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
    Wallet,
    Wrench,
    X,
} from 'lucide-react';
import { openSearch } from '@/components/SearchCommand';
import { openShortcuts } from '@/components/shell/ShortcutSheet';
import { signOut } from '@/lib/actions/auth.actions';
import type { Role } from '@/lib/authz';
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
    icon: typeof Search;
};

type MenuDef = { id: string; labelKey: StringKey; items: MenuItem[] };

/**
 * The desktop menu bar: the same destinations the sidebar has, in the shape a terminal opens with.
 * It is a second door, not a second list — every row is a page or an action the shell already owns.
 */
export const MENUS: MenuDef[] = [
    {
        id: 'add',
        labelKey: 'menu.add',
        items: [
            { labelKey: 'menu.add.search', action: 'search', icon: Search },
            { labelKey: 'menu.add.chart', href: '/charts', icon: CandlestickChart },
            { labelKey: 'menu.add.alert', href: '/alerts', icon: BellRing },
        ],
    },
    {
        id: 'view',
        labelKey: 'menu.view',
        items: [
            { labelKey: 'nav.overview', href: '/dashboard', icon: LayoutDashboard },
            { labelKey: 'nav.saudi', href: '/saudi', icon: Landmark },
            { labelKey: 'nav.world', href: '/world', icon: Globe },
            { labelKey: 'nav.watchlist', href: '/watchlist', icon: Star },
            { labelKey: 'nav.portfolio', href: '/portfolio', icon: Wallet },
            { labelKey: 'nav.screener', href: '/screener', icon: SlidersHorizontal },
            { labelKey: 'nav.scanner', href: '/scanner', icon: ScanSearch },
            { labelKey: 'nav.strategies', href: '/strategies', icon: FlaskConical },
            { labelKey: 'nav.alerts', href: '/alerts', icon: BellRing },
        ],
    },
    {
        id: 'tools',
        labelKey: 'menu.tools',
        items: [
            { labelKey: 'menu.tools.all', href: '/tools', icon: Wrench },
            { labelKey: 'menu.tools.charts', href: '/charts', icon: CandlestickChart },
            { labelKey: 'menu.tools.api', href: '/api-docs', icon: Info },
        ],
    },
    {
        id: 'trade',
        labelKey: 'menu.trade',
        items: [
            { labelKey: 'nav.portfolio', href: '/portfolio', icon: Wallet },
            { labelKey: 'nav.strategies', href: '/strategies', icon: FlaskConical },
            { labelKey: 'nav.alerts', href: '/alerts', icon: BellRing },
        ],
    },
    {
        id: 'account',
        labelKey: 'menu.account',
        items: [
            { labelKey: 'nav.profile', href: '/profile', icon: User },
            // Only rendered for a staff role; the filter below drops it for everyone else.
            { labelKey: 'nav.admin', href: '/admin', icon: ShieldCheck },
            { labelKey: 'nav.signOut', action: 'signout', icon: LogOut },
        ],
    },
    {
        id: 'settings',
        labelKey: 'menu.settings',
        items: [
            { labelKey: 'menu.settings.theme', action: 'theme', icon: Moon },
            { labelKey: 'menu.settings.lang', action: 'lang', icon: Globe },
        ],
    },
    {
        id: 'help',
        labelKey: 'menu.help',
        items: [
            { labelKey: 'nav.help', href: '/help', icon: LifeBuoy },
            { labelKey: 'shortcut.open', action: 'shortcuts', icon: Keyboard },
            { labelKey: 'nav.about', href: '/about', icon: Info },
            { labelKey: 'nav.terms', href: '/terms', icon: Info },
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
const allowed = (items: MenuItem[], role: Role): MenuItem[] =>
    items.filter((item) => {
        const page = item.href ? pageByHref(item.href) : undefined;
        return !page || canOpen(page, role);
    });

export default function MenuBar({ lang, userName, role, onMenu, onCollapse, onFocus }: Props) {
    const router = useRouter();
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

    const run = (item: MenuItem) => {
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
        .filter((menu) => menu.items.length > 0);

    return (
        <div className="menubar" ref={barRef}>
            <button type="button" onClick={onMenu} className="win-btn lg:hidden" aria-label={tx(lang, 'nav.menu')}>
                <MenuIcon />
            </button>

            <Link href="/dashboard" className="menubar-brand" aria-label="Rovex">
                <RovexLogo size={20} lang={lang} />
            </Link>

            <nav className="menubar-menus" aria-label={tx(lang, 'menu.view')}>
                {menus.map((menu) => (
                    <div key={menu.id} className="menubar-menu">
                        <button
                            type="button"
                            className={cn('menubar-item', open === menu.id && 'is-open')}
                            aria-expanded={open === menu.id}
                            aria-haspopup="menu"
                            onClick={() => setOpen((current) => (current === menu.id ? null : menu.id))}
                        >
                            {tx(lang, menu.labelKey)}
                            <ChevronDown className="size-3 opacity-60" />
                        </button>
                        {open === menu.id && (
                            <div role="menu" className="menubar-drop">
                                {menu.items.map((item) => {
                                    const Icon = item.icon;
                                    const body = (
                                        <>
                                            <Icon className="size-3.5 shrink-0 text-faint" />
                                            <span className="flex-1">{tx(lang, item.labelKey)}</span>
                                        </>
                                    );
                                    return item.href ? (
                                        <Link key={item.labelKey} role="menuitem" href={item.href} className="menubar-row" onClick={() => setOpen(null)}>
                                            {body}
                                        </Link>
                                    ) : (
                                        <button key={item.labelKey} role="menuitem" type="button" className="menubar-row" onClick={() => run(item)}>
                                            {body}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
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
                <Link href="/profile" className="menubar-user" title={userName}>
                    <span className="grid size-6 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand-ink">
                        {userName?.[0]?.toUpperCase() ?? '?'}
                    </span>
                    <span className="menubar-user-name">{userName}</span>
                </Link>
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

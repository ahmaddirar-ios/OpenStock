'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellRing, BookOpen, CandlestickChart, Code2, FlaskConical, Globe, Info, Landmark, LayoutDashboard, LifeBuoy, LogOut, Search, SlidersHorizontal, Star, Wallet } from "lucide-react";
import { openSearch } from "@/components/SearchCommand";
import LangToggle from "@/components/LangToggle";
import ThemeToggle from "@/components/shell/ThemeToggle";
import { signOut } from "@/lib/actions/auth.actions";
import { cn } from "@/lib/utils";
import { tx, type Lang, type StringKey } from "@/lib/i18n";
import RovexLogo from "@/components/brand/RovexLogo";
import FooterCredit from "@/components/brand/FooterCredit";
import { saudiSymbolName, saudiSymbolNameAr } from "@/lib/saudi-symbols";

type SidebarProps = {
    user: User;
    watchlist: { symbol: string; company: string }[];
    lang: Lang;
};

// Labels are keys, not text, so the same list renders in both languages.
const RESOURCES: { href: string; labelKey: StringKey; icon: typeof LifeBuoy }[] = [
    { href: '/help', labelKey: 'nav.help', icon: LifeBuoy },
    { href: '/api-docs', labelKey: 'nav.apiDocs', icon: Code2 },
    { href: '/about', labelKey: 'nav.about', icon: Info },
    { href: '/terms', labelKey: 'nav.terms', icon: BookOpen },
];

const Sidebar = ({ user, watchlist, lang }: SidebarProps) => {
    const pathname = usePathname();
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut();
        router.push('/sign-in');
    };

    return (
        <aside className="sidebar">
            <Link href="/dashboard" className="px-2 pt-1 pb-2" aria-label="Rovex dashboard">
                <RovexLogo size={26} lang={lang} />
            </Link>

            <button type="button" onClick={openSearch} className="side-cta">
                <Search className="size-4" strokeWidth={2.5} />
                <span className="flex-1 text-start">{tx(lang, 'nav.search')}</span>
                <kbd className="kbd bg-on-brand/10">⌘K</kbd>
            </button>

            {/* The sidebar is grouped, not a flat list: what the market says, what is yours, and
                the tools that read both. It is the shape a trader arrives with — the sections come
                before the pages. */}
            <nav className="flex flex-col gap-0.5">
                <p className="side-label mt-1">{tx(lang, 'nav.section.markets')}</p>
                <Link href="/dashboard" className={cn('side-item', pathname === '/dashboard' && 'is-active')}>
                    <LayoutDashboard /> {tx(lang, 'nav.overview')}
                </Link>
                <Link href="/saudi" className={cn('side-item', pathname === '/saudi' && 'is-active')}>
                    <Landmark /> {tx(lang, 'nav.saudi')}
                </Link>
                <Link href="/world" className={cn('side-item', pathname === '/world' && 'is-active')}>
                    <Globe /> {tx(lang, 'nav.world')}
                </Link>

                <p className="side-label mt-2">{tx(lang, 'nav.section.mine')}</p>
                <Link href="/watchlist" className={cn('side-item', pathname === '/watchlist' && 'is-active')}>
                    <Star /> <span className="flex-1">{tx(lang, 'nav.watchlist')}</span>
                    <span className="num text-xs text-faint">{watchlist.length}</span>
                </Link>
                <Link href="/portfolio" className={cn('side-item', pathname === '/portfolio' && 'is-active')}>
                    <Wallet /> {tx(lang, 'nav.portfolio')}
                </Link>
                <Link href="/alerts" className={cn('side-item', pathname.startsWith('/alerts') && 'is-active')}>
                    <BellRing /> {tx(lang, 'nav.alerts')}
                </Link>

                <p className="side-label mt-2">{tx(lang, 'nav.section.analysis')}</p>
                <Link href="/screener" className={cn('side-item', pathname === '/screener' && 'is-active')}>
                    <SlidersHorizontal /> {tx(lang, 'nav.screener')}
                </Link>
                <Link href="/charts" className={cn('side-item', pathname === '/charts' && 'is-active')}>
                    <CandlestickChart /> {tx(lang, 'nav.charts')}
                </Link>
                <Link href="/strategies" className={cn('side-item', pathname.startsWith('/strategies') && 'is-active')}>
                    <FlaskConical /> {tx(lang, 'nav.strategies')}
                </Link>

                <p className="side-label mt-2">{tx(lang, 'nav.section.display')}</p>
                <ThemeToggle lang={lang} />
            </nav>

            <div className="flex min-h-0 flex-col gap-1">
                <p className="side-label shrink-0">{tx(lang, 'nav.watching')}</p>
                {watchlist.length === 0 ? (
                    <p className="px-2.5 text-[12.5px] text-faint">{tx(lang, 'nav.watchingEmpty')}</p>
                ) : (
                    <ul className="scrollbar-hide-default flex min-h-0 flex-col gap-0.5 overflow-y-auto">
                        {watchlist.map(({ symbol, company }) => {
                            // Old rows stored the ticker as the company name; the Saudi table knows better.
                            const name = (lang === 'ar' ? saudiSymbolNameAr(symbol) : null) ?? (company !== symbol ? company : saudiSymbolName(symbol));
                            return (
                            <li key={symbol}>
                                <Link
                                    href={`/stocks/${symbol}`}
                                    title={name || symbol}
                                    className={cn('side-item h-8 font-medium', pathname === `/stocks/${symbol}` && 'is-active')}
                                >
                                    <span dir="ltr" className="mono w-14 shrink-0 text-[12.5px] font-semibold text-foreground">{symbol}</span>
                                    {name && <span dir="auto" className="truncate text-[12.5px] text-faint">{name}</span>}
                                </Link>
                            </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="mt-auto flex flex-col gap-0.5">
                {RESOURCES.map(({ href, labelKey, icon: Icon }) => (
                    <Link key={href} href={href} className={cn('side-item h-8', pathname === href && 'is-active')}>
                        <Icon /> {tx(lang, labelKey)}
                    </Link>
                ))}
                <div className="px-2 py-1"><LangToggle initial={lang} /></div>
            </div>

            <div className="flex items-center gap-2.5 border-t border-line pt-3 px-1">
                <Link href="/profile" className={cn('-m-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] p-1 transition-colors hover:bg-hover', pathname === '/profile' && 'bg-hover')}>
                    <span className="grid size-8 flex-none place-items-center rounded-full bg-brand-soft text-[13px] font-bold text-brand-ink">
                        {user.name?.[0]?.toUpperCase() ?? '?'}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-foreground">{user.name}</span>
                        <span className="block truncate text-[12px] text-faint">{user.email}</span>
                    </span>
                </Link>
                <button type="button" onClick={handleSignOut} className="icon-btn" title={tx(lang, 'nav.signOut')} aria-label={tx(lang, 'nav.signOut')}>
                    <LogOut />
                </button>
            </div>

            <FooterCredit lang={lang} className="px-1 pb-1" />
        </aside>
    );
};

export default Sidebar;

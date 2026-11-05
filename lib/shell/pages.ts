import {
    BellRing,
    CandlestickChart,
    FlaskConical,
    Globe,
    Landmark,
    LayoutDashboard,
    SlidersHorizontal,
    Star,
    Wallet,
    type LucideIcon,
} from 'lucide-react';
import type { StringKey } from '@/lib/i18n';

/**
 * Every destination the shell knows, in the order it offers them.
 *
 * One list, three readers: the sidebar draws its sections from it, the tab bar takes its labels
 * from it, and the command bar searches it. Before this, adding a page meant editing three files
 * that had no way to disagree loudly — they just drifted.
 */
export type PageSection = 'markets' | 'mine' | 'analysis' | 'account';

export type PageDef = {
    href: string;
    labelKey: StringKey;
    icon: LucideIcon;
    section: PageSection;
    /** Extra words a trader would type for this page. The translated name is matched anyway. */
    keywords: readonly string[];
};

export const PAGE_SECTIONS: readonly { id: PageSection; labelKey: StringKey; label?: StringKey }[] = [
    { id: 'markets', labelKey: 'nav.section.markets' },
    { id: 'mine', labelKey: 'nav.section.mine' },
    { id: 'analysis', labelKey: 'nav.section.analysis' },
    { id: 'account', labelKey: 'nav.section.account' },
];

export const PAGES: readonly PageDef[] = [
    { href: '/dashboard', labelKey: 'nav.overview', icon: LayoutDashboard, section: 'markets', keywords: ['home', 'overview', 'الرئيسية', 'نظرة'] },
    { href: '/saudi', labelKey: 'nav.saudi', icon: Landmark, section: 'markets', keywords: ['tadawul', 'saudi', 'تداول', 'السوق السعودي'] },
    { href: '/world', labelKey: 'nav.world', icon: Globe, section: 'markets', keywords: ['global', 'commodities', 'currencies', 'عالمي', 'سلع', 'عملات'] },

    { href: '/watchlist', labelKey: 'nav.watchlist', icon: Star, section: 'mine', keywords: ['favourites', 'قائمة', 'مراقبة'] },
    { href: '/portfolio', labelKey: 'nav.portfolio', icon: Wallet, section: 'mine', keywords: ['holdings', 'محفظة', 'مركز'] },
    { href: '/alerts', labelKey: 'nav.alerts', icon: BellRing, section: 'mine', keywords: ['notifications', 'تنبيهات', 'إشعارات'] },

    { href: '/screener', labelKey: 'nav.screener', icon: SlidersHorizontal, section: 'analysis', keywords: ['filter', 'screen', 'فلتر', 'مسح', 'فرز'] },
    { href: '/charts', labelKey: 'nav.charts', icon: CandlestickChart, section: 'analysis', keywords: ['grid', 'charts', 'شارت', 'شارتات', 'شبكة'] },
    { href: '/strategies', labelKey: 'nav.strategies', icon: FlaskConical, section: 'analysis', keywords: ['backtest', 'lab', 'استراتيجية', 'اختبار'] },

    { href: '/profile', labelKey: 'nav.profile', icon: LayoutDashboard, section: 'account', keywords: ['account', 'settings', 'حساب', 'إعدادات'] },
];

/** The pages a section holds, in list order. */
export const pagesInSection = (section: PageSection): PageDef[] =>
    PAGES.filter((page) => page.section === section);

export const pageByHref = (href: string): PageDef | undefined => PAGES.find((page) => page.href === href);

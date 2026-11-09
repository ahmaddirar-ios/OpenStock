import {
    BellRing,
    BookOpen,
    CandlestickChart,
    Code2,
    FlaskConical,
    Globe,
    Info,
    Landmark,
    LayoutDashboard,
    LifeBuoy,
    ScanSearch,
    ShieldCheck,
    SlidersHorizontal,
    Star,
    Wallet,
    Wrench,
    type LucideIcon,
} from 'lucide-react';
import type { StringKey } from '@/lib/i18n';
import { can, isStaff, type Capability, type Role } from '@/lib/authz';
import { PAGE_FEATURE, hasFeature, type Feature } from '@/lib/plans';

/**
 * Every destination the shell knows, in the order it offers them.
 *
 * One list, three readers: the sidebar draws its sections from it, the tab bar takes its labels
 * from it, and the command bar searches it. Before this, adding a page meant editing three files
 * that had no way to disagree loudly — they just drifted.
 *
 * A page may also carry a requirement. The readers take the signed-in role and drop what it cannot
 * open, so a destination is never offered to someone the server would turn away.
 */
export type PageSection = 'markets' | 'mine' | 'analysis' | 'tools' | 'account' | 'resources' | 'admin';

export type PageDef = {
    href: string;
    labelKey: StringKey;
    icon: LucideIcon;
    section: PageSection;
    /** Extra words a trader would type for this page. The translated name is matched anyway. */
    keywords: readonly string[];
    /** The one capability that opens this page. */
    requires?: Capability;
    /** Any staff role opens this page — used for the admin home, which has no single capability. */
    requiresStaff?: boolean;
};

export const PAGE_SECTIONS: readonly { id: PageSection; labelKey: StringKey; label?: StringKey }[] = [
    { id: 'markets', labelKey: 'nav.section.markets' },
    { id: 'mine', labelKey: 'nav.section.mine' },
    { id: 'analysis', labelKey: 'nav.section.analysis' },
    { id: 'tools', labelKey: 'nav.section.tools' },
    { id: 'account', labelKey: 'nav.section.account' },
    { id: 'resources', labelKey: 'nav.section.resources' },
    { id: 'admin', labelKey: 'nav.section.admin' },
];

export const PAGES: readonly PageDef[] = [
    { href: '/dashboard', labelKey: 'nav.overview', icon: LayoutDashboard, section: 'markets', keywords: ['home', 'overview', 'الرئيسية', 'نظرة'] },
    { href: '/saudi', labelKey: 'nav.saudi', icon: Landmark, section: 'markets', keywords: ['tadawul', 'saudi', 'تداول', 'السوق السعودي'] },
    { href: '/world', labelKey: 'nav.world', icon: Globe, section: 'markets', keywords: ['global', 'commodities', 'currencies', 'عالمي', 'سلع', 'عملات'] },

    { href: '/watchlist', labelKey: 'nav.watchlist', icon: Star, section: 'mine', keywords: ['favourites', 'قائمة', 'مراقبة'] },
    { href: '/portfolio', labelKey: 'nav.portfolio', icon: Wallet, section: 'mine', keywords: ['holdings', 'محفظة', 'مركز'] },
    { href: '/alerts', labelKey: 'nav.alerts', icon: BellRing, section: 'mine', keywords: ['notifications', 'تنبيهات', 'إشعارات'] },

    { href: '/screener', labelKey: 'nav.screener', icon: SlidersHorizontal, section: 'analysis', keywords: ['filter', 'screen', 'فلتر', 'مسح', 'فرز'] },
    { href: '/scanner', labelKey: 'nav.scanner', icon: ScanSearch, section: 'analysis', keywords: ['pattern', 'scanner', 'wolfe', 'harmonic', 'نموذج', 'أنماط', 'مسح'] },
    { href: '/charts', labelKey: 'nav.charts', icon: CandlestickChart, section: 'analysis', keywords: ['grid', 'charts', 'شارت', 'شارتات', 'شبكة'] },
    { href: '/strategies', labelKey: 'nav.strategies', icon: FlaskConical, section: 'analysis', keywords: ['backtest', 'lab', 'استراتيجية', 'اختبار'] },

    { href: '/tools', labelKey: 'nav.tools', icon: Wrench, section: 'tools', keywords: ['hub', 'index', 'everything', 'أدوات', 'دليل'] },

    { href: '/profile', labelKey: 'nav.profile', icon: LayoutDashboard, section: 'account', keywords: ['account', 'settings', 'حساب', 'إعدادات'] },

    { href: '/help', labelKey: 'nav.help', icon: LifeBuoy, section: 'resources', keywords: ['support', 'مساعدة', 'دعم'] },
    { href: '/api-docs', labelKey: 'nav.apiDocs', icon: Code2, section: 'resources', keywords: ['developers', 'api', 'توثيق'] },
    { href: '/about', labelKey: 'nav.about', icon: Info, section: 'resources', keywords: ['about', 'عن التطبيق'] },
    { href: '/terms', labelKey: 'nav.terms', icon: BookOpen, section: 'resources', keywords: ['terms', 'privacy', 'الشروط'] },

    { href: '/admin', labelKey: 'nav.admin', icon: ShieldCheck, section: 'admin', keywords: ['staff', 'control', 'management', 'إدارة', 'لوحة'], requiresStaff: true },
];

/** Whether a role may open a page. A page with no requirement is open to everyone signed in. */
export const canOpen = (page: PageDef, role: Role, features?: readonly Feature[]): boolean => {
    if (page.requiresStaff) return isStaff(role);
    if (page.requires) return can(role, page.requires);
    const feature = PAGE_FEATURE[page.href];
    return feature ? hasFeature(features, feature) : true;
};

/** The pages a role may open, in list order. Pass the account's features to drop locked pages. */
export const visiblePages = (role: Role, features?: readonly Feature[]): PageDef[] =>
    PAGES.filter((page) => canOpen(page, role, features));

/** The pages a section holds, in list order. */
export const pagesInSection = (section: PageSection): PageDef[] =>
    PAGES.filter((page) => page.section === section);

/** The pages a section holds that a role may open, in list order. */
export const visiblePagesInSection = (section: PageSection, role: Role, features?: readonly Feature[]): PageDef[] =>
    pagesInSection(section).filter((page) => canOpen(page, role, features));

/** The sections a role can see at least one page in. */
export const visibleSections = (role: Role, features?: readonly Feature[]): PageSection[] =>
    PAGE_SECTIONS.filter((section) => visiblePagesInSection(section.id, role, features).length > 0).map((section) => section.id);

export const pageByHref = (href: string): PageDef | undefined => PAGES.find((page) => page.href === href);

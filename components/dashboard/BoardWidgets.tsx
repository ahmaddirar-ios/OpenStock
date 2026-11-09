import Link from 'next/link';
import { Activity, ArrowUpRight, BellRing, FlaskConical, SlidersHorizontal, Star, Wallet } from 'lucide-react';
import { getPortfolioSummary } from '@/lib/actions/portfolio.actions';
import { getUserWatchlist } from '@/lib/actions/watchlist.actions';
import { getUserAlerts } from '@/lib/actions/alert.actions';
import { loadStrategies } from '@/lib/actions/strategy.actions';
import { getScreenerRows } from '@/lib/actions/screener.actions';
import { PATTERN_ORDER } from '@/lib/patterns';
import { arDigits, arNumberDigits, tx, type Lang } from '@/lib/i18n';

/**
 * The six cards on the overview board. Each is a server component that reads the same action its
 * full page does, so a card and its page cannot disagree; a failed read degrades to a dash instead
 * of taking the board down.
 */

type CardShellProps = {
    href: string;
    title: string;
    icon: typeof Wallet;
    value: string;
    sub: string;
    tone?: 'up' | 'down' | 'none';
    children?: React.ReactNode;
};

const CardShell = ({ href, title, icon: Icon, value, sub, tone = 'none', children }: CardShellProps) => (
    <Link href={href} className="card group flex min-w-0 flex-col justify-between gap-2 p-3 transition-colors hover:bg-hover">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
            <Icon className="size-3.5" />
            <span className="truncate">{title}</span>
            <ArrowUpRight className="ms-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        <span className="min-w-0">
            <span className={`num block truncate text-[20px] font-bold leading-tight ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : ''}`}>{value}</span>
            <span className="mt-0.5 block truncate text-[12px] text-faint">{sub}</span>
        </span>
        {children}
    </Link>
);

export async function PortfolioCard({ lang }: { lang: Lang }) {
    const summary = await getPortfolioSummary().catch(() => null);
    const title = tx(lang, 'board.portfolio');
    if (!summary) return <CardShell href="/portfolio" title={title} icon={Wallet} value="—" sub={tx(lang, 'board.empty')} />;
    const value = summary.value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const tone = summary.dayChangePct > 0 ? 'up' : summary.dayChangePct < 0 ? 'down' : 'none';
    const change = `${summary.dayChangePct > 0 ? '+' : ''}${summary.dayChangePct.toFixed(2)}%`;
    return (
        <CardShell href="/portfolio" title={title} icon={Wallet} value={arNumberDigits(value, lang)} sub={arDigits(change, lang)} tone={tone} />
    );
}

export async function WatchlistCard({ lang }: { lang: Lang }) {
    const rows = await getUserWatchlist().catch(() => [] as Awaited<ReturnType<typeof getUserWatchlist>>);
    const title = tx(lang, 'board.watchlist');
    if (rows.length === 0) return <CardShell href="/watchlist" title={title} icon={Star} value={arDigits(0, lang)} sub={tx(lang, 'board.empty')} />;
    const first = rows.slice(0, 2).map((row: { symbol: string }) => row.symbol).join(' · ');
    return <CardShell href="/watchlist" title={title} icon={Star} value={arDigits(rows.length, lang)} sub={first} />;
}

export async function AlertsCard({ lang }: { lang: Lang }) {
    const alerts = await getUserAlerts().catch(() => []);
    const active = alerts.filter((alert: { triggered?: boolean }) => !alert.triggered).length;
    return (
        <CardShell
            href="/alerts"
            title={tx(lang, 'board.alerts')}
            icon={BellRing}
            value={arDigits(active, lang)}
            sub={tx(lang, 'board.alertsSub').replace('{n}', arDigits(alerts.length, lang))}
        />
    );
}

export async function ScannerCard({ lang }: { lang: Lang }) {
    return (
        <CardShell
            href="/scanner"
            title={tx(lang, 'board.scanner')}
            icon={Activity}
            value={arDigits(PATTERN_ORDER.length, lang)}
            sub={tx(lang, 'board.scannerSub')}
        />
    );
}

export async function StrategiesCard({ lang }: { lang: Lang }) {
    const loaded = await loadStrategies().catch(() => null);
    const count = loaded?.ok ? loaded.items.length : 0;
    return (
        <CardShell
            href="/strategies"
            title={tx(lang, 'board.strategies')}
            icon={FlaskConical}
            value={arDigits(count, lang)}
            sub={tx(lang, 'board.strategiesSub')}
        />
    );
}

export async function ScreenersCard({ lang }: { lang: Lang }) {
    const rows = await getScreenerRows().catch(() => []);
    return (
        <CardShell
            href="/screener"
            title={tx(lang, 'board.screeners')}
            icon={SlidersHorizontal}
            value={arDigits(rows.length, lang)}
            sub={tx(lang, 'board.screenersSub')}
        />
    );
}

import Link from 'next/link';
import { Activity, ArrowUpRight, Clock, Database, Radio } from 'lucide-react';
import Panel from '@/components/Panel';
import RefreshButton from '@/components/admin/RefreshButton';
import { requireCapabilityPage } from '@/lib/authz-server';
import { CRONS, collectionCounts, providerProbes, recentAlertEvents, type ProbeStatus } from '@/lib/ops/health';
import { getLang } from '@/lib/i18n-server';
import { arDigits, arNumberDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export const generateMetadata = async () => {
    const lang = await getLang();
    return { title: tx(lang, 'ops.title') };
};

const PROVIDERS: { id: 'yahoo' | 'finnhub' | 'news'; labelKey: StringKey }[] = [
    { id: 'yahoo', labelKey: 'ops.provider.yahoo' },
    { id: 'finnhub', labelKey: 'ops.provider.finnhub' },
    { id: 'news', labelKey: 'ops.provider.news' },
];

const tone: Record<ProbeStatus, string> = {
    ok: 'is-up',
    slow: 'is-brand',
    down: 'is-down',
    skipped: '',
};

const latency = (ms: number | null, lang: Lang) => (ms === null ? '—' : `${arDigits(ms, lang)} ${tx(lang, 'ops.ms')}`);

export default async function OpsPage() {
    await requireCapabilityPage('ops:view');
    const [lang, probes, counts, events] = await Promise.all([
        getLang(),
        providerProbes(),
        collectionCounts().catch(() => []),
        recentAlertEvents(8),
    ]);

    return (
        <>
            <section className="hatch">
                <div className="card flex flex-wrap items-center gap-4 p-5">
                    <span className="grid size-14 flex-none place-items-center rounded-full bg-brand-soft text-brand-ink">
                        <Activity className="size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-[22px] font-bold tracking-[-0.03em]">{tx(lang, 'ops.title')}</h1>
                        <p className="truncate text-faint">{tx(lang, 'ops.sub')}</p>
                    </div>
                    <RefreshButton lang={lang} />
                </div>
            </section>

            <Panel title={tx(lang, 'ops.providers')} sub={tx(lang, 'ops.providersSub')}>
                <div className="grid gap-2 p-3.5 sm:grid-cols-3">
                    {PROVIDERS.map((provider) => {
                        const result = probes.find((probe) => probe.id === provider.id);
                        return (
                            <div key={provider.id} className="card flex flex-col gap-2 p-3.5">
                                <span className="flex items-center gap-2 text-[12px] font-semibold">
                                    <Radio className="size-3.5 text-faint" />
                                    {tx(lang, provider.labelKey)}
                                    <span className={cn('pill ms-auto', result && tone[result.status])}>
                                        {tx(lang, `ops.status.${result?.status ?? 'down'}` as StringKey)}
                                    </span>
                                </span>
                                <span className="num text-[13px] text-muted">{latency(result?.latencyMs ?? null, lang)}</span>
                                <span className="truncate text-[11px] text-faint" dir="ltr">{result?.detail ?? '—'}</span>
                            </div>
                        );
                    })}
                </div>
            </Panel>

            <div className="grid items-start gap-3 xl:grid-cols-2">
                <Panel title={tx(lang, 'ops.database')} sub={tx(lang, 'ops.databaseSub')}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{tx(lang, 'ops.collection')}</th>
                                <th className="text-end">{tx(lang, 'ops.documents')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {counts.map((row) => (
                                <tr key={row.name}>
                                    <td className="mono text-[12px]" dir="ltr">{row.name}</td>
                                    <td className="num text-end">{arNumberDigits(row.count.toLocaleString('en-US'), lang)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>

                <Panel title={tx(lang, 'ops.schedules')} sub={tx(lang, 'ops.schedulesSub')}>
                    <ul className="row-list">
                        {CRONS.map((cron) => (
                            <li key={cron.id} className="flex items-center gap-3 px-3.5 py-3">
                                <span className="bento-ico"><Clock /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-semibold">{tx(lang, cron.descriptionKey as StringKey)}</span>
                                    <span className="mono block text-[11px] text-faint" dir="ltr">{cron.id}</span>
                                </span>
                                <span className="pill mono" dir="ltr">{cron.cron}</span>
                            </li>
                        ))}
                    </ul>
                </Panel>
            </div>

            <Panel
                title={tx(lang, 'ops.events')}
                sub={tx(lang, 'ops.eventsSub')}
                action={
                    <Link href="/alerts" className="pill h-7 px-2.5 text-[12px] transition-colors hover:bg-hover">
                        {tx(lang, 'ops.openAlerts')} <ArrowUpRight className="size-3.5" />
                    </Link>
                }
            >
                {events.length === 0 ? (
                    <p className="empty-state">{tx(lang, 'ops.eventsEmpty')}</p>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{tx(lang, 'ops.symbol')}</th>
                                <th>{tx(lang, 'ops.condition')}</th>
                                <th className="text-end">{tx(lang, 'ops.value')}</th>
                                <th className="text-end">{tx(lang, 'ops.when')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map((event, index) => (
                                <tr key={`${event.symbol}-${event.at}-${index}`}>
                                    <td className="mono" dir="ltr">{event.symbol}</td>
                                    <td>{event.condition}</td>
                                    <td className="num text-end">{arNumberDigits(String(event.value), lang)}</td>
                                    <td className="num text-end text-faint">{arNumberDigits(event.at.slice(0, 16).replace('T', ' '), lang)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div className="flex items-center gap-2 px-3.5 py-2 text-[11px] text-faint">
                    <Database className="size-3.5" />
                    {tx(lang, 'ops.readOnly')}
                </div>
            </Panel>
        </>
    );
}

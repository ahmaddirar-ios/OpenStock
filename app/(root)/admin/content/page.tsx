import { FileText, Inbox } from 'lucide-react';
import Panel from '@/components/Panel';
import AdminNoticeForm from '@/components/admin/AdminNoticeForm';
import { requireCapabilityPage } from '@/lib/authz-server';
import { listWaitlist, readSiteNotice } from '@/lib/actions/admin-content.actions';
import { can } from '@/lib/authz';
import { getLang } from '@/lib/i18n-server';
import { arDigits, arNumberDigits, tx } from '@/lib/i18n';

export const generateMetadata = async () => {
    const lang = await getLang();
    return { title: tx(lang, 'admin.section.content') };
};

export default async function AdminContentPage() {
    const user = await requireCapabilityPage('content:view');
    const [lang, notice, waitlist] = await Promise.all([getLang(), readSiteNotice(), listWaitlist({ limit: 50 })]);
    const canEdit = can(user.role, 'content:manage');

    return (
        <>
            <section className="hatch">
                <div className="card flex flex-wrap items-center gap-4 p-5">
                    <span className="grid size-14 flex-none place-items-center rounded-full bg-brand-soft text-brand-ink">
                        <FileText className="size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-[22px] font-bold tracking-[-0.03em]">{tx(lang, 'admin.section.content')}</h1>
                        <p className="truncate text-faint">{tx(lang, 'admin.section.contentSub')}</p>
                    </div>
                    {!canEdit && <span className="pill">{tx(lang, 'admin.content.readOnly')}</span>}
                </div>
            </section>

            <Panel title={tx(lang, 'admin.content.notice')} sub={tx(lang, 'admin.content.noticeSub')}>
                <AdminNoticeForm lang={lang} initial={notice} canEdit={canEdit} />
            </Panel>

            <Panel
                title={tx(lang, 'admin.content.waitlist')}
                sub={tx(lang, 'admin.content.waitlistSub').replace('{n}', arDigits(waitlist.total, lang))}
                action={<span className="pill"><Inbox className="size-3" />{arNumberDigits(waitlist.total.toLocaleString('en-US'), lang)}</span>}
            >
                {waitlist.rows.length === 0 ? (
                    <p className="empty-state">{tx(lang, 'admin.content.waitlistEmpty')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>{tx(lang, 'admin.content.email')}</th>
                                    <th>{tx(lang, 'admin.content.plan')}</th>
                                    <th>{tx(lang, 'admin.content.note')}</th>
                                    <th className="text-end">{tx(lang, 'admin.content.joined')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {waitlist.rows.map((row) => (
                                    <tr key={row.email}>
                                        <td className="mono text-[12px]" dir="ltr">{row.email}</td>
                                        <td><span className="pill">{row.plan}</span></td>
                                        <td className="max-w-[280px] truncate text-[12px] text-faint">{row.note || '—'}</td>
                                        <td className="num text-end text-[12px] text-faint" dir="ltr">{row.createdAt.slice(0, 10)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>
        </>
    );
}

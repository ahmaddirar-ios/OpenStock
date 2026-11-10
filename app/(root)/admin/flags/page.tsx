import { Flag } from 'lucide-react';
import Panel from '@/components/Panel';
import AdminFlags from '@/components/admin/AdminFlags';
import { requireCapabilityPage } from '@/lib/authz-server';
import { listFlags } from '@/lib/actions/admin-flags.actions';
import { getLang } from '@/lib/i18n-server';
import { tx } from '@/lib/i18n';

export const generateMetadata = async () => {
    const lang = await getLang();
    return { title: tx(lang, 'admin.section.flags') };
};

export default async function AdminFlagsPage() {
    await requireCapabilityPage('flag:manage');
    const [lang, flags] = await Promise.all([getLang(), listFlags()]);

    return (
        <>
            <section className="hatch">
                <div className="card flex flex-wrap items-center gap-4 p-5">
                    <span className="grid size-14 flex-none place-items-center rounded-full bg-brand-soft text-brand-ink">
                        <Flag className="size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-[22px] font-bold tracking-[-0.03em]">{tx(lang, 'admin.section.flags')}</h1>
                        <p className="truncate text-faint">{tx(lang, 'admin.section.flagsSub')}</p>
                    </div>
                </div>
            </section>

            <Panel title={tx(lang, 'admin.flags.title')} sub={tx(lang, 'admin.flags.panelSub')}>
                <AdminFlags lang={lang} initial={flags} />
            </Panel>
        </>
    );
}

import { Users } from 'lucide-react';
import Panel from '@/components/Panel';
import AdminUsersTable from '@/components/admin/AdminUsersTable';
import { requireCapabilityPage } from '@/lib/authz-server';
import { listUsers } from '@/lib/actions/admin-users.actions';
import { can } from '@/lib/authz';
import { getLang } from '@/lib/i18n-server';
import { tx } from '@/lib/i18n';

export const generateMetadata = async () => {
    const lang = await getLang();
    return { title: tx(lang, 'admin.section.users') };
};

export default async function AdminUsersPage() {
    const user = await requireCapabilityPage('user:list');
    const [lang, page] = await Promise.all([getLang(), listUsers({ limit: 25, offset: 0 })]);

    return (
        <>
            <section className="hatch">
                <div className="card flex flex-wrap items-center gap-4 p-5">
                    <span className="grid size-14 flex-none place-items-center rounded-full bg-brand-soft text-brand-ink">
                        <Users className="size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-[22px] font-bold tracking-[-0.03em]">{tx(lang, 'admin.section.users')}</h1>
                        <p className="truncate text-faint">{tx(lang, 'admin.section.usersSub')}</p>
                    </div>
                </div>
            </section>

            <Panel title={tx(lang, 'admin.users.title')} sub={tx(lang, 'admin.users.sub')}>
                <div className="p-3.5">
                    <AdminUsersTable
                        lang={lang}
                        initial={page}
                        meId={user.id}
                        can={{
                            setRole: can(user.role, 'user:set-role'),
                            ban: can(user.role, 'user:ban'),
                            delete: can(user.role, 'user:delete'),
                            revoke: can(user.role, 'session:revoke'),
                            entitlements: can(user.role, 'user:entitlements'),
                            password: can(user.role, 'user:set-password'),
                        }}
                    />
                </div>
            </Panel>
        </>
    );
}

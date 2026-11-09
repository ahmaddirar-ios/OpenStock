import Link from 'next/link';
import { Activity, ArrowUpRight, FileText, Flag, ShieldCheck, Users } from 'lucide-react';
import Panel from '@/components/Panel';
import { currentUser } from '@/lib/authz-server';
import { can, capabilitiesOf, type Capability } from '@/lib/authz';
import { getLang } from '@/lib/i18n-server';
import { tx, type StringKey } from '@/lib/i18n';

export const generateMetadata = async () => {
    const lang = await getLang();
    return { title: tx(lang, 'admin.title') };
};

type SectionCard = {
    href: string;
    titleKey: StringKey;
    subKey: StringKey;
    capability: Capability;
    icon: typeof Users;
};

// The panel's own map. A card is offered only when the role holds its capability, so the home page
// and the section guards cannot disagree.
const SECTIONS: readonly SectionCard[] = [
    { href: '/admin/users', titleKey: 'admin.section.users', subKey: 'admin.section.usersSub', capability: 'user:list', icon: Users },
    { href: '/admin/content', titleKey: 'admin.section.content', subKey: 'admin.section.contentSub', capability: 'content:view', icon: FileText },
    { href: '/admin/flags', titleKey: 'admin.section.flags', subKey: 'admin.section.flagsSub', capability: 'flag:manage', icon: Flag },
    { href: '/admin/ops', titleKey: 'admin.section.ops', subKey: 'admin.section.opsSub', capability: 'ops:view', icon: Activity },
];

export default async function AdminHomePage() {
    const user = await currentUser();
    const lang = await getLang();
    // The layout already refused a non-staff reader; this is the type narrowing, not the gate.
    if (!user) return null;

    const capabilities = capabilitiesOf(user.role);
    const sections = SECTIONS.filter((section) => can(user.role, section.capability));

    return (
        <>
            <section className="hatch">
                <div className="card flex flex-wrap items-center gap-4 p-5">
                    <span className="grid size-14 flex-none place-items-center rounded-full bg-brand-soft text-brand-ink">
                        <ShieldCheck className="size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-[22px] font-bold tracking-[-0.03em]">{tx(lang, 'admin.title')}</h1>
                        <p className="truncate text-faint">{tx(lang, 'admin.sub')}</p>
                    </div>
                    <span className="pill is-brand">
                        {tx(lang, 'admin.role')}: {tx(lang, `admin.role.${user.role}` as StringKey)}
                    </span>
                </div>
            </section>

            <Panel title={tx(lang, 'admin.capabilities')} sub={user.email}>
                {capabilities.length === 0 ? (
                    <p className="empty-state">{tx(lang, 'admin.noCapabilities')}</p>
                ) : (
                    <ul className="flex flex-wrap gap-2 p-3.5">
                        {capabilities.map((capability) => (
                            <li key={capability} className="pill">
                                {tx(lang, `admin.cap.${capability}` as StringKey)}
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>

            <Panel title={tx(lang, 'admin.sections')} sub={tx(lang, 'admin.sectionsSub')}>
                <div className="grid gap-3 p-3.5 sm:grid-cols-2">
                    {sections.map(({ href, titleKey, subKey, icon: Icon }) => (
                        <Link key={href} href={href} className="card group flex items-start gap-3 p-4 transition-colors hover:bg-hover">
                            <span className="bento-ico"><Icon /></span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 font-semibold">
                                    {tx(lang, titleKey)}
                                    <ArrowUpRight className="size-3.5 text-faint transition-transform group-hover:-translate-y-0.5" />
                                </span>
                                <span className="mt-0.5 block text-[13px] text-faint">{tx(lang, subKey)}</span>
                            </span>
                        </Link>
                    ))}
                </div>
            </Panel>
        </>
    );
}

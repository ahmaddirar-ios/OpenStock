import { Wrench } from 'lucide-react';
import ToolsHub from '@/components/tools/ToolsHub';
import { currentUser } from '@/lib/authz-server';
import { accessFor } from '@/lib/entitlements-server';
import type { StringKey } from '@/lib/i18n';
import { getLang } from '@/lib/i18n-server';
import { tx } from '@/lib/i18n';

export const generateMetadata = async () => {
    const lang = await getLang();
    return { title: tx(lang, 'toolsHub.title') };
};

export default async function ToolsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [user, lang, params] = await Promise.all([currentUser(), getLang(), searchParams]);
    // The root layout already sends a signed-out reader to sign-in; this is the type narrowing.
    if (!user) return null;
    const access = await accessFor(user.id);
    const locked = typeof params.locked === 'string' ? params.locked : null;

    return (
        <>
            <section className="hatch">
                <div className="card flex flex-wrap items-center gap-4 p-5">
                    <span className="grid size-14 flex-none place-items-center rounded-full bg-brand-soft text-brand-ink">
                        <Wrench className="size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-[22px] font-bold tracking-[-0.03em]">{tx(lang, 'toolsHub.title')}</h1>
                        <p className="truncate text-faint">{tx(lang, 'toolsHub.sub')}</p>
                    </div>
                </div>
            </section>

            {locked && (
                <section className="card flex items-start gap-3 p-4">
                    <span className="pill is-brand flex-none">{tx(lang, 'toolsHub.lockedTitle')}</span>
                    <p className="m-0 text-[12.5px] text-faint">
                        {tx(lang, 'toolsHub.locked').replace(
                            '{feature}',
                            tx(lang, `access.${locked}` as StringKey),
                        )}
                    </p>
                </section>
            )}

            <ToolsHub lang={lang} role={user.role} features={access.features} />
        </>
    );
}

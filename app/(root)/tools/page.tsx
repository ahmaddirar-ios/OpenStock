import { Wrench } from 'lucide-react';
import ToolsHub from '@/components/tools/ToolsHub';
import { currentUser } from '@/lib/authz-server';
import { getLang } from '@/lib/i18n-server';
import { tx } from '@/lib/i18n';

export const generateMetadata = async () => {
    const lang = await getLang();
    return { title: tx(lang, 'toolsHub.title') };
};

export default async function ToolsPage() {
    const [user, lang] = await Promise.all([currentUser(), getLang()]);
    // The root layout already sends a signed-out reader to sign-in; this is the type narrowing.
    if (!user) return null;

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

            <ToolsHub lang={lang} role={user.role} />
        </>
    );
}

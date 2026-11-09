'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import LangToggle from "@/components/LangToggle";
import ThemeToggle from "@/components/shell/ThemeToggle";
import { signOut } from "@/lib/actions/auth.actions";
import { cn } from "@/lib/utils";
import { tx, type Lang } from "@/lib/i18n";
import type { Role } from "@/lib/authz";
import { PAGE_SECTIONS, visiblePagesInSection } from "@/lib/shell/pages";

type SidebarProps = {
    user: User;
    lang: Lang;
    role: Role;
};

/**
 * The rail, not a sidebar. The menu bar already carries every name, so this is the far edge of a
 * terminal: one glyph per destination, a tip on hover, and the sections separated by a hairline.
 * On a narrow screen the same markup becomes the drawer and shows its labels.
 */
const Sidebar = ({ user, lang, role }: SidebarProps) => {
    const pathname = usePathname();
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut();
        router.push('/sign-in');
    };

    // The avatar is the account door and the drawer carries resources at the foot, so the rail's
    // body is everything else the role can open.
    const sections = PAGE_SECTIONS.filter(
        (section) => section.id !== 'account' && section.id !== 'resources' && visiblePagesInSection(section.id, role).length > 0,
    );

    return (
        <aside className="rail">
            <Link href="/profile" className="rail-btn rail-avatar" aria-label={user.name} aria-current={pathname === '/profile' ? 'page' : undefined}>
                <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand-ink">
                    {user.name?.[0]?.toUpperCase() ?? '?'}
                </span>
                <span className="rail-label">{user.name}</span>
                <span className="rail-tip" aria-hidden="true">{user.name}</span>
            </Link>

            {sections.map((section) => (
                <div key={section.id} className="rail-group">
                    <span className="rail-sep" aria-hidden="true" />
                    {visiblePagesInSection(section.id, role).map(({ href, labelKey, icon: Icon }) => {
                        const name = tx(lang, labelKey);
                        const active = pathname === href || pathname.startsWith(`${href}/`);
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={cn('rail-btn', active && 'is-active')}
                                aria-label={name}
                                aria-current={active ? 'page' : undefined}
                            >
                                <Icon />
                                <span className="rail-label">{name}</span>
                                <span className="rail-tip" aria-hidden="true">{name}</span>
                            </Link>
                        );
                    })}
                </div>
            ))}

            {/* The menu bar already lists these on a desktop; the drawer has no menu bar, so it
                carries them too instead of hiding help, docs and the legal pages on a phone. */}
            <div className="rail-group rail-res">
                <span className="rail-sep" aria-hidden="true" />
                {visiblePagesInSection('resources', role).map(({ href, labelKey, icon: Icon }) => {
                    const name = tx(lang, labelKey);
                    const active = pathname === href || pathname.startsWith(`${href}/`);
                    return (
                        <Link key={href} href={href} className={cn('rail-btn', active && 'is-active')} aria-label={name} aria-current={active ? 'page' : undefined}>
                            <Icon />
                            <span className="rail-label">{name}</span>
                            <span className="rail-tip" aria-hidden="true">{name}</span>
                        </Link>
                    );
                })}
            </div>

            <div className="rail-foot">
                <ThemeToggle lang={lang} iconOnly />
                <LangToggle initial={lang} variant="rail" />
                <button type="button" onClick={handleSignOut} className="rail-btn" aria-label={tx(lang, 'nav.signOut')}>
                    <LogOut />
                    <span className="rail-label">{tx(lang, 'nav.signOut')}</span>
                    <span className="rail-tip" aria-hidden="true">{tx(lang, 'nav.signOut')}</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;

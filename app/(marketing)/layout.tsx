import Link from "next/link";
import { Github } from "lucide-react";
import { getSession } from "@/lib/better-auth/auth";
import RovexLogo from "@/components/brand/RovexLogo";
import FooterCredit from "@/components/brand/FooterCredit";
import { MotionProvider } from "@/components/motion";
import { REPO_URL } from "@/lib/constants";

const FOOTER_LINKS = [
    { href: '/s', label: 'Stocks' },
    { href: '/compare', label: 'Guides' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/about', label: 'About' },
    { href: '/help', label: 'Help' },
    { href: '/api-docs', label: 'Architecture' },
    { href: '/terms', label: 'Terms' },
    { href: '/privacy', label: 'Privacy' },
    { href: REPO_URL, label: 'Source' },
];

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
    // These pages are English only, so the subtree keeps English direction and typography
    // (see the [lang="en"] rule in globals.css) even when the reader picked Arabic inside the app.
    const session = await getSession();
    const signedIn = !!session?.user;

    return (
        <MotionProvider>
        <div lang="en" dir="ltr" className="relative min-h-dvh overflow-x-clip bg-page">
            {/* Marketing atmosphere: aurora field, hairline grid and film grain. Purely decorative. */}
            <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
                <div className="mk-aurora"><i className="a1" /><i className="a2" /><i className="a3" /></div>
                <div className="mk-grid" />
                <div className="mk-grain" />
            </div>

            <header className="sticky top-0 z-40 px-3 pt-3">
                <div className="mk-glass mx-auto flex h-14 max-w-[1240px] items-center gap-6 rounded-2xl px-4 shadow-[0_24px_60px_-34px_rgba(0,0,0,0.95)]">
                    <Link href="/" aria-label="Rovex home" className="shrink-0">
                        <RovexLogo size={27} />
                    </Link>
                    <nav className="hidden items-center gap-1 md:flex">
                        {[['/#inside', 'Product'], ['/#data', 'Data'], ['/#self-host', 'Self-host'], ['/pricing', 'Pricing'], ['/about', 'About']].map(([href, label]) => (
                            <Link key={href} href={href} className="side-item h-8 font-semibold">{label}</Link>
                        ))}
                    </nav>
                    <div className="ms-auto flex items-center gap-2">
                        <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-ghost hidden h-9 px-3 sm:inline-flex" aria-label="Source on GitHub">
                            <Github />
                            <span className="hidden sm:inline">Source</span>
                        </a>
                        {signedIn ? (
                            <Link href="/dashboard" className="btn btn-primary h-9">Open dashboard</Link>
                        ) : (
                            <>
                                <Link href="/sign-in" className="btn h-9 px-3 text-muted-foreground hover:text-foreground">Sign in</Link>
                                <Link href="/sign-up" className="btn btn-primary h-9">Get started</Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main className="relative z-10">{children}</main>

            <footer className="relative z-10 mx-auto mt-24 flex max-w-[1200px] flex-col gap-6 px-5 pb-10 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-3">
                    <RovexLogo size={24} />
                    <p className="text-[13px] text-faint">© {new Date().getFullYear()} Rovex</p>
                    <FooterCredit />
                </div>
                <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold text-muted-foreground">
                    {FOOTER_LINKS.map(({ href, label }) => (
                        <Link key={label} href={href} className="transition-colors hover:text-foreground" {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>
                            {label}
                        </Link>
                    ))}
                </nav>
            </footer>
        </div>
        </MotionProvider>
    );
}

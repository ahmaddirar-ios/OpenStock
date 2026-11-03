import Link from "next/link";
import { Github } from "lucide-react";
import { getSession } from "@/lib/better-auth/auth";
import RovexLogo from "@/components/brand/RovexLogo";
import FooterCredit from "@/components/brand/FooterCredit";
import { REPO_URL } from "@/lib/constants";

const FOOTER_LINKS = [
    { href: '/s', label: 'Stocks' },
    { href: '/compare', label: 'Guides' },
    { href: '/about', label: 'About' },
    { href: '/help', label: 'Help' },
    { href: '/api-docs', label: 'Architecture' },
    { href: '/terms', label: 'Terms' },
    { href: REPO_URL, label: 'Source' },
];

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
    // These pages are English only, so the subtree keeps English direction and typography
    // (see the [lang="en"] rule in globals.css) even when the reader picked Arabic inside the app.
    const session = await getSession();
    const signedIn = !!session?.user;

    return (
        <div lang="en" dir="ltr" className="min-h-dvh bg-page">
            <header className="sticky top-0 z-40 border-b border-transparent bg-page/80 backdrop-blur-md">
                <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-5">
                    <Link href="/" aria-label="Rovex home" className="shrink-0">
                        <RovexLogo size={27} />
                    </Link>
                    <nav className="hidden items-center gap-1 md:flex">
                        {[['/#inside', 'Product'], ['/#data', 'Data'], ['/#self-host', 'Self-host'], ['/about', 'About']].map(([href, label]) => (
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

            <main>{children}</main>

            <footer className="mx-auto mt-24 flex max-w-[1200px] flex-col gap-6 px-5 pb-10 md:flex-row md:items-center md:justify-between">
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
    );
}

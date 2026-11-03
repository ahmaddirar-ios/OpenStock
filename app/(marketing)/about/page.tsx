import Link from 'next/link';
import { Code, Globe, Scale } from 'lucide-react';
import PageHero from '@/components/marketing/PageHero';
import SectionHead from '@/components/marketing/SectionHead';
import IconCard from '@/components/marketing/IconCard';
import RovexLogo from '@/components/brand/RovexLogo';
import { REPO_URL } from '@/lib/constants';

export const metadata = {
    title: 'About',
    description: 'What Rovex is, who it is for, and how it is built.',
};

const PRINCIPLES = [
    {
        icon: Globe,
        title: 'Every market, not just the big four',
        body: 'Tadawul, US, crypto and more, with Arabic and English treated as equals rather than a translation bolted on.',
    },
    {
        icon: Code,
        title: 'Open source, auditable',
        body: 'The full source is public under AGPL-3.0. Read the chart maths, self-host it, and send a fix.',
    },
    {
        icon: Scale,
        title: 'No paywall on the core',
        body: 'Charts, studies, watchlists and the paper desk are free. Self-hosting turns on realtime quotes and alerts.',
    },
];

export default function AboutPage() {
    return (
        <>
            <PageHero
                kicker="About"
                title="A terminal for the markets the platforms skip."
                sub="Rovex is a trading terminal for the exchanges the big platforms leave out — Arabic-first, bilingual, with the charts, studies and alerts a serious trader expects."
            >
                <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-primary h-11 px-5 text-[15px]">Read the source</a>
                <Link href="/#self-host" className="btn btn-ghost h-11 px-5 text-[15px]">Self-host it</Link>
            </PageHero>

            <section className="mx-auto mt-20 max-w-[1200px] px-5">
                <SectionHead kicker="What we hold to" title="Three things we won’t trade away." />
                <div className="grid gap-3 md:grid-cols-3">
                    {PRINCIPLES.map(({ icon, title, body }) => <IconCard key={title} icon={icon} title={title}>{body}</IconCard>)}
                </div>
            </section>

            <section className="mx-auto mt-24 max-w-[1200px] px-5">
                <div className="hatch">
                    <div className="card grid items-center gap-10 p-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:p-12">
                        <div className="flex flex-col gap-4">
                            <p className="kicker text-brand-ink">The source</p>
                            <h2 className="text-[30px] font-bold leading-tight tracking-[-0.04em]">Built on OpenStock.</h2>
                            <p className="text-[16px] leading-relaxed text-muted-foreground">
                                Rovex is a deployment of OpenStock, the open-source market platform released under the
                                AGPL-3.0. The chart toolkit, the studies, the alerts and the paper desk come from that
                                project. Rovex adds the Arabic-first interface, the Tadawul coverage and this identity.
                            </p>
                            <p className="text-[16px] leading-relaxed text-muted-foreground">
                                The original work stays credited and the source stays public. That is what the licence asks
                                for, and it is what we want.
                            </p>
                            <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-ghost mt-2 self-start">
                                OpenStock on GitHub
                            </a>
                        </div>
                        <div className="relative grid aspect-square max-h-[340px] place-items-center rounded-[16px] bg-page shadow-[inset_0_0_0_1px_var(--line)]">
                            <div className="flex flex-col items-center gap-3">
                                <RovexLogo size={72} />
                                <span className="num text-[12px] tracking-[0.14em] text-faint">AGPL-3.0 · FREE TO SELF-HOST</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}

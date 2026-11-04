import Link from 'next/link';
import { Metadata } from 'next';
import { Check, Clock, Server, Sparkles } from 'lucide-react';
import PageHero from '@/components/marketing/PageHero';
import SectionHead from '@/components/marketing/SectionHead';
import WaitlistForm from '@/components/marketing/WaitlistForm';
import { REPO_URL } from '@/lib/constants';

export const metadata: Metadata = {
    title: 'Pricing',
    description: 'Rovex is free to use. Self-hosting adds realtime quotes. Rovex Cloud is coming.',
};

type Plan = {
    name: string;
    price: string;
    cadence: string;
    body: string;
    icon: typeof Server;
    cta: { label: string; href: string; external?: boolean };
    features: string[];
    highlight?: boolean;
    note?: string;
};

const PLANS: Plan[] = [
    {
        name: 'Hosted',
        price: 'Free',
        cadence: 'forever',
        body: 'Everything on rovexjo.com: charts, studies, drawing tools, watchlists, screener, paper desk and the alert centre.',
        icon: Sparkles,
        cta: { label: 'Get started', href: '/sign-up' },
        features: [
            '9 chart types and 26 studies',
            'The full drawing toolkit',
            'Watchlists, screener, compare and chart grid',
            'Paper trading and bar replay',
            'Price, indicator and volume alerts',
            'Arabic and English, treated as equals',
        ],
        note: 'Market quotes refresh every minute during a session and hourly once it closes. Tadawul quotes are ~15 minutes behind the exchange until we license an official feed, and every price says so.',
    },
    {
        name: 'Self-host',
        price: 'Your key',
        cadence: 'your server',
        body: 'Run the same terminal yourself. Bring your own market-data keys and prices refresh every 15 seconds.',
        icon: Server,
        cta: { label: 'Read the source', href: REPO_URL, external: true },
        features: [
            'Everything in Hosted',
            'Quotes every 15 seconds',
            'Email price alerts',
            'Your own database and data keys',
            'AGPL-3.0, auditable end to end',
        ],
    },
    {
        name: 'Rovex Cloud',
        price: '$5',
        cadence: 'per month · planned',
        body: 'The hosted version with nothing to install: realtime quotes, email alerts and a portfolio that follows you.',
        icon: Clock,
        cta: { label: 'See the plan', href: '#cloud' },
        features: [
            'Realtime quotes on every screen',
            'Email alerts checked every five minutes',
            'Portfolio and P&L history',
            'Priority on new markets',
        ],
        highlight: true,
    },
];

export default function PricingPage() {
    return (
        <>
            <PageHero
                kicker="Pricing"
                title="Free to use. Paid when it saves you time."
                sub="The terminal is free and open source. A hosted plan with realtime data is the part we are building next — no paywall on the analysis, ever."
            >
                <Link href="/sign-up" className="btn btn-primary h-11 px-5 text-[15px]">Start free</Link>
                <a href="#cloud" className="btn btn-ghost h-11 px-5 text-[15px]">Join the Cloud waitlist</a>
            </PageHero>

            <section className="mx-auto mt-16 max-w-[1200px] px-5">
                <div className="grid gap-4 md:grid-cols-3">
                    {PLANS.map((plan) => {
                        const Icon = plan.icon;
                        return (
                            <div
                                key={plan.name}
                                className={`flex flex-col gap-5 rounded-3xl border p-6 ${plan.highlight ? 'border-brand-ink/40 bg-white/[0.04]' : 'border-white/10 bg-white/[0.02]'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="bento-ico"><Icon /></span>
                                    <h2 className="text-[15px] font-bold">{plan.name}</h2>
                                    {plan.highlight && <span className="ms-auto rounded-full border border-brand-ink/40 px-2 py-0.5 text-[11px] font-bold text-brand-ink">Next</span>}
                                </div>
                                <div>
                                    <p className="text-[34px] font-bold leading-none tracking-[-0.03em]">{plan.price}</p>
                                    <p className="mt-1 text-[12px] text-faint">{plan.cadence}</p>
                                </div>
                                <p className="text-[13px] leading-relaxed text-muted-foreground">{plan.body}</p>
                                <ul className="flex flex-col gap-2 text-[13px]">
                                    {plan.features.map((f) => (
                                        <li key={f} className="flex items-start gap-2">
                                            <Check className="mt-0.5 size-3.5 shrink-0 text-brand-ink" />
                                            <span className="text-muted-foreground">{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-auto">
                                    {plan.cta.external ? (
                                        <a href={plan.cta.href} target="_blank" rel="noreferrer" className="btn btn-ghost h-10 w-full">{plan.cta.label}</a>
                                    ) : (
                                        <Link href={plan.cta.href} className={`btn h-10 w-full ${plan.highlight ? 'btn-primary' : 'btn-ghost'}`}>{plan.cta.label}</Link>
                                    )}
                                </div>
                                {plan.note && <p className="text-[12px] leading-relaxed text-faint">{plan.note}</p>}
                            </div>
                        );
                    })}
                </div>
            </section>

            <section id="cloud" className="mx-auto mt-24 max-w-[900px] px-5">
                <SectionHead
                    kicker="Rovex Cloud · planned"
                    title="Realtime is a data bill, not a paywall."
                    sub="Exchange data costs money per user. Cloud is how we pay that bill without closing the tools behind it: $5 a month covers realtime quotes and the email alerts that need them."
                />
                <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.02] p-6">
                    <p className="mb-4 text-[14px] font-semibold">Leave your email and we will write when Cloud opens.</p>
                    <WaitlistForm plan="cloud" />
                    <p className="mt-3 text-[12px] text-faint">
                        One email, when there is something to say. See the <Link href="/privacy" className="underline hover:text-foreground">privacy policy</Link>.
                    </p>
                </div>
            </section>

            <section className="mx-auto mt-24 max-w-[900px] px-5 pb-4">
                <SectionHead kicker="The honest part" title="What is delayed, and why." />
                <div className="mt-6 flex flex-col gap-3 text-[14px] leading-relaxed text-muted-foreground">
                    <p><b className="text-foreground">US stocks and crypto</b> come from Finnhub&apos;s free plan and are realtime during the session; the hosted site refreshes them every minute.</p>
                    <p><b className="text-foreground">Tadawul (Saudi)</b> comes from Yahoo Finance and is about 15 minutes behind the exchange. Every Saudi price prints the time of its last trade and says <span className="rounded bg-white/10 px-1 py-0.5 text-[12px]">15m delayed</span>. We will not label it live until an official feed is licensed, because a wrong number is worse than an honest one.</p>
                    <p><b className="text-foreground">Charts</b> come from TradingView&apos;s embeds where the exchange allows them, and from Yahoo candles where it does not.</p>
                </div>
            </section>
        </>
    );
}

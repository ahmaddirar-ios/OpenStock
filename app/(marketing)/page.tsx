import Link from "next/link";
import { Bell, CandlestickChart, Command, Github, Grid3x3, MailOpen, MessagesSquare } from "lucide-react";
import { MarketDial, MarketStatus } from "@/components/landing/MarketClock";
import ProductPreview from "@/components/landing/ProductPreview";
import SectionHead from "@/components/marketing/SectionHead";
import IconCard from "@/components/marketing/IconCard";
import { getSession } from "@/lib/better-auth/auth";
import { cn } from "@/lib/utils";
import { REPO_URL } from "@/lib/constants";
import { Reveal, Stagger, StaggerItem, Tilt, Magnetic } from "@/components/motion";
import HeroCanvas from "@/components/landing/HeroCanvas";

const FEATURES = [
    { icon: CandlestickChart, title: 'Charts that move', body: 'TradingView candles, technicals and financials for any listed company, full screen when you need room.' },
    { icon: Bell, title: 'Alerts by email', body: 'Set a target above or below the price. A self-hosted instance checks every five minutes and writes when it crosses.' },
    { icon: MessagesSquare, title: 'Sentiment in one read', body: 'Buzz and bullishness from Reddit, X.com, news and Polymarket, side by side for each stock.' },
    { icon: Grid3x3, title: 'The whole market', body: 'Sector heatmap, movers and top stories on one screen before the bell.' },
    { icon: Command, title: 'Find anything with ⌘K', body: 'Search every exchange Finnhub covers and open a stock as a tab, like a browser.' },
    { icon: MailOpen, title: 'A Monday digest', body: 'A short, AI-written summary of the week’s news for the stocks you watch.' },
];

type Tier = {
    name: string; price: string; per?: string; tag?: string;
    cadence: string; perHour: number; body: string; cta: { label: string; href: string };
};

const TIERS: Tier[] = [
    {
        name: 'Rovex', price: 'Free', cadence: 'Hourly', perHour: 1,
        body: 'The hosted app. Quotes refresh hourly and are shared by everyone; charts stay live from the exchange feed.',
        cta: { label: 'Get started', href: '/sign-up' },
    },
    {
        name: 'Realtime', price: 'Your key', cadence: 'Every 15 seconds', perHour: 240,
        body: 'Add your own Finnhub keys and prices refresh every 15 seconds — no subscription, no per-seat fee.',
        cta: { label: 'How to switch it on', href: '#self-host' },
    },
    {
        name: 'Self-host', price: 'Free', cadence: 'Your call', perHour: 240,
        body: 'Run Rovex on your own server with your own database: realtime quotes and alerts for you and your team.',
        cta: { label: 'Setup guide', href: '#self-host' },
    },
];

// A moving tape under the hero: the exchanges people actually watch on Rovex.
const TICKER = [
    { symbol: '2222.SR', change: '+1.18%', up: true },
    { symbol: 'AAPL', change: '+0.62%', up: true },
    { symbol: 'BTC', change: '−1.40%', up: false },
    { symbol: 'TASI', change: '+0.44%', up: true },
    { symbol: 'NVDA', change: '+2.10%', up: true },
    { symbol: '4013.SR', change: '−0.31%', up: false },
];

// 60 minutes of updates drawn as ticks: one line per refresh.
const CadenceRail = ({ perHour }: { perHour: number }) => (
    <div
        className="h-7 rounded-md bg-page shadow-[inset_0_0_0_1px_var(--line)]"
        style={{
            backgroundImage: perHour > 1
                ? `repeating-linear-gradient(90deg, var(--brand) 0 1px, transparent 1px calc(100% / ${perHour}))`
                : 'linear-gradient(90deg, var(--brand) 0 2px, transparent 2px)',
        }}
        aria-hidden
    />
);

// Floats in the empty gutter beside the 1200px column, so it only shows on screens wide enough to have one.
export default async function LandingPage() {
    const session = await getSession();
    const start = session?.user ? { href: '/dashboard', label: 'Open dashboard' } : { href: '/sign-up', label: 'Get started free' };

    return (
        <>
            <section className="mx-auto max-w-[1240px] px-5 pt-10 md:pt-16">
                <div className="mk-hero-grid">
                    <div>
                        <div className="rise-in flex flex-wrap items-center gap-3">
                            <MarketStatus />
                            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">Terminal · Arabic-first · AGPL</span>
                        </div>
                        <h1 className="mk-display mk-hero-title rise-in mt-6" style={{ animationDelay: '0.04s' }}>
                            The market,<br /><span className="mk-outline">unfiltered</span><span className="text-brand">.</span>
                        </h1>
                        <p className="rise-in mt-6 max-w-[44ch] text-[17px] leading-relaxed text-muted-foreground" style={{ animationDelay: '0.10s' }}>
                            Every exchange the big platforms skip. <span className="font-semibold text-foreground">Real charts, studies, alerts</span> and a
                            paper desk — in Arabic and English, treated as equals.
                        </p>
                        <div className="rise-in mt-8 flex flex-wrap items-center gap-2.5" style={{ animationDelay: '0.16s' }}>
                            <Magnetic><Link href={start.href} className="btn btn-primary h-11 px-5 text-[15px]">{start.label}</Link></Magnetic>
                            <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-ghost h-11 px-5 text-[15px]">
                                <Github /> Source
                            </a>
                        </div>
                    </div>
                    <Tilt max={4}>
                        <div className="mk-glass mk-stage relative overflow-hidden rounded-[26px]">
                            <div
                                className="pointer-events-none absolute inset-0"
                                aria-hidden
                                style={{ background: 'radial-gradient(120% 120% at 50% 40%, oklch(0.89 0.18 124 / 0.16), transparent 62%)' }}
                            />
                            <HeroCanvas
                                className="absolute inset-0"
                                fallback={<div className="grid h-full place-items-center p-6"><div className="w-full max-w-[280px]"><MarketDial /></div></div>}
                            />
                            <span className="mk-glass absolute left-4 top-[16%] flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-[12px] num">
                                2222.SR <b className="text-up">+1.18%</b>
                            </span>
                            <span className="mk-glass absolute bottom-[22%] right-4 flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-[12px] num">
                                BTC <b className="text-down">−1.40%</b>
                            </span>
                            <span className="absolute bottom-4 left-5 font-mono text-[12px] text-faint">
                                TADAWUL · <b className="text-brand-ink">LIVE</b> · RIYADH 15:00
                            </span>
                        </div>
                    </Tilt>
                </div>
            </section>

            <div className="mx-auto mt-16 max-w-[1240px] px-5">
                <div className="mk-ticker border-y border-line/70">
                    <div className="mk-ticker-track py-4 font-mono text-[13px]">
                        {[...TICKER, ...TICKER].map((t, i) => (
                            <span key={i} className="flex items-center gap-2 whitespace-nowrap text-muted-foreground num">
                                {t.symbol} <b className={t.up ? 'text-up' : 'text-down'}>{t.change}</b>
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            <section className="mx-auto mt-16 max-w-[1200px] px-5">
                <ProductPreview />
            </section>

            <section id="inside" className="mx-auto mt-28 max-w-[1200px] scroll-mt-24 px-5">
                <SectionHead kicker="What's inside" title="A terminal for people who aren't at a bank." sub="Everything you need to follow the market, in one place, without a subscription." />
                <Stagger className="mt-0 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {FEATURES.map(({ icon, title, body }, i) => (
                        <StaggerItem key={title} delay={i * 0.05}><IconCard icon={icon} title={title}>{body}</IconCard></StaggerItem>
                    ))}
                </Stagger>
            </section>

            <section id="data" className="mx-auto mt-28 max-w-[1200px] scroll-mt-24 px-5">
                <SectionHead
                    kicker="Data"
                    title="Pick how fresh your numbers are."
                    sub="Charts always stream live from TradingView. Quotes, watchlists and alerts come from Finnhub, and this is how often they update."
                />
                <Stagger className="grid gap-3 lg:grid-cols-3">
                    {TIERS.map((tier, i) => (
                        <StaggerItem key={tier.name} className="h-full" delay={i * 0.06}>
                        <Tilt className="h-full" max={4}>
                            <div className="mk-glass flex h-full flex-col gap-4 rounded-2xl p-5">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-[18px] font-bold tracking-[-0.02em]">{tier.name}</h3>
                                    {tier.tag && <span className="pill is-brand">{tier.tag}</span>}
                                </div>
                                <p className="bento-value text-[30px]">{tier.price}{tier.per && <small className="text-faint"> {tier.per}</small>}</p>
                                <p className="text-[14px] leading-relaxed text-muted-foreground">{tier.body}</p>
                                <div className="mt-auto flex flex-col gap-2">
                                    <CadenceRail perHour={tier.perHour} />
                                    <p className="num flex justify-between text-[12px] text-faint">
                                        <span>{tier.cadence}</span>
                                        <span>{tier.perHour} {tier.perHour === 1 ? 'update' : 'updates'} an hour</span>
                                    </p>
                                </div>
                                <Link
                                    href={tier.cta.href}
                                    className={cn('btn', tier.name === 'Community' ? 'btn-primary' : 'btn-ghost')}
                                    {...(tier.cta.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
                                >
                                    {tier.cta.label}
                                </Link>
                            </div>
                        </Tilt>
                        </StaggerItem>
                    ))}
                </Stagger>
            </section>

            <section id="self-host" className="mx-auto mt-28 grid max-w-[1200px] scroll-mt-24 items-start gap-10 px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <Reveal>
                    <SectionHead
                        kicker="Self-host"
                        title="Your server, your keys, live quotes."
                        sub="Add as many free Finnhub keys as you like: each one adds 60 requests a minute. Switch the data mode to realtime and prices refresh every 15 seconds."
                    />
                    <a href={`${REPO_URL}#docker-setup`} target="_blank" rel="noreferrer" className="btn btn-ghost">Full setup in the README</a>
                </Reveal>
                <Reveal delay={0.08}>
                    <pre className="mk-glass mono overflow-x-auto rounded-2xl p-5 text-[13px] leading-7 text-muted-foreground">
                        <span className="text-faint">$ </span><span className="text-foreground">git clone {REPO_URL}.git rovex</span>{'\n'}
                        <span className="text-faint">$ </span><span className="text-foreground">cd rovex</span>{'\n\n'}
                        <span className="text-faint"># .env (every variable is in the README)</span>{'\n'}
                        <span className="text-brand-ink">FINNHUB_API_KEYS</span>=key_one,key_two,key_three{'\n'}
                        <span className="text-brand-ink">NEXT_PUBLIC_OPENSTOCK_DATA_MODE</span>=realtime{'\n\n'}
                        <span className="text-faint">$ </span><span className="text-foreground">docker compose up -d --build</span>
                    </pre>
                </Reveal>
            </section>

            <section className="mx-auto mt-28 max-w-[1200px] px-5">
                <Reveal>
                    <div className="mk-glass grid gap-10 rounded-3xl p-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:p-12">
                        <div>
                            <p className="kicker text-brand-ink">Rovex</p>
                            <blockquote className="mt-4 text-[26px] font-semibold leading-snug tracking-[-0.03em] md:text-[30px]">
                                Every market deserves a real chart — not the ones the platforms decide to show.
                            </blockquote>
                            <div className="mt-8 flex flex-wrap gap-2">
                                <Link href={start.href} className="btn btn-primary h-11 px-5 text-[15px]">{start.label}</Link>
                                <Link href="/help" className="btn btn-ghost h-11 px-5 text-[15px]">How it works</Link>
                            </div>
                        </div>
                    </div>
                </Reveal>
            </section>
        </>
    );
}

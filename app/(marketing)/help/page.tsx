import { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, ChevronDown, Github, Server } from 'lucide-react';
import PageHero from '@/components/marketing/PageHero';
import SectionHead from '@/components/marketing/SectionHead';
import IconCard from '@/components/marketing/IconCard';
import { REPO_URL } from '@/lib/constants';

export const metadata: Metadata = {
    title: 'Help',
    description: 'Support and answers for Rovex. No paywalls, just help.',
};

const FAQS = [
    {
        question: 'Is Rovex really free?',
        answer: 'Yes. The hosted app is free: charts, watchlists, studies and the paper desk all work without paying. Self-hosting the source unlocks realtime quotes and alerts at no cost.',
    },
    {
        question: 'How do I add a stock to my watchlist?',
        answer: 'Press ⌘K (or Search stocks in the sidebar), open the company, then press Watch. It shows up in your watchlist and in the sidebar.',
    },
    {
        question: 'Where does the market data come from?',
        answer: 'Charts come live from TradingView. Quotes, watchlist prices and alerts come from Finnhub; on this site they refresh every minute while the market is open and hourly once it closes, and every price shows when it was last traded.',
    },
    {
        question: 'Which markets are supported?',
        answer: 'US stocks, crypto and forex live; Canada and Australia delayed; Saudi Arabia delayed through Yahoo Finance; India (through BSE) and Germany end of day. Alerts work for US stocks and crypto.',
    },
    {
        question: 'My alert hasn’t fired.',
        answer: 'Price alerts run on a self-hosted instance in realtime mode. There they are checked every five minutes and emailed to your account address when the price crosses your target. Check the alert’s status on the watchlist page.',
    },
    {
        question: 'Can I contribute code or designs?',
        answer: 'Absolutely. Issues labelled “good first issue” on the source repository are a good start. Designers, developers and writers are all welcome.',
    },
];

export default function HelpPage() {
    return (
        <>
            <PageHero kicker="Help" title="How can we help?" sub="Answers first, and the source when you need to go deeper." />

            <section className="mx-auto mt-14 grid max-w-[1200px] gap-3 px-5 md:grid-cols-3">
                <IconCard icon={BookOpen} title="How it works" footer={<Link href="/api-docs" className="btn btn-ghost w-full">Read the architecture</Link>}>
                    Data sources, background jobs and the AI behind the emails.
                </IconCard>
                <IconCard icon={Server} title="Self-host" footer={<Link href="/#self-host" className="btn btn-ghost w-full">See the setup</Link>}>
                    Run Rovex on your own server with realtime quotes and alerts.
                </IconCard>
                <IconCard icon={Github} title="Source & issues" footer={<a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer" className="btn btn-ghost w-full">Open an issue</a>}>
                    Found something broken? Tell us on GitHub.
                </IconCard>
            </section>

            <section className="mx-auto mt-24 max-w-[1200px] px-5">
                <SectionHead kicker="FAQ" title="Common questions." />
                <div className="hatch">
                    <div className="card row-list overflow-hidden">
                        {FAQS.map(({ question, answer }) => (
                            <details key={question} className="group">
                                {/* Padding lives on the summary so the whole row is the click target, in every browser */}
                                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-foreground transition-colors hover:bg-hover/40 [&::-webkit-details-marker]:hidden">
                                    {question}
                                    <ChevronDown className="size-4 flex-none text-faint transition-transform duration-200 group-open:rotate-180" />
                                </summary>
                                <p className="max-w-3xl px-5 pb-5 text-[15px] leading-relaxed text-muted-foreground">{answer}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            <section className="mx-auto mt-24 max-w-[1200px] px-5">
                <div className="hatch">
                    <div className="card flex flex-col items-start justify-between gap-5 p-8 md:flex-row md:items-center">
                        <div>
                            <h2 className="text-[22px] font-bold tracking-[-0.03em]">Still stuck?</h2>
                            <p className="mt-1 text-muted-foreground">Open an issue on the source repository and we’ll take a look.</p>
                        </div>
                        <a href={`${REPO_URL}/issues/new`} target="_blank" rel="noreferrer" className="btn btn-primary h-11 px-5 text-[15px]">Open an issue</a>
                    </div>
                </div>
            </section>
        </>
    );
}

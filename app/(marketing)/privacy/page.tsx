import Link from 'next/link';
import { Metadata } from 'next';
import PageHero from '@/components/marketing/PageHero';
import SectionHead from '@/components/marketing/SectionHead';

export const metadata: Metadata = {
    title: 'Privacy',
    description: 'What Rovex stores, why, and how to get it removed.',
};

const SECTIONS = [
    {
        title: 'What we store',
        body: [
            'An account is an email address and a password hash. Nothing else is required to use the terminal.',
            'If you write something in the app — a watchlist, a chart setup, a paper position, an alert — it is stored against your account so it follows you to another device.',
            'If you join a waitlist, we keep the address you typed so we can write to it once.',
        ],
    },
    {
        title: 'What we do not store',
        body: [
            'We do not ask for a phone number, a national ID or a broker credential, and we never ask for card details: there is no paid plan on sale yet.',
            'We do not sell, rent or share personal data with advertisers. There is no ad network on this site.',
        ],
    },
    {
        title: 'Cookies and local storage',
        body: [
            'One cookie keeps you signed in. The browser also stores your language, market and chart preferences locally, which is why they survive a reload without an account.',
            'The service worker keeps the shell of the app so it opens quickly; it does not read your data.',
        ],
    },
    {
        title: 'Push notifications',
        body: [
            'If you enable price alerts, the browser gives us a push endpoint and two keys. They are stored against your account and used only to deliver the alert you created.',
            'Disabling notifications in the browser, or deleting the subscription from the alert centre, removes them.',
        ],
    },
    {
        title: 'Third parties',
        body: [
            'Market data: Finnhub (US stocks, crypto) and Yahoo Finance (Tadawul). Their responses are cached on our server; the request is not tied to you.',
            'Charts: TradingView embeds. Their script runs on pages that show a chart.',
            'Hosting and database: Vercel and MongoDB Atlas, which process requests on our behalf.',
        ],
    },
    {
        title: 'Your rights',
        body: [
            'You can delete your account from the profile page, which removes the watchlists, setups, positions and alerts attached to it.',
            'For anything the app does not delete itself — a waitlist entry, for example — write to the address below and it is removed.',
        ],
    },
] as const;

export default function PrivacyPage() {
    return (
        <>
            <PageHero
                kicker="Privacy · Last updated November 2026"
                title="Your data, in plain language."
                sub="Short version: an email to sign in, what you create to be useful, and nothing sold to anyone."
            />

            <section className="mx-auto mt-16 max-w-[900px] px-5">
                <div className="flex flex-col gap-10">
                    {SECTIONS.map((section) => (
                        <div key={section.title}>
                            <SectionHead kicker="" title={section.title} />
                            <div className="mt-3 flex flex-col gap-3 text-[14px] leading-relaxed text-muted-foreground">
                                {section.body.map((p) => <p key={p}>{p}</p>)}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-14 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-[13px] text-muted-foreground">
                    <p>
                        Questions, or a deletion request: use the repository&apos;s issue tracker or the contact shown on the{' '}
                        <Link href="/about" className="underline hover:text-foreground">about page</Link>. See also the{' '}
                        <Link href="/terms" className="underline hover:text-foreground">terms of service</Link>.
                    </p>
                    <p className="mt-3">
                        <b className="text-foreground">Market data notice:</b> quotes shown here may be delayed (Tadawul is about 15 minutes behind the exchange). Nothing on this site is investment advice.
                    </p>
                </div>
            </section>
        </>
    );
}

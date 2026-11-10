import Link from 'next/link';
import { CircleDollarSign, Code2, KeyRound, Timer } from 'lucide-react';
import PageHero from '@/components/marketing/PageHero';
import SectionHead from '@/components/marketing/SectionHead';
import IconCard from '@/components/marketing/IconCard';

export const metadata = {
    title: 'API',
    description: 'Read Rovex candles, quotes and indicators from your own scripts with a REST API key.',
};

const ENDPOINTS = [
    { method: 'GET', path: '/api/v1/candles', body: 'OHLCV bars for one symbol and interval. `limit` keeps the newest N bars.' },
    { method: 'GET', path: '/api/v1/quote', body: 'Last price, change and percent for one symbol, or up to 25 comma-separated symbols.' },
    { method: 'GET', path: '/api/v1/indicators', body: 'One study over the same bars: sma, ema, rsi, macd, bollinger, atr, adx, obv or vwap.' },
    { method: 'GET', path: '/api/v1/me', body: 'The account, plan and remaining hourly quota. Costs nothing.' },
];

const LIMITS = [
    ['Premium', '3,000 requests / hour'],
    ['Pro', '600 requests / hour'],
    ['Free (granted by exception)', '60 requests / hour'],
];

const ERRORS = [
    ['invalid_key', '401', 'No key, or not a key we issued.'],
    ['revoked_key', '401', 'The key was revoked from the profile page.'],
    ['expired_key', '401', 'The key passed its expiry date.'],
    ['plan_required', '403', 'The account’s plan does not include API access.'],
    ['rate_limited', '429', 'The hourly quota is spent. `Retry-After` says when to come back.'],
    ['invalid_symbol', '400', 'Missing or malformed symbol.'],
    ['invalid_param', '400', 'An unknown indicator, or a value outside its range.'],
    ['not_found', '404', 'No data for that symbol and interval.'],
    ['upstream_error', '5xx', 'The data provider failed, or the series is too short for the study.'],
];

const Code = ({ children }: { children: string }) => (
    <pre className="mk-glass mono overflow-x-auto rounded-2xl p-5 text-[12.5px] leading-6 text-muted-foreground">{children}</pre>
);

export default function ApiPage() {
    return (
        <>
            <PageHero
                kicker="REST API v1"
                title="The terminal, without the tab."
                sub="Read the same candles, quotes and indicators the chart draws — from a bot, a spreadsheet, or your own dashboard. One key, a plain HTTPS request, JSON back."
            >
                <Link href="/profile" className="btn btn-primary h-11 px-5 text-[15px]">Create a key</Link>
                <Link href="/pricing" className="btn btn-ghost h-11 px-5 text-[15px]">See plans</Link>
            </PageHero>

            <section className="mx-auto mt-16 max-w-[1200px] px-5">
                <div className="grid gap-3 md:grid-cols-3">
                    <IconCard icon={KeyRound} title="Keys live on your profile">Create, name and revoke keys yourself. The secret is shown once; only its hash is stored.</IconCard>
                    <IconCard icon={Timer} title="A quota, not a surprise">Every response carries RateLimit-Limit, RateLimit-Remaining and RateLimit-Reset headers.</IconCard>
                    <IconCard icon={Code2} title="The chart’s own maths">Indicators call the same functions the chart does, so a reading never disagrees with the pane.</IconCard>
                </div>
            </section>

            <section className="mx-auto mt-20 max-w-[1200px] px-5">
                <SectionHead kicker="Authentication" title="Two headers, one key." sub="API access is included with Pro and Premium. Copy a key from the profile page and put it on every request; there is no token exchange step." />
                <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">x-api-key</p>
                        <Code>{'curl -H "x-api-key: rvx_..." \\\n  "https://rovexjo.com/api/v1/me"'}</Code>
                    </div>
                    <div>
                        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">Authorization</p>
                        <Code>{'curl -H "Authorization: Bearer rvx_..." \\\n  "https://rovexjo.com/api/v1/me"'}</Code>
                    </div>
                </div>
            </section>

            <section className="mx-auto mt-20 max-w-[1200px] px-5">
                <SectionHead kicker="Endpoints" title="Four calls, one shape." />
                <div className="hatch">
                    <div className="card overflow-x-auto">
                        <table className="w-full text-left text-[14px]">
                            <thead className="text-[11px] uppercase tracking-[0.14em] text-faint">
                                <tr>
                                    <th className="px-5 py-3 font-semibold">Method</th>
                                    <th className="px-5 py-3 font-semibold">Path</th>
                                    <th className="px-5 py-3 font-semibold">Returns</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ENDPOINTS.map((endpoint) => (
                                    <tr key={endpoint.path} className="border-t border-white/5">
                                        <td className="px-5 py-4"><span className="pill is-up font-mono">{endpoint.method}</span></td>
                                        <td className="whitespace-nowrap px-5 py-4 font-mono text-[13px]">{endpoint.path}</td>
                                        <td className="px-5 py-4 text-muted-foreground">{endpoint.body}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section className="mx-auto mt-20 max-w-[1200px] px-5">
                <SectionHead kicker="Examples" title="Candles, then an indicator." />
                <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">curl</p>
                        <Code>{'curl -H "x-api-key: $ROVEX_KEY" \\\n  "https://rovexjo.com/api/v1/candles?symbol=2222.SR&interval=1d&limit=3"'}</Code>
                        <p className="mt-3 mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">JavaScript</p>
                        <Code>{'const res = await fetch(\n  "https://rovexjo.com/api/v1/indicators?symbol=AAPL&indicator=rsi",\n  { headers: { "x-api-key": process.env.ROVEX_KEY } },\n);\nconst { points } = await res.json();'}</Code>
                    </div>
                    <div>
                        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">Python</p>
                        <Code>{'import os, requests\n\nr = requests.get(\n    "https://rovexjo.com/api/v1/quote",\n    params={"symbols": "AAPL,2222.SR"},\n    headers={"x-api-key": os.environ["ROVEX_KEY"]},\n    timeout=10,\n)\nr.raise_for_status()\nprint(r.json()["quotes"])'}</Code>
                        <p className="mt-3 mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">Candle shape</p>
                        <Code>{'{\n  "symbol": "2222.SR",\n  "interval": "1d",\n  "currency": "SAR",\n  "candles": [\n    { "t": 1762387200, "o": 28.4, "h": 28.9,\n      "l": 28.2, "c": 28.7, "v": 5123400 }\n  ]\n}'}</Code>
                    </div>
                </div>
            </section>

            <section className="mx-auto mt-20 max-w-[1200px] px-5">
                <div className="grid gap-3 lg:grid-cols-2">
                    <div className="hatch">
                        <div className="card p-6">
                            <div className="flex items-center gap-2">
                                <span className="bento-ico"><CircleDollarSign /></span>
                                <h2 className="text-[20px] font-bold tracking-[-0.03em]">Limits</h2>
                            </div>
                            <table className="mt-4 w-full text-left text-[14px]">
                                <tbody>
                                    {LIMITS.map(([plan, limit]) => (
                                        <tr key={plan} className="border-t border-white/5">
                                            <td className="py-3 font-semibold">{plan}</td>
                                            <td className="py-3 text-muted-foreground">{limit}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="mt-4 text-[13px] text-muted-foreground">The window is fixed and hourly. A quote for several symbols costs one unit per symbol.</p>
                        </div>
                    </div>
                    <div className="hatch">
                        <div className="card p-6">
                            <h2 className="text-[20px] font-bold tracking-[-0.03em]">Errors</h2>
                            <table className="mt-4 w-full text-left text-[13.5px]">
                                <thead className="text-[11px] uppercase tracking-[0.14em] text-faint">
                                    <tr><th className="py-2 font-semibold">Code</th><th className="py-2 font-semibold">Status</th><th className="py-2 font-semibold">Meaning</th></tr>
                                </thead>
                                <tbody>
                                    {ERRORS.map(([code, status, meaning]) => (
                                        <tr key={code} className="border-t border-white/5">
                                            <td className="whitespace-nowrap py-2 font-mono text-[12px]">{code}</td>
                                            <td className="py-2 text-muted-foreground">{status}</td>
                                            <td className="py-2 text-muted-foreground">{meaning}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="mt-4 text-[13px] text-muted-foreground">Every failure is <span className="font-mono">{'{ "error": { "code", "message" } }'}</span>.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mx-auto mt-24 max-w-[1200px] px-5 pb-24">
                <div className="hatch">
                    <div className="card flex flex-wrap items-center justify-between gap-4 p-8">
                        <div>
                            <h2 className="text-[26px] font-bold tracking-[-0.04em]">Ready to script it?</h2>
                            <p className="mt-1 text-[15px] text-muted-foreground">Create a key from your profile. It takes one click and is shown once.</p>
                        </div>
                        <Link href="/profile" className="btn btn-primary h-11 px-5 text-[15px]">Go to profile</Link>
                    </div>
                </div>
            </section>
        </>
    );
}

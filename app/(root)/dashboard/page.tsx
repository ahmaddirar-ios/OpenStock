import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { CandlestickChart } from "lucide-react";
import Panel from "@/components/Panel";
import YahooChart from "@/components/stocks/YahooChart";
import StockChart from "@/components/stocks/StockChart";
import MarketWatch from "@/components/markets/MarketWatch";
import PortfolioWidget from "@/components/portfolio/PortfolioWidget";
import MarketRibbon from "@/components/markets/MarketRibbon";
import NewsStrip from "@/components/news/NewsStrip";
import DashboardBoard from "@/components/dashboard/DashboardBoard";
import { AlertsCard, PortfolioCard, ScannerCard, ScreenersCard, StrategiesCard, WatchlistCard } from "@/components/dashboard/BoardWidgets";
import { getSaudiMarketNews } from "@/lib/actions/news.actions";
import { getDashboardLayout } from "@/lib/actions/dashboard.actions";
import { isFlagEnabled } from "@/lib/flags";
import { loadWorldBoard } from "@/lib/market/world-board";
import { getLang } from "@/lib/i18n-server";
import { tx, type Lang } from "@/lib/i18n";
import { LAST_SYMBOL_KEY, overviewSymbol } from "@/lib/shell/command";
import { formatSymbolForTradingView, isChartEmbeddable, tradingViewSymbolUrl } from "@/lib/utils";
import { yahooCandleSymbol } from "@/lib/market/yahoo-candles";
import { isIndexSymbol } from "@/lib/market/yahoo";

export const metadata = {
    title: "Overview",
    description: "One screen: the chart you were reading, the market watch beside it, and the news underneath.",
};

const scriptUrl = `https://s3.tradingview.com/external-embedding/embed-widget-`;

// One panel is one fill: the pane owns the height, the chart stretches inside it. The terminal
// shell is dense — a 30px header, no hatch weave, no subtitle standing between the eye and the data.
const PANE = { className: "min-h-0", bodyClassName: "flex min-h-0 flex-1 flex-col", dense: true } as const;
// The badge is also the way out of the pane: it opens the full stock page with the same chart.
const SYMBOL_BADGE = (symbol: string) => (
    <Link
        href={`/stocks/${encodeURIComponent(symbol)}`}
        className="pill mono h-7 px-2.5 text-[12px] transition-colors hover:bg-hover"
        dir="ltr"
    >
        {symbol}
    </Link>
);

// The overview's news, on a strip: below the chart, above the status bar.
async function MarketNews({ lang }: { lang: Lang }) {
    const news = await getSaudiMarketNews(8, lang).catch(() => [] as MarketNewsArticle[]);
    return <NewsStrip news={news} lang={lang} />;
}

// The pane beside the chart: the same delayed board /world reads, so the two can never disagree.
async function MarketWatchPane({ lang }: { lang: Lang }) {
    const board = await loadWorldBoard();
    return (
        <Panel title={tx(lang, "marketWatch.title")} sub={tx(lang, "marketWatch.sub")} {...PANE}>
            <MarketWatch initial={board} lang={lang} fill />
        </Panel>
    );
}

/** One card's shape while its own read is in flight, so the board never jumps. */
function BoardCardSkeleton() {
    return <div className="card h-full min-h-[74px] animate-pulse bg-hover/40" aria-hidden />;
}

function MarketWatchSkeleton({ lang }: { lang: Lang }) {
    return (
        <Panel title={tx(lang, "marketWatch.title")} sub={tx(lang, "marketWatch.sub")} {...PANE}>
            <div className="m-2.5 min-h-[200px] flex-1 animate-pulse rounded-lg bg-hover/40" />
        </Panel>
    );
}

/**
 * The terminal's workspace, the way a broker lays one out: the chart on one side, the market watch
 * docked beside it, both of them filling the window, and the day's headlines on a strip underneath.
 *
 * The chart opens on the last stock the trader read (the shell keeps it in a cookie and in
 * localStorage), falling back to the index on a first visit. Tadawul and the index have no
 * TradingView embed, so they are drawn from Yahoo's candles by our own chart; the exchanges
 * TradingView does license get its widget with the indicator picker.
 */
export default async function Overview() {
    const [lang, jar, boardOn, layout] = await Promise.all([
        getLang(),
        cookies(),
        isFlagEnabled('dashboard.board', true),
        getDashboardLayout().catch(() => null),
    ]);
    const symbol = overviewSymbol(jar.get(LAST_SYMBOL_KEY)?.value);
    const tvSymbol = formatSymbolForTradingView(symbol);
    // The Tadawul All Shares Index is the one symbol here that is not a company, and its usual
    // daily bar has no history in Yahoo's 730-day window — an hourly bar does.
    const isIndex = isIndexSymbol(symbol);

    return (
        <div className="overview">
            {/* The trader's own cards, above the chart. Each streams inside its own boundary, so a
                slow account read never holds up the chart. The whole board is a feature flag. */}
            {boardOn && layout && (
                <DashboardBoard
                    lang={lang}
                    layout={layout}
                    widgets={{
                        portfolio: <Suspense fallback={<BoardCardSkeleton />}><PortfolioCard lang={lang} /></Suspense>,
                        watchlist: <Suspense fallback={<BoardCardSkeleton />}><WatchlistCard lang={lang} /></Suspense>,
                        alerts: <Suspense fallback={<BoardCardSkeleton />}><AlertsCard lang={lang} /></Suspense>,
                        scanner: <Suspense fallback={<BoardCardSkeleton />}><ScannerCard lang={lang} /></Suspense>,
                        strategies: <Suspense fallback={<BoardCardSkeleton />}><StrategiesCard lang={lang} /></Suspense>,
                        screeners: <Suspense fallback={<BoardCardSkeleton />}><ScreenersCard lang={lang} /></Suspense>,
                    }}
                />
            )}
            {/* The day, in one line, before the work: indices and totals. It streams, so the chart
                never waits on a scanner call — and it keeps its height while it does. */}
            <Suspense fallback={<div className="terminal-ribbon is-empty" aria-hidden />}>
                <MarketRibbon lang={lang} />
            </Suspense>
            <div className="overview-grid">
                {isChartEmbeddable(tvSymbol) ? (
                    <StockChart tvSymbol={tvSymbol} scriptUrl={`${scriptUrl}advanced-chart.js`} lang={lang} fill />
                ) : yahooCandleSymbol(symbol) ? (
                    // No panel title on the chart: the quote header inside the chart is the title —
                    // the instrument, its last print and its session, one line, the way a terminal
                    // names the pane it is drawing in.
                    <section className="hatch is-dense min-h-0">
                        <div className="card flex min-h-0 flex-1 flex-col">
                            <YahooChart
                                symbol={symbol}
                                tvSymbol={tvSymbol}
                                lang={lang}
                                preferredInterval={isIndex ? "60m" : undefined}
                                fill
                            />
                        </div>
                    </section>
                ) : (
                    // TradingView refuses this exchange's chart in embeds; say so instead of an error box
                    <Panel
                        title={tx(lang, "stock.chart")}
                        sub={tx(lang, "stock.chartTVOnly")}
                        action={SYMBOL_BADGE(symbol)}
                        {...PANE}
                    >
                        <div className="empty-state flex-1 py-10">
                            <span className="empty-icon"><CandlestickChart className="size-5" /></span>
                            <h3>{tx(lang, "stock.chartUnavailable")}</h3>
                            <p className="max-w-80 text-[13px]">
                                {tx(lang, "stock.chartBlocked").replace("{x}", tvSymbol.split(":")[0])}
                            </p>
                            <a href={tradingViewSymbolUrl(tvSymbol)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost mt-2">
                                {tx(lang, "stock.openTV")}
                            </a>
                        </div>
                    </Panel>
                )}

                <div className="flex min-h-0 flex-col gap-2">
                    <Suspense fallback={null}>
                        <PortfolioWidget lang={lang} />
                    </Suspense>
                    <Suspense fallback={<MarketWatchSkeleton lang={lang} />}>
                        <MarketWatchPane lang={lang} />
                    </Suspense>
                </div>
            </div>

            <Suspense fallback={null}>
                <MarketNews lang={lang} />
            </Suspense>
        </div>
    );
}

import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { CandlestickChart } from "lucide-react";
import Panel from "@/components/Panel";
import YahooChart from "@/components/stocks/YahooChart";
import StockChart from "@/components/stocks/StockChart";
import MarketWatch from "@/components/markets/MarketWatch";
import NewsStrip from "@/components/news/NewsStrip";
import { getSaudiMarketNews } from "@/lib/actions/news.actions";
import { loadWorldBoard } from "@/lib/world-board";
import { getLang } from "@/lib/i18n-server";
import { tx, type Lang } from "@/lib/i18n";
import { LAST_SYMBOL_KEY, overviewSymbol } from "@/lib/shell/command";
import { formatSymbolForTradingView, isChartEmbeddable, tradingViewSymbolUrl } from "@/lib/utils";
import { yahooCandleSymbol } from "@/lib/yahoo-candles";
import { isIndexSymbol } from "@/lib/yahoo";

export const metadata = {
    title: "Overview",
    description: "One screen: the chart you were reading, the market watch beside it, and the news underneath.",
};

const scriptUrl = `https://s3.tradingview.com/external-embedding/embed-widget-`;

// One panel is one fill: the pane owns the height, the chart stretches inside it.
const PANE = { className: "min-h-0", bodyClassName: "flex min-h-0 flex-1 flex-col" } as const;
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
    const [lang, jar] = await Promise.all([getLang(), cookies()]);
    const symbol = overviewSymbol(jar.get(LAST_SYMBOL_KEY)?.value);
    const tvSymbol = formatSymbolForTradingView(symbol);
    // The Tadawul All Shares Index is the one symbol here that is not a company, and its usual
    // daily bar has no history in Yahoo's 730-day window — an hourly bar does.
    const isIndex = isIndexSymbol(symbol);

    return (
        <div className="overview">
            <div className="overview-grid">
                {isChartEmbeddable(tvSymbol) ? (
                    <StockChart tvSymbol={tvSymbol} scriptUrl={`${scriptUrl}advanced-chart.js`} lang={lang} fill />
                ) : yahooCandleSymbol(symbol) ? (
                    <Panel
                        title={tx(lang, "stock.chart")}
                        sub={tx(lang, "stock.chartYahoo")}
                        action={SYMBOL_BADGE(symbol)}
                        {...PANE}
                    >
                        <YahooChart
                            symbol={symbol}
                            tvSymbol={tvSymbol}
                            lang={lang}
                            preferredInterval={isIndex ? "60m" : undefined}
                            fill
                        />
                    </Panel>
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

                <Suspense fallback={<MarketWatchSkeleton lang={lang} />}>
                    <MarketWatchPane lang={lang} />
                </Suspense>
            </div>

            <Suspense fallback={null}>
                <MarketNews lang={lang} />
            </Suspense>
        </div>
    );
}

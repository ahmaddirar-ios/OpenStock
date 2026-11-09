import { Suspense } from "react";
import { CandlestickChart } from "lucide-react";
import TradingViewWidget from "@/components/TradingViewWidget";
import StockHeader, { StockHeaderSkeleton } from "@/components/stocks/StockHeader";
import StockSentimentCard from "@/components/stocks/StockSentimentCard";
import StockChart from "@/components/stocks/StockChart";
import YahooChart from "@/components/stocks/YahooChart";
import Panel from "@/components/Panel";
import MarketWatch from "@/components/markets/MarketWatch";
import { loadWorldBoard } from "@/lib/world-board";
import NewsList from "@/components/watchlist/NewsList";
import NewsSkeleton from "@/components/watchlist/NewsSkeleton";
import { getCompanyNews } from "@/lib/actions/news.actions";
import {
    TECHNICAL_ANALYSIS_WIDGET_CONFIG,
    COMPANY_PROFILE_WIDGET_CONFIG,
    COMPANY_FINANCIALS_WIDGET_CONFIG,
} from "@/lib/constants";
import { getStockSentimentInsights } from '@/lib/actions/adanos.actions';
import { getStockMetrics } from '@/lib/actions/finnhub.actions';
import { formatSymbolForTradingView, isChartEmbeddable, tradingViewSymbolUrl } from '@/lib/utils';
import { isIndexSymbol, isTadawulSymbol } from '@/lib/yahoo';
import { fetchSaudiFundamentals } from '@/lib/saudi-fundamentals';
import SaudiFundamentalsPanel from '@/components/stocks/SaudiFundamentals';
import { yahooCandleSymbol } from '@/lib/yahoo-candles';
import { decodePatternLink } from '@/lib/pattern-link';
import { getLang } from '@/lib/i18n-server';
import { tx, type Lang } from '@/lib/i18n';
import { arDigits } from "@/lib/i18n";

const scriptUrl = `https://s3.tradingview.com/external-embedding/embed-widget-`;

async function CompanyNews({ symbol, lang }: { symbol: string; lang: Lang }) {
    return <NewsList news={await getCompanyNews(symbol, 6, lang)} lang={lang} />;
}

// The pane beside the chart: the same delayed board /world reads, so the two can never disagree.
async function MarketWatchPanel({ lang }: { lang: Lang }) {
    const board = await loadWorldBoard();
    return (
        <Panel title={tx(lang, 'marketWatch.title')} sub={tx(lang, 'marketWatch.sub')}>
            <MarketWatch initial={board} lang={lang} />
        </Panel>
    );
}

function MarketWatchSkeleton({ lang }: { lang: Lang }) {
    return (
        <Panel title={tx(lang, 'marketWatch.title')} sub={tx(lang, 'marketWatch.sub')}>
            <div className="m-3 h-[380px] animate-pulse rounded-lg bg-hover/40" />
        </Panel>
    );
}

async function Sentiment({ symbol, lang }: { symbol: string; lang: Lang }) {
    const insight = await getStockSentimentInsights(symbol);
    if (!insight) return null;
    return (
        <Panel title={tx(lang, 'stock.sentiment')} sub={tx(lang, 'stock.sentimentSub')}>
            <StockSentimentCard insight={insight} lang={lang} />
        </Panel>
    );
}

// Tadawul dividends and results: the exchange data comes from the scanner, not from Finnhub.
async function SaudiDividends({ symbol, lang }: { symbol: string; lang: Lang }) {
    const fundamentals = await fetchSaudiFundamentals([symbol]);
    return <SaudiFundamentalsPanel fundamentals={fundamentals[symbol] ?? null} lang={lang} />;
}

async function DividendYield({ symbol, lang }: { symbol: string; lang: Lang }) {
    const dividendYield = await getStockMetrics(symbol);
    return (
        <Panel title={tx(lang, 'stock.dividend')}>
            <p className="text-2xl font-semibold text-foreground">
                {dividendYield !== null ? `${arDigits(dividendYield.toFixed(2), lang)}%` : "—"}
            </p>
        </Panel>
    );
}

// Charts come straight from TradingView (live, no quota); only the header waits on Finnhub, and it streams.
export default async function StockDetails({ params, searchParams }: StockDetailsPageProps) {
    const { symbol: rawSymbol } = await params;
    const symbol = decodeURIComponent(rawSymbol).toUpperCase();
    const tvSymbol = formatSymbolForTradingView(symbol);
    const [lang, query] = await Promise.all([getLang(), searchParams]);
    // The scanner's token names the bars it measured on, so the chart opens on them; every other
    // visit keeps the page's own preference (the index has no daily series in this feed).
    const patternToken = typeof query?.pattern === 'string' ? query.pattern : undefined;
    const patternLink = decodePatternLink(patternToken);
    const patternInterval = patternLink?.intervalId;
    // The Tadawul All Shares Index is the one symbol here that is not a company.
    const isIndex = isIndexSymbol(symbol);
    const isTadawul = isTadawulSymbol(symbol);

    return (
        <>
            <Suspense fallback={<StockHeaderSkeleton />}>
                <StockHeader symbol={symbol} lang={lang} />
            </Suspense>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
                <div className="flex min-w-0 flex-col gap-3">
                    {isChartEmbeddable(tvSymbol) ? (
                        <StockChart tvSymbol={tvSymbol} scriptUrl={`${scriptUrl}advanced-chart.js`} lang={lang} />
                    ) : yahooCandleSymbol(symbol) ? (
                        // TradingView will not embed this exchange, so the chart is drawn from Yahoo's
                        // candles. No panel head: the header card above already names the symbol and
                        // says the price is Yahoo's, and the chart carries its own toolbar — a title
                        // here would be 60px of furniture over the one thing the page is for.
                        <Panel className="h-[clamp(420px,62dvh,660px)]" bodyClassName="flex min-h-0 flex-1 flex-col">
                            <YahooChart
                                symbol={symbol}
                                tvSymbol={tvSymbol}
                                lang={lang}
                                preferredInterval={patternInterval ?? (isIndex ? '60m' : undefined)}
                                initialPattern={patternToken}
                                fill
                                quote={false}
                            />
                        </Panel>
                    ) : (
                        // TradingView refuses this exchange's chart in embeds; say so instead of showing its error
                        <Panel title={tx(lang, 'stock.chart')} sub={tx(lang, 'stock.chartTVOnly')}>
                            <div className="empty-state py-14">
                                <span className="empty-icon"><CandlestickChart className="size-5" /></span>
                                <h3>{tx(lang, 'stock.chartUnavailable')}</h3>
                                <p className="max-w-80 text-[13px]">
                                    {tx(lang, 'stock.chartBlocked').replace('{x}', tvSymbol.split(':')[0])}
                                </p>
                                <a href={tradingViewSymbolUrl(tvSymbol)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost mt-2">
                                    {tx(lang, 'stock.openTV')}
                                </a>
                            </div>
                        </Panel>
                    )}
                    {/* An index has no company to report on: the panels below would each read "—". */}
                    {!isIndex && (
                        <Panel title={tx(lang, 'stock.financials')} sub={tx(lang, 'stock.financialsSub')}>
                            <TradingViewWidget
                                scriptUrl={`${scriptUrl}financials.js`}
                                config={COMPANY_FINANCIALS_WIDGET_CONFIG(tvSymbol)}
                                height={500}
                            />
                        </Panel>
                    )}
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                    <Suspense fallback={<MarketWatchSkeleton lang={lang} />}>
                        <MarketWatchPanel lang={lang} />
                    </Suspense>
                    <Panel title={tx(lang, 'stock.technicals')} sub={tx(lang, 'stock.technicalsSub')}>
                        <TradingViewWidget
                            scriptUrl={`${scriptUrl}technical-analysis.js`}
                            config={TECHNICAL_ANALYSIS_WIDGET_CONFIG(tvSymbol)}
                            height={400}
                        />
                    </Panel>
                    {!isIndex && (
                        <>
                            <Suspense fallback={null}>
                                {isTadawul ? <SaudiDividends symbol={symbol} lang={lang} /> : <DividendYield symbol={symbol} lang={lang} />}
                            </Suspense>
                            <Suspense fallback={null}>
                                <Sentiment symbol={symbol} lang={lang} />
                            </Suspense>
                            <Panel title={tx(lang, 'stock.news')} sub={tx(lang, 'stock.newsSub')}>
                                <Suspense fallback={<NewsSkeleton rows={3} />}>
                                    <CompanyNews symbol={symbol} lang={lang} />
                                </Suspense>
                            </Panel>
                        </>
                    )}
                    <Panel title={tx(lang, 'stock.profile')} sub={tx(lang, 'stock.profileSub')}>
                        <TradingViewWidget
                            scriptUrl={`${scriptUrl}symbol-profile.js`}
                            config={COMPANY_PROFILE_WIDGET_CONFIG(tvSymbol)}
                            height={440}
                        />
                    </Panel>
                </div>
            </div>
        </>
    );
}

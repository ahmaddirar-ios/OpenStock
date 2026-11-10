import { Plus } from 'lucide-react';
import { getUserPositions, getUserTrades, getPortfolioBenchmark, getCashBalances } from '@/lib/actions/portfolio.actions';
import { getWatchlistData } from '@/lib/actions/finnhub.actions';
import PortfolioTable, { type PortfolioRow } from '@/components/portfolio/PortfolioTable';
import PositionFormModal from '@/components/portfolio/PositionFormModal';
import TradeLedger from '@/components/portfolio/TradeLedger';
import BenchmarkCard from '@/components/portfolio/BenchmarkCard';
import CashCard from '@/components/portfolio/CashCard';
import EquityCurveCard from '@/components/portfolio/EquityCurveCard';
import { buildLedger, buildEquityCurve, mergePositions, totalReturnPercent, type PriceBar } from '@/lib/portfolio-ledger';
import { groupByCurrency, normalizeCurrency, sumByCurrency, computePositionMetrics } from '@/lib/portfolio';
import { getStrategyCandles } from '@/lib/actions/yahoo-candles.actions';
import { isTadawulSymbol } from '@/lib/market/yahoo';
import { getLang } from '@/lib/i18n-server';
import { tx, arDigits } from '@/lib/i18n';
import { requireFeaturePage } from '@/lib/entitlements-server';

// Positions are read from Mongo first; the quotes for them stream from the shared quote path,
// the same one the watchlist uses (Finnhub for US/crypto, Yahoo for Tadawul).
//
// Two sources feed the table: the trade ledger (replayed FIFO) and hand-entered positions. A symbol
// the ledger knows is taken from the ledger only, so importing history never doubles a holding.
export default async function PortfolioPage() {
    await requireFeaturePage('page.portfolio');

    const [positions, trades, cash] = await Promise.all([getUserPositions(), getUserTrades(), getCashBalances()]);
    const ledger = buildLedger(trades);
    const merged = mergePositions(positions, ledger.positions);

    const symbols: string[] = merged.map((p) => p.symbol);
    const quotes = symbols.length ? await getWatchlistData(symbols) : [];
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));

    const rows: PortfolioRow[] = merged.map((p) => {
        const q = bySymbol.get(p.symbol);
        return {
            symbol: p.symbol,
            company: q?.name || p.company || p.symbol,
            quantity: p.quantity,
            averageCost: p.averageCost,
            price: q?.price ?? 0,
            change: q?.change ?? 0,
            changePercent: q?.changePercent ?? 0,
            currency: q?.currency || 'USD',
            logo: q?.logo,
            source: p.source,
            realizedPnl: p.realizedPnl,
        };
    });

    // Totals are per currency, never added across currencies: a riyal total and a dollar total are
    // different money, and converting them needs an FX rate this app does not keep. The benchmark,
    // the headline return and the ledger all speak for the currency that carries the most value.
    const metricsOf = (row: PortfolioRow) =>
        computePositionMetrics({ quantity: row.quantity, averageCost: row.averageCost, price: row.price, change: row.change });
    const split = groupByCurrency(rows, (row) => row.currency, metricsOf);
    const currency = split.dominant;
    const headline = split.groups.find((group) => group.currency === currency)?.totals
        ?? { costBasis: 0, marketValue: 0, unrealizedPnl: 0, unrealizedPnlPercent: 0, dayChangeValue: 0, positions: 0, priced: 0 };

    // A symbol's currency is the quote's, and for a symbol the ledger has closed but the table no
    // longer holds, the exchange the ticker belongs to decides it.
    const currencyBySymbol: Record<string, string> = {};
    for (const row of rows) currencyBySymbol[row.symbol] = normalizeCurrency(row.currency);
    for (const trade of trades) {
        if (!currencyBySymbol[trade.symbol]) currencyBySymbol[trade.symbol] = isTadawulSymbol(trade.symbol) ? 'SAR' : 'USD';
    }

    const realizedByCurrency = sumByCurrency(ledger.sales, (sale) => currencyBySymbol[sale.symbol], (sale) => sale.pnl);
    const realizedInHeadline = realizedByCurrency.find((entry) => entry.currency === currency)?.value ?? 0;
    const realizedCostBasis = ledger.sales
        .filter((sale) => normalizeCurrency(currencyBySymbol[sale.symbol]) === currency)
        .reduce((sum, sale) => sum + sale.cost, 0);
    const portfolioReturnPct = totalReturnPercent({
        unrealizedPnl: headline.unrealizedPnl,
        realizedPnl: realizedInHeadline,
        openCostBasis: headline.costBasis,
        realizedCostBasis,
    });

    const since =
        trades.length > 0
            ? trades[0].tradedAt
            : positions.length > 0
              ? positions[positions.length - 1].createdAt
              : new Date().toISOString();
    const benchmark = rows.length > 0 ? await getPortfolioBenchmark(since, currency) : null;

    // The curve needs a daily close for every symbol the ledger ever touched. The calls are cached
    // for an hour, and the list is capped so a large ledger cannot turn one page into fifty fetches.
    const curveSymbols = [...new Set(trades.map((trade) => trade.symbol))].slice(0, 20);
    const priceSets = await Promise.all(
        curveSymbols.map(async (symbol) => {
            const set = await getStrategyCandles(symbol, '1d').catch(() => null);
            return [symbol, set ? set.candles.map((candle) => ({ time: candle.time, close: candle.close })) : []] as const;
        })
    );
    const prices: Record<string, PriceBar[]> = Object.fromEntries(priceSets);
    const equity = buildEquityCurve(trades, prices);

    const lang = await getLang();

    return (
        <>
            <header className="page-head">
                <div>
                    <h1 className="page-title">{tx(lang, 'pf.title')}</h1>
                    <p className="page-sub num">{rows.length === 1 ? tx(lang, 'pf.subOne') : tx(lang, 'pf.sub').replace('{n}', arDigits(rows.length, lang))}</p>
                </div>
                <PositionFormModal lang={lang}>
                    <button type="button" className="btn btn-primary"><Plus /> {tx(lang, 'pf.add')}</button>
                </PositionFormModal>
            </header>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
                <div className="flex min-w-0 flex-col gap-3">
                    <PortfolioTable initialRows={rows} lang={lang} />
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                    <BenchmarkCard benchmark={benchmark} portfolioReturnPct={portfolioReturnPct} currency={currency} mixed={split.mixed} lang={lang} />
                    <CashCard
                        balances={cash}
                        invested={split.groups.map((group) => ({ currency: group.currency, marketValue: group.totals.marketValue, costBasis: group.totals.costBasis }))}
                        lang={lang}
                    />
                </div>
            </div>

            <EquityCurveCard points={equity} lang={lang} />

            <TradeLedger
                trades={trades}
                sales={ledger.sales}
                realized={realizedByCurrency}
                warnings={ledger.warnings}
                currency={currency}
                currencyBySymbol={currencyBySymbol}
                lang={lang}
            />
        </>
    );
}

import { Plus } from 'lucide-react';
import { getUserPositions, getUserTrades, getPortfolioBenchmark } from '@/lib/actions/portfolio.actions';
import { getWatchlistData } from '@/lib/actions/finnhub.actions';
import PortfolioTable, { type PortfolioRow } from '@/components/portfolio/PortfolioTable';
import PositionFormModal from '@/components/portfolio/PositionFormModal';
import TradeLedger from '@/components/portfolio/TradeLedger';
import BenchmarkCard from '@/components/portfolio/BenchmarkCard';
import { buildLedger, mergePositions, totalReturnPercent } from '@/lib/portfolio-ledger';
import { summarizePortfolio, computePositionMetrics } from '@/lib/portfolio';
import { isTadawulSymbol } from '@/lib/yahoo';
import { getLang } from '@/lib/i18n-server';
import { tx, arDigits } from '@/lib/i18n';

// Positions are read from Mongo first; the quotes for them stream from the shared quote path,
// the same one the watchlist uses (Finnhub for US/crypto, Yahoo for Tadawul).
//
// Two sources feed the table: the trade ledger (replayed FIFO) and hand-entered positions. A symbol
// the ledger knows is taken from the ledger only, so importing history never doubles a holding.
export default async function PortfolioPage() {
    const [positions, trades] = await Promise.all([getUserPositions(), getUserTrades()]);
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

    // The benchmark follows the money: riyals are measured against TASI, dollars against the S&P.
    const sar = rows.some((row) => row.currency === 'SAR') || symbols.some((symbol) => isTadawulSymbol(symbol));
    const currency = sar ? 'SAR' : 'USD';
    const sameCurrency = rows.filter((row) => (row.currency || 'USD') === currency);
    const totals = summarizePortfolio(
        sameCurrency.map((row) => computePositionMetrics({ quantity: row.quantity, averageCost: row.averageCost, price: row.price, change: row.change }))
    );
    const realizedCostBasis = ledger.sales.reduce((sum, sale) => sum + sale.cost, 0);
    const portfolioReturnPct = totalReturnPercent({
        unrealizedPnl: totals.unrealizedPnl,
        realizedPnl: ledger.totalRealized,
        openCostBasis: totals.costBasis,
        realizedCostBasis,
    });

    const since =
        trades.length > 0
            ? trades[0].tradedAt
            : positions.length > 0
              ? positions[positions.length - 1].createdAt
              : new Date().toISOString();
    const benchmark = rows.length > 0 ? await getPortfolioBenchmark(since, currency) : null;

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
                <BenchmarkCard benchmark={benchmark} portfolioReturnPct={portfolioReturnPct} lang={lang} />
            </div>

            <TradeLedger
                trades={trades}
                sales={ledger.sales}
                totalRealized={ledger.totalRealized}
                warnings={ledger.warnings}
                currency={currency}
                lang={lang}
            />
        </>
    );
}

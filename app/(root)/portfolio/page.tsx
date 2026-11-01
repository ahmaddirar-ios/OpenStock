import { Plus } from 'lucide-react';
import { getUserPositions } from '@/lib/actions/portfolio.actions';
import { getWatchlistData } from '@/lib/actions/finnhub.actions';
import PortfolioTable, { type PortfolioRow } from '@/components/portfolio/PortfolioTable';
import PositionFormModal from '@/components/portfolio/PositionFormModal';
import { getLang } from '@/lib/i18n-server';
import { tx, arDigits } from '@/lib/i18n';

// Positions are read from Mongo first; the quotes for them stream from the shared quote path,
// the same one the watchlist uses (Finnhub for US/crypto, Yahoo for Tadawul).
export default async function PortfolioPage() {
    const positions = await getUserPositions();
    const symbols: string[] = positions.map((p) => p.symbol);
    const quotes = symbols.length ? await getWatchlistData(symbols) : [];
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));

    const rows: PortfolioRow[] = positions.map((p) => {
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
        };
    });

    const lang = await getLang();

    return (
        <>
            <header className="page-head">
                <div>
                    <h1 className="page-title">{tx(lang, 'pf.title')}</h1>
                    <p className="page-sub num">{tx(lang, 'pf.sub').replace('{n}', arDigits(rows.length, lang))}</p>
                </div>
                <PositionFormModal lang={lang}>
                    <button type="button" className="btn btn-primary"><Plus /> {tx(lang, 'pf.add')}</button>
                </PositionFormModal>
            </header>

            <PortfolioTable initialRows={rows} lang={lang} />
        </>
    );
}

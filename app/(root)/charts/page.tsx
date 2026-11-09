import ChartGrid from '@/components/charts/ChartGrid';
import { getUserWatchlist } from '@/lib/actions/watchlist.actions';
import { normalizeGridSymbols, parseGridState } from '@/lib/chart/grid';
import { getLang } from '@/lib/i18n-server';
import { tx } from '@/lib/i18n';

// A first visit has to show a screen, not an empty grid: the watchlist comes first, then a mixed
// Tadawul/US pair so both markets are legible from the start.
const STARTER_SYMBOLS = ['2222.SR', '1120.SR', 'AAPL', 'MSFT'];

// The workspace is parsed on the server, so the first paint is the trader's own screen rather than a
// default that re-arranges itself once the browser reads storage.
export default async function ChartsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const [lang, watchlist] = await Promise.all([getLang(), getUserWatchlist()]);
    const symbols = (watchlist as { symbol: string }[]).map((row) => row.symbol);
    const fallback = normalizeGridSymbols(symbols, STARTER_SYMBOLS);
    const initial = parseGridState(params, { symbols: fallback });
    const fromUrl = ['l', 's', 'i'].some((key) => params[key] !== undefined);

    return (
        <>
            <header className="page-head">
                <div>
                    <h1 className="page-title">{tx(lang, 'chart.grid.title')}</h1>
                    <p className="page-sub">{tx(lang, 'chart.grid.sub')}</p>
                </div>
            </header>

            <ChartGrid
                lang={lang}
                initial={initial}
                fromUrl={fromUrl}
                watchlist={symbols}
            />
        </>
    );
}

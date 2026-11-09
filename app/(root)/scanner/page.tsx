import PatternScanner, { type ScanNames, type ScanUniverse } from '@/components/scanner/PatternScanner';
import { getUserWatchlist } from '@/lib/actions/watchlist.actions';
import { getLang } from '@/lib/i18n-server';
import { tx } from '@/lib/i18n';
import { SCREENER_UNIVERSE } from '@/lib/screener-universe';

// The scanner's lists are the same directories the screener reads, so a symbol means the same thing
// on both pages. The watchlist is the one list that belongs to the user; the rest is static metadata,
// which is why the page needs no price snapshot and renders instantly.
export default async function ScannerPage() {
    const [lang, watchlist] = await Promise.all([getLang(), getUserWatchlist()]);

    const names: ScanNames = {};
    const universe: ScanUniverse = { watchlist: [], saudi: [], us: [], all: [] };
    for (const entry of SCREENER_UNIVERSE) {
        names[entry.symbol] = lang === 'ar' ? (entry.nameAr ?? entry.name) : entry.name;
        universe[entry.market === 'sa' ? 'saudi' : 'us'].push(entry.symbol);
    }
    // "All" is the two directories in one list, deduped so a symbol listed twice is scanned once.
    universe.all = [...new Set([...universe.saudi, ...universe.us])];
    for (const doc of watchlist) {
        const symbol = typeof doc?.symbol === 'string' ? doc.symbol : '';
        if (!symbol) continue;
        universe.watchlist.push(symbol);
        if (!names[symbol]) names[symbol] = typeof doc.company === 'string' ? doc.company : symbol;
    }

    return (
        <>
            <header className="page-head">
                <div>
                    <h1 className="page-title">{tx(lang, 'scan.title')}</h1>
                    <p className="page-sub">{tx(lang, 'scan.sub')}</p>
                </div>
            </header>

            <PatternScanner lang={lang} universe={universe} names={names} />
        </>
    );
}
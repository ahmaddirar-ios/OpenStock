import { loadWorldBoard } from '@/lib/market/world-board';
import WorldBoard from '@/components/markets/WorldBoard';
import { getLang } from '@/lib/i18n-server';
import { tx } from '@/lib/i18n';
import { requireFeaturePage } from '@/lib/entitlements-server';

export const metadata = {
    title: 'World markets',
    description: 'Gulf and world indices, commodities, currencies and crypto — delayed quotes, read at a glance.',
};

// Read on the server for a fast first paint (and for crawlers), then the board polls itself at the
// pace the feed is willing to refresh.
export default async function WorldMarketsPage() {
    await requireFeaturePage('page.world');

    const [board, lang] = await Promise.all([loadWorldBoard(), getLang()]);

    return (
        <>
            <header className="page-head">
                <div>
                    <h1 className="page-title">{tx(lang, 'world.title')}</h1>
                    <p className="page-sub">{tx(lang, 'world.sub')}</p>
                </div>
            </header>
            <WorldBoard initial={board} lang={lang} />
        </>
    );
}

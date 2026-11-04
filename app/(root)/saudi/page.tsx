import { loadSaudiBoard } from '@/lib/saudi-board';
import SaudiBoard from '@/components/saudi/SaudiBoard';
import { getLang } from '@/lib/i18n-server';
import { tx } from '@/lib/i18n';

export const metadata = {
    title: 'Saudi market',
    description: 'Every Tadawul listing: top gainers, top losers, the busiest names and how each sector moved.',
};

// The board is read on the server (fast first paint, works for crawlers) and then polls itself while
// Riyadh is trading, so a tab left open follows the market without a reload.
export default async function SaudiMarketPage() {
    const [board, lang] = await Promise.all([loadSaudiBoard(), getLang()]);

    return (
        <>
            <header className="page-head">
                <div>
                    <h1 className="page-title">{tx(lang, 'saudi.title')}</h1>
                    <p className="page-sub">{tx(lang, 'saudi.sub')}</p>
                </div>
            </header>
            <SaudiBoard initial={board} lang={lang} />
        </>
    );
}

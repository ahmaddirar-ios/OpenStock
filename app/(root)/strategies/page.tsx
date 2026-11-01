import StrategyIndex from '@/components/strategies/StrategyIndex';
import { getLang } from '@/lib/i18n-server';
import { tx } from '@/lib/i18n';

// The library is content plus pure logic, so the index needs no data of its own: the filters and the
// cards run in the browser, and every strategy's numbers are computed only when a lab is asked to run.
export default async function StrategiesPage() {
    const lang = await getLang();

    return (
        <>
            <header className="page-head">
                <div>
                    <h1 className="page-title">{tx(lang, 'strat.title')}</h1>
                    <p className="page-sub">{tx(lang, 'strat.sub')}</p>
                </div>
            </header>

            <StrategyIndex lang={lang} />
        </>
    );
}

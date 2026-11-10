import { getScreenerRows } from '@/lib/actions/screener.actions';
import { SCREENER_TOTAL } from '@/lib/screener-universe';
import { parseCriteria } from '@/lib/screener';
import ScreenerTable from '@/components/screener/ScreenerTable';
import BuildScreener from '@/components/screener/BuildScreener';
import { getLang } from '@/lib/i18n-server';
import { tx } from '@/lib/i18n';
import { requireFeaturePage } from '@/lib/entitlements-server';

// The snapshot is read from Mongo (instant); filtering and sorting happen in the browser over the
// whole set. The first visit builds the snapshot row by row, behind a progress panel.
export default async function ScreenerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    await requireFeaturePage('page.screener');

    const params = await searchParams;
    const criteria = parseCriteria(params);
    const [rows, lang] = await Promise.all([getScreenerRows(), getLang()]);
    const sectors = [...new Set(rows.map((r) => r.sector).filter(Boolean))].sort();

    return (
        <>
            <header className="page-head">
                <div>
                    <h1 className="page-title">{tx(lang, 'scr.title')}</h1>
                    <p className="page-sub">{tx(lang, 'scr.sub')}</p>
                </div>
            </header>

            {rows.length === 0
                ? <BuildScreener lang={lang} />
                : <ScreenerTable rows={rows} criteria={criteria} sectors={sectors} total={SCREENER_TOTAL} lang={lang} />}
        </>
    );
}

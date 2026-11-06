import CustomStrategyStudio from '@/components/strategies/CustomStrategyStudio';
import { getLang } from '@/lib/i18n-server';
import { tx, type Lang } from '@/lib/i18n';

type Props = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const pick = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

// The custom studio is a client page: the rules, the grid search and the walk-forward all run in the
// browser over candles the server hands it, so nothing here needs a query of its own.
export default async function CustomStrategyPage({ searchParams }: Props) {
    const [lang, query] = await Promise.all([getLang(), searchParams]);
    const l = lang as Lang;

    return (
        <>
            <header className="page-head">
                <div>
                    <h1 className="page-title">{tx(l, 'cs.pageTitle')}</h1>
                    <p className="page-sub">{tx(l, 'cs.pageSub')}</p>
                </div>
            </header>

            <CustomStrategyStudio lang={l} initialSymbol={pick(query.symbol)} />
        </>
    );
}

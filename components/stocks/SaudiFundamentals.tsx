import Panel from '@/components/Panel';
import { tx, arDigits, type Lang } from '@/lib/i18n';
import { daysUntil, type SaudiFundamentals } from '@/lib/saudi-fundamentals';

const money = (value: number, lang: Lang) =>
    arDigits(value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), lang);

/** A date in the reader's own calendar wording: Arabic months for Arabic, ISO-ish for English. */
const dateLabel = (ms: number | null, lang: Lang) =>
    ms === null
        ? '—'
        : arDigits(
            new Date(ms).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            lang,
        );

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-3 border-t border-line py-2 first:border-t-0">
        <span className="text-[12.5px] text-faint">{label}</span>
        <span className="num text-[13px] font-semibold">{value}</span>
    </div>
);

/**
 * Dividends and results dates for a Tadawul listing. Rendered on the server: the numbers come from
 * the batch feed and change on the company's calendar, so there is nothing to poll.
 */
export default function SaudiFundamentalsPanel({ fundamentals, lang }: { fundamentals: SaudiFundamentals | null; lang: Lang }) {
    if (!fundamentals) {
        return (
            <Panel title={tx(lang, 'stock.divTitle')}>
                <p className="text-[13px] text-faint">{tx(lang, 'stock.divEmpty')}</p>
            </Panel>
        );
    }

    const { dividendYield, exDividendDate, dividendPayDate, payoutRatio, lastEarningsDate, nextEarningsDate } = fundamentals;
    const paysDividend = dividendYield !== null && dividendYield > 0;
    const days = daysUntil(nextEarningsDate);
    // "in 5 days" reads better than a bare date when the event is close; past it, the date is enough.
    const countdown = days === null ? null : days === 0 ? tx(lang, 'stock.today') : days > 0 ? tx(lang, 'stock.inDays').replace('{n}', arDigits(days, lang)) : null;

    return (
        <Panel
            title={tx(lang, 'stock.divTitle')}
            sub={paysDividend ? `${arDigits(dividendYield!.toFixed(2), lang)}% ${tx(lang, 'stock.divYield')}` : tx(lang, 'stock.divNone')}
        >
            <div className="flex flex-col">
                {paysDividend && (
                    <>
                        <Row label={tx(lang, 'stock.divExDate')} value={dateLabel(exDividendDate, lang)} />
                        <Row label={tx(lang, 'stock.divPayDate')} value={dateLabel(dividendPayDate, lang)} />
                        {payoutRatio !== null && (
                            <Row label={tx(lang, 'stock.divPayout')} value={`${money(payoutRatio, lang)}%`} />
                        )}
                    </>
                )}
                <Row label={tx(lang, 'stock.earningsNext')} value={
                    nextEarningsDate === null
                        ? '—'
                        : <>{dateLabel(nextEarningsDate, lang)}{countdown ? <span className="ms-2 text-[11px] font-normal text-faint">{countdown}</span> : null}</>
                } />
                <Row label={tx(lang, 'stock.earningsLast')} value={dateLabel(lastEarningsDate, lang)} />
            </div>
            <p className="mt-3 text-[11px] text-faint">{tx(lang, 'stock.divSource')}</p>
        </Panel>
    );
}

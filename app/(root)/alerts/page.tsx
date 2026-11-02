import { BellRing } from 'lucide-react';
import { getUserAlerts } from '@/lib/actions/alert.actions';
import AlertsCentre, { type AlertRow } from '@/components/alerts/AlertsCentre';
import { getLang } from '@/lib/i18n-server';
import { arDigits, tx } from '@/lib/i18n';

// Alerts are read from Mongo and checked on arrival: the demo has no background cron, so opening
// this page is what prices the rules. Cloud adds the five-minute cron and the e-mail on top.
export default async function AlertsPage() {
    const [alerts, lang] = await Promise.all([getUserAlerts(), getLang()]);
    const rows = alerts as AlertRow[];

    return (
        <>
            <header className="page-head">
                <div>
                    <h1 className="page-title">{tx(lang, 'alerts.title')}</h1>
                    <p className="page-sub num">
                        {rows.length === 0
                            ? tx(lang, 'alerts.sub')
                            : tx(lang, rows.length === 1 ? 'alerts.subOne' : 'alerts.subCount').replace('{n}', arDigits(rows.length, lang))}
                    </p>
                </div>
                <span className="empty-icon hidden sm:grid"><BellRing className="size-5" /></span>
            </header>

            <AlertsCentre alerts={rows} lang={lang} />
        </>
    );
}

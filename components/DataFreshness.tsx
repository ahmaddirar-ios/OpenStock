'use client';

import { useEffect, useState } from "react";
import { isQuoteLive, isRealtime } from "@/lib/market/data";
import { arNumberDigits, tx, type Lang } from "@/lib/i18n";

// Honest label for how old a number is: "Live" in realtime mode, otherwise the time of the last trade.
// The time is formatted after mount, in the viewer's own time zone, so server and browser never disagree.
// `delayed` is for feeds that are always behind the exchange (Tadawul through Yahoo, ~15 minutes):
// it never claims "live", it says how stale the tape is.
const DataFreshness = ({ tradeTime, delayed = false, lang = 'en' }: { tradeTime?: number; delayed?: boolean; lang?: Lang }) => {
    const [asOf, setAsOf] = useState<string | null>(null);

    useEffect(() => {
        setAsOf(tradeTime
            ? arNumberDigits(new Date(tradeTime * 1000).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), lang)
            : null);
    }, [tradeTime, lang]);

    if (!delayed && (isRealtime || isQuoteLive())) {
        return <span className="inline-flex items-center gap-1.5 text-[12px] text-faint"><span className="live-dot" /> {tx(lang, isRealtime ? 'fresh.live' : 'fresh.liveMin')}</span>;
    }
    return (
        <span className="text-[12px] text-faint">
            {asOf ? tx(lang, 'fresh.asOf').replace('{t}', asOf) : tx(lang, 'fresh.delayed')} · {tx(lang, delayed ? 'fresh.delay15' : 'fresh.hourly')}
        </span>
    );
};

export default DataFreshness;

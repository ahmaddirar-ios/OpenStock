'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CircleDot, Clock3, Info, Wifi } from 'lucide-react';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { WorldBoardPayload } from '@/lib/market/world-board';
import type { SiteNotice } from '@/lib/notice';

/**
 * The line a terminal opens with. When staff have published a notice it carries their words, in the
 * reader's language (falling back to the other one rather than showing an empty bar); otherwise it
 * says what the feed is, and where the live one would be.
 */
export function NoticeBar({ lang, notice }: { lang: Lang; notice?: SiteNotice | null }) {
    if (notice) {
        const message = lang === 'ar' ? notice.messageAr || notice.messageEn : notice.messageEn || notice.messageAr;
        const linkLabel = lang === 'ar' ? notice.linkLabelAr || notice.linkLabelEn : notice.linkLabelEn || notice.linkLabelAr;
        return (
            <div className={cn('noticebar', `is-${notice.level}`)} role="status">
                <Info className="size-3.5 shrink-0" />
                <span className="truncate">{message}</span>
                {notice.href && linkLabel && (
                    <Link href={notice.href} className="noticebar-link">
                        {linkLabel}
                        <ArrowUpRight className="size-3" />
                    </Link>
                )}
            </div>
        );
    }

    return (
        <div className="noticebar" role="status">
            <Info className="size-3.5 shrink-0" />
            <span className="truncate">{tx(lang, 'notice.delayed')}</span>
            <Link href="/saudi" className="noticebar-link">
                {tx(lang, 'notice.live')}
                <ArrowUpRight className="size-3" />
            </Link>
        </div>
    );
}

type Quote = { short: string; price: number; changePercent: number };

const price = (value: number, lang: Lang) =>
    arDigits(value >= 1000 ? value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : value.toFixed(2), lang);

/**
 * The summary strip under the menu: the indices a trader checks before anything else, scrolling
 * like a terminal's tape. It reads the same board the world page reads, so it cannot disagree with
 * it, and it says nothing rather than inventing a number when the feed is down.
 */
export function MarketStrip({ lang }: { lang: Lang }) {
    const [quotes, setQuotes] = useState<Quote[] | null>(null);

    useEffect(() => {
        let alive = true;
        fetch('/api/world/market')
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: WorldBoardPayload | null) => {
                if (!alive || !payload) return;
                const flat = payload.sections.flatMap((section) => section.quotes ?? []);
                setQuotes(flat.slice(0, 16).map((quote) => ({ short: quote.short, price: quote.price, changePercent: quote.changePercent })));
            })
            .catch(() => { /* the strip is decoration; a failed read leaves it quiet */ });
        return () => { alive = false; };
    }, []);

    if (quotes === null) {
        return <div className="quote-strip is-quiet">{tx(lang, 'strip.loading')}</div>;
    }
    if (quotes.length === 0) {
        return <div className="quote-strip is-quiet">{tx(lang, 'strip.empty')}</div>;
    }

    // Two copies make the loop seamless; the second is hidden from assistive tech.
    const tape = [...quotes, ...quotes];

    return (
        <div className="quote-strip" aria-label={tx(lang, 'nav.world')}>
            <div className="quote-track">
                {tape.map((quote, index) => (
                    <span key={`${quote.short}-${index}`} className="quote-cell" aria-hidden={index >= quotes.length}>
                        <bdi className="quote-name">{quote.short}</bdi>
                        <bdi className="quote-price num">{price(quote.price, lang)}</bdi>
                        <bdi className={cn('quote-change num', quote.changePercent >= 0 ? 'is-up' : 'is-down')}>
                            {quote.changePercent >= 0 ? '+' : ''}
                            {arDigits(quote.changePercent.toFixed(2), lang)}%
                        </bdi>
                    </span>
                ))}
            </div>
        </div>
    );
}

/** The bottom line: the clock, the feed's honesty, and the workspace's name. */
export function StatusBar({ lang }: { lang: Lang }) {
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        setNow(new Date());
        const timer = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const time = now
        ? now.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '--:--:--';
    const date = now
        ? now.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';

    return (
        <div className="statusbar">
            <span className="statusbar-cell">
                <Clock3 className="size-3" />
                <bdi className="num">{time}</bdi>
            </span>
            <span className="statusbar-cell statusbar-date">{date}</span>
            <span className="statusbar-cell">
                <Wifi className="size-3 text-up" />
                {tx(lang, 'status.ready')}
            </span>
            <span className="statusbar-cell">
                <CircleDot className="size-3 text-warn" />
                {tx(lang, 'status.delayed')}
            </span>
            <span className="statusbar-cell statusbar-end">{tx(lang, 'status.workspace')}</span>
        </div>
    );
}

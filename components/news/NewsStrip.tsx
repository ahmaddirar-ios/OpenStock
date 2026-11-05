'use client';

import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Newspaper } from 'lucide-react';
import { arNumberDigits, tx, type Lang } from '@/lib/i18n';

/**
 * The overview's news, on one row above the status bar: ticker, headline, source and age, scrolling
 * sideways. The terminal shape — a strip is a ticker of stories, not a page of them. An empty feed
 * draws nothing, so the dashboard never keeps a title bar for news it does not have.
 */
export default function NewsStrip({ news, lang }: { news: MarketNewsArticle[]; lang: Lang }) {
    if (news.length === 0) return null;

    return (
        <section className="news-strip" aria-label={tx(lang, 'dash.news')}>
            <span className="news-strip-label">
                <Newspaper className="size-3.5" aria-hidden />
                {tx(lang, 'dash.news')}
            </span>
            <ul className="news-strip-list">
                {news.map((item) => (
                    <li key={`${item.id}-${item.url}`} className="news-strip-row">
                        <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="news-strip-item"
                        >
                            <span className="news-strip-ticker mono" dir="ltr">
                                {item.related || 'MKT'}
                            </span>
                            <span className="news-strip-headline">{item.headline}</span>
                            <span className="news-strip-meta">
                                {item.source}
                                {item.datetime
                                    ? ` · ${arNumberDigits(
                                        formatDistanceToNow(item.datetime * 1000, {
                                            addSuffix: true,
                                            locale: lang === 'ar' ? ar : undefined,
                                        }),
                                        lang,
                                    )}`
                                    : ''}
                            </span>
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}

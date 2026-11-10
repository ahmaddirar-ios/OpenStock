'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Newspaper, Pause, Play } from 'lucide-react';
import { arNumberDigits, tx, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** How fast the headlines travel, in pixels a second: slow enough to read one as it passes. */
const SPEED = 55;

/**
 * The overview's news, on one row above the status bar: a ticker of stories — ticker badge,
 * headline, source and age — travelling past the row instead of waiting to be dragged.
 *
 * A strip that already fits stays still and is scrolled by hand; a reader who asked for less motion
 * gets the same still list. Either way an empty feed draws nothing at all, so the dashboard never
 * keeps a title bar for news it does not have.
 */
export default function NewsStrip({ news, lang }: { news: MarketNewsArticle[]; lang: Lang }) {
    const boxRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    // Seconds for one loop, or null for "this strip stands still".
    const [seconds, setSeconds] = useState<number | null>(null);
    const [paused, setPaused] = useState(false);

    // Only the browser knows how wide the stories are and how wide the row is, so the decision to
    // roll is measured — and measured again on a resize, because a narrower window means a longer
    // strip. The width is read from the first copy only, so the duplicate never biases it.
    useEffect(() => {
        const list = listRef.current;
        const box = boxRef.current;
        if (!list || !box) return;

        const measure = () => {
            const reduced = typeof window.matchMedia === 'function'
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const width = list.scrollWidth;
            setSeconds(!reduced && width > box.clientWidth + 8 ? Number((width / SPEED).toFixed(1)) : null);
        };

        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        observer.observe(box);
        observer.observe(list);
        return () => observer.disconnect();
    }, [news]);

    if (news.length === 0) return null;

    const rolling = seconds !== null;

    const stories = (copy: number) =>
        news.map((item) => (
            <li key={`${copy}-${item.id}-${item.url}`} className="news-strip-row">
                <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    // The second copy exists so the loop has no seam; it is not read out or tabbed to.
                    tabIndex={copy > 0 ? -1 : undefined}
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
        ));

    return (
        <section className={cn('news-strip', paused && 'is-paused')} aria-label={tx(lang, 'dash.news')}>
            <span className="news-strip-label">
                <Newspaper className="size-3.5" aria-hidden />
                {tx(lang, 'dash.news')}
            </span>

            <div ref={boxRef} className={cn('news-strip-viewport', rolling && 'is-rolling')}>
                <div
                    className={cn('news-strip-track', rolling && 'is-rolling')}
                    // One loop is one copy wide; the track holds two, so it travels half its own width.
                    style={rolling ? { animationDuration: `${seconds}s` } : undefined}
                >
                    <ul ref={listRef} className="news-strip-list">
                        {stories(0)}
                    </ul>
                    {rolling && (
                        <ul className="news-strip-list" aria-hidden="true">
                            {stories(1)}
                        </ul>
                    )}
                </div>
            </div>

            {rolling && (
                <button
                    type="button"
                    onClick={() => setPaused((value) => !value)}
                    aria-pressed={paused}
                    aria-label={tx(lang, paused ? 'news.play' : 'news.pause')}
                    title={tx(lang, paused ? 'news.play' : 'news.pause')}
                    className="news-strip-toggle"
                >
                    {paused ? <Play className="size-3" aria-hidden /> : <Pause className="size-3" aria-hidden />}
                </button>
            )}
        </section>
    );
}

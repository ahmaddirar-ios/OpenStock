'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// Loaded on demand and never on the server: the hero's HTML (and its LCP) must not wait for three.
const MarketSphere = dynamic(() => import('./MarketSphere'), { ssr: false });

/**
 * Mounts the sphere only when the hero scrolls near the viewport, the pointer is a fine one
 * (desktop) and the reader has not asked for reduced motion. Otherwise it renders the supplied
 * fallback — the market clock — so a phone, a reduced-motion reader and a no-JS reader all get the
 * same calm hero.
 */
export default function HeroCanvas({ className, fallback }: { className?: string; fallback?: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [show, setShow] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (window.matchMedia('(max-width: 639px)').matches) return;

        const io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    setShow(true);
                    io.disconnect();
                }
            },
            { rootMargin: '300px' },
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    return (
        <div ref={ref} className={`grid place-items-center ${className ?? ''}`} aria-hidden>
            {show ? <MarketSphere /> : fallback}
        </div>
    );
}

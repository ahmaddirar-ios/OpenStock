'use client';

import { MotionConfig, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { SPRING } from '@/lib/motion';

/**
 * Wraps a subtree so every `motion` component honours the reader's reduced-motion setting.
 * Entrance reveals do not use `motion` — they are CSS + IntersectionObserver (see `Reveal`) so the
 * server HTML is never hidden and a reader without JavaScript still sees every word.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
    return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/**
 * Reveal-on-scroll with no flash of invisible content: the element is visible in the server HTML and
 * in the first paint, and only elements that are *below the fold* are armed (hidden) — after mount,
 * by JS — then transitioned in when they enter view. Above-the-fold content (the LCP candidate) is
 * never hidden, and reduced-motion readers get no arming at all.
 */
function useReveal(delay: number) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        // In view on mount: leave it visible. Hiding it here would flash and delay LCP.
        if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
        el.classList.add('reveal-armed');
        const io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    el.style.transitionDelay = `${delay}s`;
                    el.classList.add('reveal-in');
                    io.disconnect();
                }
            },
            { rootMargin: '0px 0px -8% 0px' },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [delay]);
    return ref;
}

/** A block that fades up when it scrolls into view. Visible by default (no-JS, LCP safe). */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
    const ref = useReveal(delay);
    return (
        <div ref={ref} className={className ? `reveal ${className}` : 'reveal'}>
            {children}
        </div>
    );
}

/** A plain container; the stagger is expressed by passing an increasing `delay` to each `StaggerItem`. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={className}>{children}</div>;
}

export function StaggerItem({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
    return (
        <Reveal className={className} delay={delay}>
            {children}
        </Reveal>
    );
}

/**
 * Small pointer-reactive tilt. The rotation stays low (a few degrees) so it reads as depth, not as a
 * toy. Under reduced motion it renders flat.
 */
export function Tilt({ children, className, max = 5 }: { children: ReactNode; className?: string; max?: number }) {
    const reduced = useReducedMotion();
    const px = useMotionValue(0);
    const py = useMotionValue(0);
    const sx = useSpring(px, SPRING);
    const sy = useSpring(py, SPRING);
    const rotateY = useTransform(sx, [-0.5, 0.5], [-max, max]);
    const rotateX = useTransform(sy, [-0.5, 0.5], [max, -max]);

    const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (reduced) return;
        const rect = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - rect.left) / rect.width - 0.5);
        py.set((e.clientY - rect.top) / rect.height - 0.5);
    };
    const reset = () => {
        px.set(0);
        py.set(0);
    };

    return (
        <motion.div
            className={className}
            onPointerMove={onMove}
            onPointerLeave={reset}
            style={reduced ? undefined : { rotateX, rotateY, transformPerspective: 900 }}
        >
            {children}
        </motion.div>
    );
}

/** A button or CTA that leans a few pixels toward the pointer, then springs back. */
export function Magnetic({ children, className, strength = 0.22 }: { children: ReactNode; className?: string; strength?: number }) {
    const reduced = useReducedMotion();
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const sx = useSpring(x, SPRING);
    const sy = useSpring(y, SPRING);
    const ref = useRef<HTMLDivElement>(null);

    const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (reduced) return;
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
        y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
    };
    const reset = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <motion.div ref={ref} className={className} onPointerMove={onMove} onPointerLeave={reset} style={reduced ? undefined : { x: sx, y: sy }}>
            {children}
        </motion.div>
    );
}

export { motion };

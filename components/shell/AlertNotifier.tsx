'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { checkAlerts } from '@/lib/actions/alert.actions';
import {
    DEFAULT_NOTIFY_PREFS,
    firingBatch,
    firingDetail,
    firingMessage,
    freshFirings,
    readNotifyPrefs,
    writeNotifyPrefs,
    type AlertNotifyPrefs,
} from '@/lib/alert-notify';
import type { Lang } from '@/lib/i18n';

// The alert clock of the whole app, not of one page: while a tab is open and visible every live rule
// is checked once a minute, and a firing raises a toast with its rule and price (plus a short chime
// when the trader kept sound on). The claim machine in `checkAlerts` still fires each rule exactly
// once, and `freshFirings` stops a flapping quote from saying the same thing twice. Silent on
// failure: an alert loop must never interrupt a trader.

/** One check a minute — the cadence the chart's own quotes already use. */
export const ALERT_CHECK_MS = 60_000;

/** The settings the alerts page writes and this loop reads. */
export const PREFS_EVENT = 'rovex:alert-prefs';

/**
 * A two-tone chime written here and held in code, so an alert costs no request. It is short (0.3 s)
 * and quiet: a notification, not a ringtone.
 */
const CHIME_SRC =
    'data:audio/wav;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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';

const readPrefs = (): AlertNotifyPrefs => {
    try {
        return readNotifyPrefs((key) => window.localStorage.getItem(key));
    } catch {
        return DEFAULT_NOTIFY_PREFS;
    }
};

/** Tells every other tab (the alerts page's switch, this loop) that the choice changed. */
export const broadcastPrefs = (next: AlertNotifyPrefs) => {
    try {
        writeNotifyPrefs(next, (key, value) => window.localStorage.setItem(key, value));
    } catch {
        /* private mode: the loop keeps its defaults */
    }
    window.dispatchEvent(new CustomEvent<AlertNotifyPrefs>(PREFS_EVENT, { detail: next }));
};

export default function AlertNotifier({ lang }: { lang: Lang }) {
    const pathname = usePathname();
    const router = useRouter();
    const prefs = useRef<AlertNotifyPrefs>(DEFAULT_NOTIFY_PREFS);
    const recent = useRef<Record<string, number>>({});
    const busy = useRef(false);
    const audio = useRef<HTMLAudioElement | null>(null);
    // The alerts page runs its own, more talkative check; a second one there would say it twice.
    const own = pathname === '/alerts';

    useEffect(() => {
        prefs.current = readPrefs();
        const onPrefs = () => {
            prefs.current = readPrefs();
        };
        window.addEventListener(PREFS_EVENT, onPrefs);
        window.addEventListener('storage', onPrefs);
        return () => {
            window.removeEventListener(PREFS_EVENT, onPrefs);
            window.removeEventListener('storage', onPrefs);
        };
    }, []);

    useEffect(() => {
        if (own) return;
        const chime = () => {
            if (!prefs.current.sound) return;
            try {
                audio.current ??= new Audio(CHIME_SRC);
                // A browser that refuses autoplay simply has no sound; the toast is still there.
                void audio.current.play().catch(() => {});
            } catch {
                /* no audio context */
            }
        };
        const run = async () => {
            if (document.visibilityState !== 'visible' || busy.current) return;
            busy.current = true;
            try {
                const result = await checkAlerts();
                if (result.fired.length > 0) {
                    const now = Date.now() / 1000;
                    const { fresh } = freshFirings(result.fired, recent.current, now);
                    for (const hit of fresh) recent.current[`${hit.id}:${hit.condition}`] = now;
                    if (fresh.length > 0 && prefs.current.toast) {
                        if (fresh.length === 1) {
                            toast.success(firingMessage(fresh[0], lang), { description: firingDetail(fresh[0], lang) });
                        } else {
                            toast.success(firingBatch(fresh.length, lang), {
                                description: fresh.slice(0, 3).map((hit) => firingMessage(hit, lang)).join(' · '),
                            });
                        }
                    }
                    if (fresh.length > 0) chime();
                    // The badges and the alert list are server-rendered: ask for them again.
                    router.refresh();
                }
            } catch {
                /* a failed check is a quiet minute, not an error on screen */
            } finally {
                busy.current = false;
            }
        };
        void run();
        const timer = window.setInterval(run, ALERT_CHECK_MS);
        const onVisible = () => {
            if (document.visibilityState === 'visible') void run();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [own, lang, router]);

    return null;
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellRing, Volume2, VolumeX } from 'lucide-react';
import {
    DEFAULT_NOTIFY_PREFS,
    readNotifyPrefs,
    writeNotifyPrefs,
    type AlertNotifyPrefs,
} from '@/lib/alert-notify';
import { cn } from '@/lib/utils';
import { tx, type Lang } from '@/lib/i18n';

/**
 * The two in-app switches of the alert channel: the toast itself, and its chime. They are read and
 * written in this browser only — the shell's alert loop reads the same keys — and the page tells
 * the loop through an event so a change takes effect without a reload. Push stays on its own card,
 * because permission is a browser decision, not a preference.
 */
export default function InAppNotifyToggle({ lang }: { lang: Lang }) {
    const t = (key: Parameters<typeof tx>[1]) => tx(lang, key);
    const [prefs, setPrefs] = useState<AlertNotifyPrefs>(DEFAULT_NOTIFY_PREFS);

    useEffect(() => {
        try {
            setPrefs(readNotifyPrefs((key) => window.localStorage.getItem(key)));
        } catch {
            /* private mode: the defaults stand */
        }
    }, []);

    const update = useCallback((next: AlertNotifyPrefs) => {
        setPrefs(next);
        try {
            writeNotifyPrefs(next, (key, value) => window.localStorage.setItem(key, value));
        } catch {
            /* private mode: the loop keeps its own default */
        }
        // The shell's loop listens for both; the storage event covers other tabs.
        window.dispatchEvent(new CustomEvent<AlertNotifyPrefs>('rovex:alert-prefs', { detail: next }));
    }, []);

    return (
        <div className="card flex flex-wrap items-center gap-3 p-3">
            <span className={cn('empty-icon', prefs.toast && 'text-brand-ink')}>
                <BellRing className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-foreground">{t('alerts.notify.title')}</p>
                <p className="text-[12px] text-faint">{t('alerts.notify.desc')}</p>
            </div>
            <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[12px] text-foreground">
                    {t('alerts.notify.toast')}
                    <input
                        type="checkbox"
                        role="checkbox"
                        checked={prefs.toast}
                        onChange={(event) => update({ ...prefs, toast: event.target.checked })}
                        aria-label={t('alerts.notify.toast')}
                        className="chart-switch"
                    />
                </label>
                <button
                    type="button"
                    onClick={() => update({ ...prefs, sound: !prefs.sound })}
                    aria-pressed={prefs.sound}
                    aria-label={t('alerts.notify.sound')}
                    title={t('alerts.notify.sound')}
                    className={cn('pill h-7 px-2 text-[12px]', prefs.sound && 'is-up', !prefs.toast && 'opacity-50')}
                    disabled={!prefs.toast}
                >
                    {prefs.sound ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                </button>
            </div>
        </div>
    );
}

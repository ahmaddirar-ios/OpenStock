'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { getPushState, sendTestPush, subscribeToPush, unsubscribeFromPush } from '@/lib/actions/push.actions';
import { cn } from '@/lib/utils';
import { arDigits, tx, type Lang } from '@/lib/i18n';

// The browser's own subscription object needs the VAPID public key as bytes, not base64url.
const toBytes = (base64url: string): Uint8Array => {
    const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded);
    return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
};

type State = 'checking' | 'unsupported' | 'unavailable' | 'off' | 'on' | 'denied';

export default function PushToggle({ lang, onChange }: { lang: Lang; onChange?: (on: boolean) => void }) {
    const t = (key: Parameters<typeof tx>[1]) => tx(lang, key);
    const [state, setState] = useState<State>('checking');
    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [devices, setDevices] = useState(0);
    const [busy, setBusy] = useState(false);

    const registrationFor = useCallback(async () => {
        const registration = await navigator.serviceWorker.register('/sw.js');
        return navigator.serviceWorker.ready.then(() => registration);
    }, []);

    const refresh = useCallback(async () => {
        const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
        if (!supported) {
            setState('unsupported');
            onChange?.(false);
            return;
        }
        if (Notification.permission === 'denied') {
            setState('denied');
            onChange?.(false);
            return;
        }
        const info = await getPushState();
        setPublicKey(info.publicKey);
        setDevices(info.devices);
        if (!info.configured) {
            setState('unavailable');
            onChange?.(false);
            return;
        }
        const registration = await registrationFor();
        const existing = await registration.pushManager.getSubscription();
        setState(existing ? 'on' : 'off');
        onChange?.(existing !== null);
    }, [onChange, registrationFor]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const enable = async () => {
        setBusy(true);
        try {
            if (!publicKey) throw new Error('unavailable');
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                setState(permission === 'denied' ? 'denied' : 'off');
                return;
            }
            const registration = await registrationFor();
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                // A typed Uint8Array is an ArrayBufferView; the DOM lib wants one backed by ArrayBuffer.
                applicationServerKey: toBytes(publicKey) as unknown as BufferSource,
            });
            await subscribeToPush(subscription.toJSON(), lang);
            toast.success(t('alerts.push.enabled'));
            await refresh();
        } catch (error) {
            console.error(error);
            toast.error(t('alerts.push.failed'));
        } finally {
            setBusy(false);
        }
    };

    const disable = async () => {
        setBusy(true);
        try {
            const registration = await registrationFor();
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                await unsubscribeFromPush(subscription.endpoint);
                await subscription.unsubscribe();
            }
            toast.success(t('alerts.push.disabled'));
            await refresh();
        } catch (error) {
            console.error(error);
            toast.error(t('alerts.push.failed'));
        } finally {
            setBusy(false);
        }
    };

    const test = async () => {
        setBusy(true);
        try {
            const result = await sendTestPush();
            if (result.unavailable) toast.error(t('alerts.push.unavailable'));
            else if (result.sent > 0) toast.success(t('alerts.push.testSent'));
            else toast.error(t('alerts.push.failed'));
        } catch {
            toast.error(t('alerts.push.failed'));
        } finally {
            setBusy(false);
        }
    };

    const body: Record<State, string> = {
        checking: t('alerts.push.checking'),
        unsupported: t('alerts.push.unsupported'),
        unavailable: t('alerts.push.unavailable'),
        off: t('alerts.push.desc'),
        on: t('alerts.push.on').replace('{n}', arDigits(devices, lang)),
        denied: t('alerts.push.denied'),
    };

    const actionable = state === 'off' || state === 'on';

    return (
        <div className="card flex flex-wrap items-center gap-3 p-3">
            <span className={cn('empty-icon', state === 'on' && 'text-brand-ink')}>
                {state === 'on' ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-foreground">{t('alerts.push.title')}</p>
                <p className="text-[12px] text-faint">{body[state]}</p>
            </div>
            <div className="flex items-center gap-1.5">
                {state === 'on' && (
                    <button type="button" onClick={() => void test()} disabled={busy} className="pill h-8 gap-1.5 px-3 text-[12px]">
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} {t('alerts.push.test')}
                    </button>
                )}
                {actionable && (
                    <button
                        type="button"
                        onClick={() => void (state === 'on' ? disable() : enable())}
                        disabled={busy}
                        aria-pressed={state === 'on'}
                        className={cn('pill h-8 px-3 text-[12px]', state === 'on' && 'is-up')}
                    >
                        {busy && <Loader2 className="size-3.5 animate-spin" />} {state === 'on' ? t('alerts.push.disable') : t('alerts.push.enable')}
                    </button>
                )}
            </div>
        </div>
    );
}

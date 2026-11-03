'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, Check, Loader2, Pause, Pencil, Play, Plus, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { checkAlerts, createAlert, deleteAlert, markAlertsSeen, rearmAlert, updateAlert } from '@/lib/actions/alert.actions';
import { alertSource, hasSecondNumber, PARAM_BOUNDS, needsCandles, type AlertCondition } from '@/lib/alerts';
import { cn } from '@/lib/utils';
import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import { ALERT_CONDITIONS, alertConditionLabel, alertParamsLabel, alertTargetLabel, alertTargetPlaceholder, alertTargetUnit, measureLabel } from '@/lib/alert-labels';
import PushToggle from '@/components/alerts/PushToggle';
import { alertPushPayload } from '@/lib/push';
import type { FiredAlert } from '@/lib/actions/alert.actions';

export type AlertRow = {
    _id: string;
    symbol: string;
    targetPrice: number;
    condition: AlertCondition;
    params?: { period?: number; window?: number };
    active?: boolean;
    triggered?: boolean;
    lastPrice?: number | null;
    triggeredAt?: string | null;
    triggeredPrice?: number | null;
    seen?: boolean;
    expiresAt?: string;
    createdAt?: string;
};

type Filter = 'all' | 'active' | 'fired';

/** The params payload for a condition, read from the form's second input. */
const paramObject = (condition: AlertCondition, value: string) => {
    const number = Number(value);
    if (condition === 'RSI_BELOW' || condition === 'RSI_ABOVE') return { period: number };
    if (condition === 'VOLUME_SPIKE') return { window: number };
    if (condition === 'ATR_ABOVE') return { period: number };
    return {};
};

/** The second number a rule asks for, and the default its form opens on. */
const paramFor = (condition: AlertCondition, row?: AlertRow): string => {
    if (condition === 'RSI_BELOW' || condition === 'RSI_ABOVE') return String(row?.params?.period ?? PARAM_BOUNDS.rsiPeriod.default);
    if (condition === 'VOLUME_SPIKE') return String(row?.params?.window ?? PARAM_BOUNDS.volumeWindow.default);
    if (condition === 'ATR_ABOVE') return String(row?.params?.period ?? PARAM_BOUNDS.atrPeriod.default);
    return '';
};

/** The action throws a code as the message; anything unknown is the generic failure. */
const errorKey = (error: unknown): StringKey => {
    const code = error instanceof Error ? error.message : '';
    // Every string ends with '', so an empty code must not settle on the first key.
    if (code === '') return 'alerts.err.failed';
    const known: StringKey[] = [
        'alerts.err.unsupportedSymbol',
        'alerts.err.invalidTarget',
        'alerts.err.invalidCondition',
        'alerts.err.limit',
        'alerts.err.failed',
        'alerts.err.notFound',
    ];
    return known.find((key) => key.endsWith(code)) ?? 'alerts.err.failed';
};

const statusOf = (alert: AlertRow) => {
    if (alert.triggered) return { key: 'alerts.status.fired' as StringKey, className: 'pill is-brand' };
    if (alert.active === false) return { key: 'alerts.status.paused' as StringKey, className: 'pill' };
    if (alert.expiresAt && new Date(alert.expiresAt) < new Date()) return { key: 'alerts.status.expired' as StringKey, className: 'pill' };
    return { key: 'alerts.status.watching' as StringKey, className: 'pill is-up' };
};

const priceLabel = (value: number | null | undefined, lang: Lang, condition: AlertCondition) =>
    value == null || !Number.isFinite(value) ? '—' : measureLabel(lang, condition, value);

export default function AlertsCentre({ alerts, lang }: { alerts: AlertRow[]; lang: Lang }) {
    const t = useCallback((key: StringKey) => tx(lang, key), [lang]);
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>('all');
    const [checking, setChecking] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [editing, setEditing] = useState<string | null>(null);
    const [editTarget, setEditTarget] = useState('');
    const [editParam, setEditParam] = useState('');
    const [symbol, setSymbol] = useState('');
    const [condition, setCondition] = useState<AlertCondition>('ABOVE');
    const [target, setTarget] = useState('');
    const [param, setParam] = useState('');
    const [creating, setCreating] = useState(false);
    const [pushOn, setPushOn] = useState(false);
    const checkedOnce = useRef(false);

    // A notification is for the moments the page is not being read; the toast covers the rest.
    const notifyFired = useCallback(async (fired: FiredAlert[]) => {
        if (document.visibilityState !== 'hidden') return;
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        try {
            const registration = await navigator.serviceWorker.ready;
            for (const hit of fired.slice(0, 3)) {
                const payload = alertPushPayload({
                    symbol: hit.symbol,
                    label: `${alertConditionLabel(lang, hit.condition)} ${alertTargetLabel(lang, hit.condition, hit.targetPrice)}`,
                    value: measureLabel(lang, hit.condition, hit.value),
                });
                await registration.showNotification(payload.title, {
                    body: payload.body,
                    icon: '/assets/images/logo.png',
                    tag: `openstock-alert-${hit.symbol}`,
                    data: { url: payload.url },
                });
            }
        } catch (error) {
            console.error('Notification failed', error);
        }
    }, [lang]);

    const runCheck = useCallback(async () => {
        setChecking(true);
        try {
            const result = await checkAlerts();
            if (result.fired.length > 0) {
                toast.success(
                    result.fired.length === 1
                        ? t('alerts.firedAt')
                              .replace('{s}', result.fired[0].symbol)
                              .replace('{p}', measureLabel(lang, result.fired[0].condition, result.fired[0].value))
                        : t('alerts.firedMany').replace('{n}', arDigits(result.fired.length, lang)),
                );
                // Nothing to notify unless this device asked for notifications.
                if (pushOn) void notifyFired(result.fired);
            } else if (result.checked === 0 && result.skipped > 0) {
                // Every quote failed: say so instead of returning silently, and change nothing.
                toast.error(t('alerts.checkedAllSkipped').replace('{s}', arDigits(result.skipped, lang)));
            } else if (result.checked > 0 && result.skipped > 0) {
                toast.message(
                    t('alerts.checkedSomeSkipped')
                        .replace('{n}', arDigits(result.checked, lang))
                        .replace('{s}', arDigits(result.skipped, lang)),
                );
            } else if (result.checked > 0) {
                toast.message(t('alerts.checkedNone').replace('{n}', arDigits(result.checked, lang)));
            }
            router.refresh();
        } catch {
            toast.error(t('alerts.actionFail'));
        } finally {
            setChecking(false);
        }
    }, [lang, notifyFired, pushOn, router, t]);

    // With notifications on, an open page keeps checking, so a firing reaches the device even
    // with the tab in the background. The claim machine still fires each rule exactly once.
    useEffect(() => {
        if (!pushOn) return;
        const id = window.setInterval(() => void runCheck(), 5 * 60 * 1000);
        return () => window.clearInterval(id);
    }, [pushOn, runCheck]);

    // Prices are checked on open, so the page is useful without a background cron.
    useEffect(() => {
        if (checkedOnce.current) return;
        checkedOnce.current = true;
        void runCheck();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const unseen = alerts.filter((alert) => alert.triggered && !alert.seen);

    const rows = useMemo(() => {
        if (filter === 'active') return alerts.filter((alert) => !alert.triggered && alert.active !== false);
        if (filter === 'fired') return alerts.filter((alert) => alert.triggered);
        return alerts;
    }, [alerts, filter]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setCreating(true);
        try {
            await createAlert({
                symbol,
                condition,
                targetPrice: Number(target),
                ...(needsCandles(condition) ? { params: paramObject(condition, param) } : {}),
            });
            toast.success(t('alerts.created').replace('{s}', symbol.trim().toUpperCase()));
            setSymbol('');
            setTarget('');
            setParam('');
            router.refresh();
        } catch (error) {
            toast.error(t(errorKey(error)));
        } finally {
            setCreating(false);
        }
    };

    const act = async (id: string, action: () => Promise<unknown>, success?: string) => {
        setBusy(id);
        try {
            await action();
            if (success) toast.success(t(success as StringKey));
            router.refresh();
        } catch (error) {
            toast.error(t(errorKey(error)));
        } finally {
            setBusy(null);
        }
    };

    const saveEdit = async (alert: AlertRow) => {
        const next = Number(editTarget);
        const patch: Parameters<typeof updateAlert>[1] = { targetPrice: next };
        if (needsCandles(alert.condition)) patch.params = paramObject(alert.condition, editParam);
        await act(alert._id, () => updateAlert(alert._id, patch), 'alerts.updated');
        setEditing(null);
    };

    return (
        <div className="flex flex-col gap-3">
            {unseen.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-[12px] bg-brand-soft px-3 py-2 text-[13px] text-brand-ink">
                    <BellRing className="size-4" />
                    <span className="flex-1">{t('alerts.firedMany').replace('{n}', arDigits(unseen.length, lang))}</span>
                    <button
                        type="button"
                        onClick={() => void act('seen', () => markAlertsSeen())}
                        className="pill h-7 px-2.5 text-[12px]"
                    >
                        {t('alerts.markSeen')}
                    </button>
                </div>
            )}

            <PushToggle lang={lang} onChange={setPushOn} />

            <form onSubmit={submit} className="card flex flex-col gap-2 p-3">
                <p className="text-[13px] font-semibold text-foreground">{t('alerts.new')}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                    <input
                        value={symbol}
                        onChange={(event) => setSymbol(event.target.value)}
                        placeholder={t('alerts.symbolHint')}
                        aria-label={t('alerts.symbol')}
                        dir="ltr"
                        className="mono h-9 w-44 rounded-[9px] bg-page px-2.5 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <select
                        value={condition}
                        onChange={(event) => {
                            const next = event.target.value as AlertCondition;
                            setCondition(next);
                            setParam(paramFor(next));
                            // A breakout rule always needs a lookback, so start it on the conventional year.
                            if (next === 'CROSS_52W_HIGH' || next === 'CROSS_52W_LOW') setTarget(String(PARAM_BOUNDS.breakoutLookback.default));
                        }}
                        aria-label={t('alerts.condition')}
                        className="h-9 rounded-[9px] bg-page px-2 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {ALERT_CONDITIONS.map((value) => (
                            <option key={value} value={value}>{alertConditionLabel(lang, value)}</option>
                        ))}
                    </select>
                    <div className="flex h-9 items-center rounded-[9px] bg-page ps-2.5 shadow-[inset_0_0_0_1px_var(--line)] focus-within:ring-2 focus-within:ring-ring">
                        <input
                            value={target}
                            onChange={(event) => setTarget(event.target.value)}
                            inputMode="decimal"
                            placeholder={t(alertTargetPlaceholder(condition))}
                            aria-label={t('alerts.target')}
                            className="num h-full w-20 bg-transparent text-[12.5px] outline-none placeholder:text-faint"
                        />
                        <span className="pe-2 text-[12px] text-faint">{alertTargetUnit(condition)}</span>
                    </div>
                    {hasSecondNumber(condition) && (
                        <div className="flex h-9 items-center gap-1.5 rounded-[9px] bg-page px-2.5 shadow-[inset_0_0_0_1px_var(--line)] focus-within:ring-2 focus-within:ring-ring">
                            <label htmlFor="alert-param" className="text-[12px] text-faint">{t(condition === 'VOLUME_SPIKE' ? 'alerts.param.window' : 'alerts.param.period')}</label>
                            <input
                                id="alert-param"
                                value={param}
                                onChange={(event) => setParam(event.target.value)}
                                inputMode="numeric"
                                aria-label={t(condition === 'VOLUME_SPIKE' ? 'alerts.param.window' : 'alerts.param.period')}
                                className="num h-full w-14 bg-transparent text-[12.5px] outline-none"
                            />
                        </div>
                    )}
                    <button type="submit" disabled={creating || !symbol.trim() || !target} className={cn('btn btn-primary h-9', (creating || !symbol.trim() || !target) && 'opacity-50')}>
                        {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {t('alerts.create')}
                    </button>
                </div>
                <p className="text-[11.5px] text-faint">{t('alerts.auto')}</p>
            </form>

            <div className="flex flex-wrap items-center gap-1.5">
                {(['all', 'active', 'fired'] as Filter[]).map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setFilter(value)}
                        aria-pressed={filter === value}
                        className={cn('pill h-7 px-2.5 text-[12px]', filter === value && 'is-up')}
                    >
                        {t(`alerts.filter.${value}` as StringKey)}
                    </button>
                ))}
                <button type="button" onClick={() => void runCheck()} disabled={checking} className="pill ms-auto h-7 gap-1.5 px-2.5 text-[12px]">
                    <RefreshCw className={cn('size-3.5', checking && 'animate-spin')} /> {t(checking ? 'alerts.checking' : 'alerts.check')}
                </button>
            </div>

            {rows.length === 0 ? (
                <div className="empty-state py-12">
                    <span className="empty-icon"><BellRing className="size-5" /></span>
                    <h3>{t('alerts.empty')}</h3>
                    <p className="max-w-72 text-[13px]">{t('alerts.emptySub')}</p>
                </div>
            ) : (
                <ul className="row-list">
                    {rows.map((alert) => {
                        const status = statusOf(alert);
                        const source = alertSource(alert.symbol);
                        return (
                            <li key={alert._id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="flex items-center gap-2">
                                        <span dir="ltr" className="mono text-[13.5px] font-semibold text-foreground">{alert.symbol}</span>
                                        {source && <span className="text-[10.5px] text-faint">{t(source === 'yahoo' ? 'alerts.source.yahoo' : 'alerts.source.finnhub')}</span>}
                                    </p>
                                    <p className="num truncate text-[12.5px] text-faint">
                                        {alertConditionLabel(lang, alert.condition)} {alertTargetLabel(lang, alert.condition, alert.targetPrice)}
                                        {alertParamsLabel(lang, alert.condition, alert.params) && ` · ${alertParamsLabel(lang, alert.condition, alert.params)}`}
                                        {alert.lastPrice != null && ` · ${t('alerts.last').replace('{p}', priceLabel(alert.lastPrice, lang, alert.condition))}`}
                                        {alert.triggered && alert.triggeredPrice != null && ` · ${t('alerts.status.fired')} ${priceLabel(alert.triggeredPrice, lang, alert.condition)}`}
                                    </p>
                                </div>

                                {editing === alert._id ? (
                                    <div className="flex items-center gap-1">
                                        <input
                                            value={editTarget}
                                            onChange={(event) => setEditTarget(event.target.value)}
                                            inputMode="decimal"
                                            aria-label={t('alerts.target')}
                                            className="num h-7 w-20 rounded-full bg-page px-2 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none"
                                        />
                                        {hasSecondNumber(alert.condition) && (
                                            <input
                                                value={editParam}
                                                onChange={(event) => setEditParam(event.target.value)}
                                                inputMode="numeric"
                                                aria-label={t(alert.condition === 'VOLUME_SPIKE' ? 'alerts.param.window' : 'alerts.param.period')}
                                                className="num h-7 w-16 rounded-full bg-page px-2 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none"
                                            />
                                        )}
                                        <button type="button" onClick={() => void saveEdit(alert)} className="icon-btn" title={t('chart.save')} aria-label={t('chart.save')}>
                                            <Check className="size-3.5" />
                                        </button>
                                        <button type="button" onClick={() => setEditing(null)} className="icon-btn" title={t('chart.cancel')} aria-label={t('chart.cancel')}>
                                            <X className="size-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => { setEditing(alert._id); setEditTarget(String(alert.targetPrice)); setEditParam(paramFor(alert.condition, alert)); }}
                                        className="icon-btn"
                                        title={t('alerts.edit')}
                                        aria-label={t('alerts.edit')}
                                    >
                                        <Pencil className="size-3.5" />
                                    </button>
                                )}

                                <span className={status.className}>{t(status.key)}</span>

                                {alert.triggered ? (
                                    <button type="button" onClick={() => void act(alert._id, () => rearmAlert(alert._id), 'alerts.rearmed')} disabled={busy === alert._id} className="icon-btn" title={t('alerts.rearm')} aria-label={t('alerts.rearm')}>
                                        <RotateCcw className="size-3.5" />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => void act(alert._id, () => updateAlert(alert._id, { active: alert.active === false }))}
                                        disabled={busy === alert._id}
                                        className="icon-btn"
                                        title={t(alert.active === false ? 'alerts.resume' : 'alerts.pause')}
                                        aria-label={t(alert.active === false ? 'alerts.resume' : 'alerts.pause')}
                                    >
                                        {alert.active === false ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => void act(alert._id, () => deleteAlert(alert._id), 'alerts.deleted')}
                                    disabled={busy === alert._id}
                                    className="icon-btn is-danger"
                                    title={t('alerts.delete')}
                                    aria-label={t('alerts.delete')}
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

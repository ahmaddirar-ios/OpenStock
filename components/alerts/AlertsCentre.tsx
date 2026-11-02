'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, Check, Loader2, Pause, Pencil, Play, Plus, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { checkAlerts, createAlert, deleteAlert, markAlertsSeen, rearmAlert, updateAlert } from '@/lib/actions/alert.actions';
import { alertSource, type AlertCondition } from '@/lib/alerts';
import { cn } from '@/lib/utils';
import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import { ALERT_CONDITIONS, alertConditionLabel, alertTargetLabel, isPercentAlert } from '@/components/alerts/labels';

export type AlertRow = {
    _id: string;
    symbol: string;
    targetPrice: number;
    condition: AlertCondition;
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

const priceLabel = (value: number | null | undefined, lang: Lang) =>
    value == null || !Number.isFinite(value) ? '—' : arDigits(Number(value).toFixed(2), lang);

export default function AlertsCentre({ alerts, lang }: { alerts: AlertRow[]; lang: Lang }) {
    const t = useCallback((key: StringKey) => tx(lang, key), [lang]);
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>('all');
    const [checking, setChecking] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [editing, setEditing] = useState<string | null>(null);
    const [editTarget, setEditTarget] = useState('');
    const [symbol, setSymbol] = useState('');
    const [condition, setCondition] = useState<AlertCondition>('ABOVE');
    const [target, setTarget] = useState('');
    const [creating, setCreating] = useState(false);
    const checkedOnce = useRef(false);

    const runCheck = useCallback(async () => {
        setChecking(true);
        try {
            const result = await checkAlerts();
            if (result.fired.length > 0) {
                toast.success(
                    result.fired.length === 1
                        ? t('alerts.firedAt')
                              .replace('{s}', result.fired[0].symbol)
                              .replace('{p}', arDigits(result.fired[0].price.toFixed(2), lang))
                        : t('alerts.firedMany').replace('{n}', arDigits(result.fired.length, lang)),
                );
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
    }, [lang, router, t]);

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
            await createAlert({ symbol, condition, targetPrice: Number(target) });
            toast.success(t('alerts.created').replace('{s}', symbol.trim().toUpperCase()));
            setSymbol('');
            setTarget('');
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
        await act(alert._id, () => updateAlert(alert._id, { targetPrice: next }), 'alerts.updated');
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
                        onChange={(event) => setCondition(event.target.value as AlertCondition)}
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
                            placeholder={isPercentAlert(condition) ? t('alerts.targetPercent') : t('alerts.targetPrice')}
                            aria-label={t('alerts.target')}
                            className="num h-full w-20 bg-transparent text-[12.5px] outline-none placeholder:text-faint"
                        />
                        <span className="pe-2 text-[12px] text-faint">{isPercentAlert(condition) ? '%' : ''}</span>
                    </div>
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
                                        {alert.lastPrice != null && ` · ${t('alerts.last').replace('{p}', priceLabel(alert.lastPrice, lang))}`}
                                        {alert.triggered && alert.triggeredPrice != null && ` · ${t('alerts.status.fired')} ${priceLabel(alert.triggeredPrice, lang)}`}
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
                                        onClick={() => { setEditing(alert._id); setEditTarget(String(alert.targetPrice)); }}
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

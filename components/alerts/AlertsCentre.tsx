'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BellRing, Check, ChevronDown, ChevronUp, FlaskConical, Loader2, Pause, Pencil, Play, Plus, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { checkAlerts, createAlert, deleteAlert, getAlertLog, markAlertsSeen, rearmAlert, updateAlert, type AlertRuleInput } from '@/lib/actions/alert.actions';
import { alertSource, hasSecondNumber, PARAM_BOUNDS, needsCandles, type AlertCondition, type AlertParams } from '@/lib/alerts';
import { cn } from '@/lib/utils';
import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import { ALERT_CONDITIONS, alertConditionLabel, alertParamsLabel, alertTargetLabel, alertTargetPlaceholder, alertTargetUnit, isTextAlert, measureLabel } from '@/lib/alert-labels';
import { isDrawingCondition } from '@/lib/chart/drawing-alert';
import { checkFormula, describeFormulaError } from '@/lib/formula/formula';
import { loadSavedStrategies, type SavedStrategy } from '@/lib/strategy/library-custom';
import PushToggle from '@/components/alerts/PushToggle';
import InAppNotifyToggle from '@/components/alerts/InAppNotifyToggle';
import { alertPushPayload } from '@/lib/push';
import { firingDetail, firingMessage } from '@/lib/alert-notify';
import type { FiredAlert } from '@/lib/actions/alert.actions';

export type AlertRow = {
    _id: string;
    symbol: string;
    targetPrice: number;
    condition: AlertCondition;
    params?: { period?: number; window?: number; expression?: string; strategy?: unknown };
    rules?: { condition: AlertCondition; targetPrice: number; params?: AlertRow['params']; lastValue?: number | null }[];
    join?: 'and' | 'or';
    active?: boolean;
    triggered?: boolean;
    lastPrice?: number | null;
    triggeredAt?: string | null;
    triggeredPrice?: number | null;
    seen?: boolean;
    expiresAt?: string;
    createdAt?: string;
};

export type AlertEventRow = {
    _id: string;
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
    value: number;
    price: number | null;
    changePercent: number | null;
    join: 'and' | 'or';
    rules: number;
    at: string;
};

type Filter = 'all' | 'active' | 'fired';

/** One rule while it is being written. Strings, because a half-typed price is not a number yet. */
type RuleDraft = {
    condition: AlertCondition;
    target: string;
    param: string;
    expression: string;
    strategyId: string;
};

const emptyDraft = (condition: AlertCondition = 'ABOVE'): RuleDraft => ({
    condition,
    target: '',
    param: '',
    expression: '',
    strategyId: '',
});

/** The params payload for a condition, read from the form's second input. */
const paramObject = (condition: AlertCondition, value: string): AlertParams => {
    const number = Number(value);
    if (condition === 'RSI_BELOW' || condition === 'RSI_ABOVE') return { period: number };
    if (condition === 'VOLUME_SPIKE') return { window: number };
    if (condition === 'ATR_ABOVE') return { period: number };
    return {};
};

/** The second number a rule asks for, and the default its form opens on. */
const paramFor = (condition: AlertCondition, row?: { params?: AlertRow['params'] }): string => {
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
        'alerts.err.invalidAnchor',
        'alerts.err.tooManyRules',
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

/** The rules of an alert, including the single rule an older alert stores as its own fields. */
const rulesOf = (alert: AlertRow): { condition: AlertCondition; targetPrice: number; params?: AlertRow['params'] }[] =>
    alert.rules && alert.rules.length > 0
        ? alert.rules
        : [{ condition: alert.condition, targetPrice: alert.targetPrice, params: alert.params }];

/** Whether a draft has everything its condition needs. */
const draftReady = (draft: RuleDraft, strategies: SavedStrategy[]): boolean => {
    if (draft.condition === 'FORMULA') return draft.expression.trim().length > 0 && checkFormula(draft.expression).ok;
    if (draft.condition === 'STRATEGY') return strategies.some((entry) => entry.id === draft.strategyId);
    const value = Number(draft.target);
    return draft.target.trim() !== '' && Number.isFinite(value) && value > 0;
};

/** What the action receives for one drafted rule. */
const draftToRule = (draft: RuleDraft, strategies: SavedStrategy[]): AlertRuleInput => {
    if (draft.condition === 'FORMULA') {
        return { condition: 'FORMULA', targetPrice: 0, params: { expression: draft.expression.trim() } };
    }
    if (draft.condition === 'STRATEGY') {
        const chosen = strategies.find((entry) => entry.id === draft.strategyId);
        return { condition: 'STRATEGY', targetPrice: 0, params: chosen ? { strategy: chosen.strategy } : {} };
    }
    return {
        condition: draft.condition,
        targetPrice: Number(draft.target),
        ...(needsCandles(draft.condition) ? { params: paramObject(draft.condition, draft.param) } : {}),
    };
};

function RuleFields({
    draft,
    onChange,
    lang,
    strategies,
    idPrefix,
    onRemove,
}: {
    draft: RuleDraft;
    onChange: (next: RuleDraft) => void;
    lang: Lang;
    strategies: SavedStrategy[];
    idPrefix: string;
    onRemove?: () => void;
}) {
    const t = useCallback((key: StringKey) => tx(lang, key), [lang]);
    const set = (patch: Partial<RuleDraft>) => onChange({ ...draft, ...patch });
    const formulaError = draft.condition === 'FORMULA' && draft.expression.trim()
        ? (() => {
            const check = checkFormula(draft.expression);
            return check.ok ? null : describeFormulaError(check.error, lang);
        })()
        : null;

    const chooseCondition = (next: AlertCondition) => {
        const patch: Partial<RuleDraft> = { condition: next, target: '', param: paramFor(next) };
        // A breakout rule always needs a lookback, so start it on the conventional year.
        if (next === 'CROSS_52W_HIGH' || next === 'CROSS_52W_LOW') patch.target = String(PARAM_BOUNDS.breakoutLookback.default);
        set(patch);
    };

    return (
        <div className="flex flex-wrap items-start gap-1.5">
            <select
                value={draft.condition}
                onChange={(event) => chooseCondition(event.target.value as AlertCondition)}
                aria-label={t('alerts.condition')}
                className="h-9 max-w-full rounded-[9px] bg-page px-2 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {ALERT_CONDITIONS.map((value) => (
                    <option key={value} value={value}>{alertConditionLabel(lang, value)}</option>
                ))}
            </select>

            {draft.condition === 'FORMULA' ? (
                <div className="flex min-w-[220px] flex-1 flex-col gap-1">
                    <input
                        value={draft.expression}
                        onChange={(event) => set({ expression: event.target.value })}
                        placeholder={t('alerts.formulaPlaceholder')}
                        aria-label={t('alerts.formula')}
                        dir="ltr"
                        spellCheck={false}
                        className="mono h-9 w-full rounded-[9px] bg-page px-2.5 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {formulaError && <span className="text-[11px] text-down">{formulaError}</span>}
                </div>
            ) : draft.condition === 'STRATEGY' ? (
                <div className="flex min-w-[220px] flex-1 flex-col gap-1">
                    {strategies.length > 0 ? (
                        <select
                            value={draft.strategyId}
                            onChange={(event) => set({ strategyId: event.target.value })}
                            aria-label={t('alerts.strategy')}
                            className="h-9 max-w-full rounded-[9px] bg-page px-2 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="">{t('alerts.strategyPick')}</option>
                            {strategies.map((entry) => (
                                <option key={entry.id} value={entry.id}>{entry.name}</option>
                            ))}
                        </select>
                    ) : (
                        <Link href="/strategies/custom" className="text-[11.5px] text-brand hover:underline">
                            {t('alerts.strategyNone')} {t('alerts.strategyLink')}
                        </Link>
                    )}
                </div>
            ) : (
                <>
                    <div className="flex h-9 items-center rounded-[9px] bg-page ps-2.5 shadow-[inset_0_0_0_1px_var(--line)] focus-within:ring-2 focus-within:ring-ring">
                        <input
                            value={draft.target}
                            onChange={(event) => set({ target: event.target.value })}
                            inputMode="decimal"
                            placeholder={t(alertTargetPlaceholder(draft.condition))}
                            aria-label={t('alerts.target')}
                            className="num h-full w-20 bg-transparent text-[12.5px] outline-none placeholder:text-faint"
                        />
                        <span className="pe-2 text-[12px] text-faint">{alertTargetUnit(draft.condition)}</span>
                    </div>
                    {hasSecondNumber(draft.condition) && (
                        <div className="flex h-9 items-center gap-1.5 rounded-[9px] bg-page px-2.5 shadow-[inset_0_0_0_1px_var(--line)] focus-within:ring-2 focus-within:ring-ring">
                            <label htmlFor={`${idPrefix}-param`} className="text-[12px] text-faint">{t(draft.condition === 'VOLUME_SPIKE' ? 'alerts.param.window' : 'alerts.param.period')}</label>
                            <input
                                id={`${idPrefix}-param`}
                                value={draft.param}
                                onChange={(event) => set({ param: event.target.value })}
                                inputMode="numeric"
                                aria-label={t(draft.condition === 'VOLUME_SPIKE' ? 'alerts.param.window' : 'alerts.param.period')}
                                className="num h-full w-14 bg-transparent text-[12.5px] outline-none"
                            />
                        </div>
                    )}
                </>
            )}

            {onRemove && (
                <button type="button" onClick={onRemove} className="icon-btn mt-0.5" title={t('alerts.removeRule')} aria-label={t('alerts.removeRule')}>
                    <X className="size-3.5" />
                </button>
            )}
        </div>
    );
}

export default function AlertsCentre({ alerts, lang }: { alerts: AlertRow[]; lang: Lang }) {
    const t = useCallback((key: StringKey) => tx(lang, key), [lang]);
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>('all');
    const [checking, setChecking] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [editing, setEditing] = useState<string | null>(null);
    const [editSymbol, setEditSymbol] = useState('');
    const [editCondition, setEditCondition] = useState<AlertCondition>('ABOVE');
    const [editTarget, setEditTarget] = useState('');
    const [editParam, setEditParam] = useState('');
    const [symbol, setSymbol] = useState('');
    const [draft, setDraft] = useState<RuleDraft>(() => emptyDraft());
    const [extra, setExtra] = useState<RuleDraft[]>([]);
    const [join, setJoin] = useState<'and' | 'or'>('and');
    const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
    const [creating, setCreating] = useState(false);
    const [pushOn, setPushOn] = useState(false);
    const [log, setLog] = useState<AlertEventRow[]>([]);
    const [logOpen, setLogOpen] = useState(false);
    const checkedOnce = useRef(false);

    // Saved strategies live in localStorage, which the server cannot read; the picker reads them here.
    useEffect(() => {
        setStrategies(loadSavedStrategies());
    }, []);

    const refreshLog = useCallback(async () => {
        try {
            setLog((await getAlertLog(20)) as AlertEventRow[]);
        } catch {
            // A log that will not load must not break the page it explains.
        }
    }, []);

    useEffect(() => {
        if (logOpen) void refreshLog();
    }, [logOpen, refreshLog]);

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
                const many = result.fired.length > 1;
                toast.success(
                    many
                        ? t('alerts.firedMany').replace('{n}', arDigits(result.fired.length, lang))
                        : firingMessage(result.fired[0], lang),
                    many
                        ? { description: result.fired.slice(0, 3).map((hit) => firingMessage(hit, lang)).join(' · ') }
                        : { description: firingDetail(result.fired[0], lang) },
                );
                // Nothing to notify unless this device asked for notifications.
                if (pushOn) void notifyFired(result.fired);
                if (logOpen) void refreshLog();
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
    }, [lang, logOpen, notifyFired, pushOn, refreshLog, router, t]);

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

    const ready = draftReady(draft, strategies) && extra.every((entry) => draftReady(entry, strategies));

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setCreating(true);
        try {
            const lead = draftToRule(draft, strategies);
            const extras = extra.map((entry) => draftToRule(entry, strategies));
            await createAlert({
                symbol,
                condition: lead.condition,
                targetPrice: lead.targetPrice,
                params: lead.params,
                join,
                ...(extras.length > 0 ? { rules: extras } : {}),
            });
            toast.success(t('alerts.created').replace('{s}', symbol.trim().toUpperCase()));
            setSymbol('');
            setDraft(emptyDraft());
            setExtra([]);
            setJoin('and');
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
        // The edit row can change what the rule watches as well as its target, so the patch carries
        // the symbol and the condition too. A text rule (formula/strategy) has no number to send.
        const patch: Parameters<typeof updateAlert>[1] = {
            symbol: editSymbol.trim(),
            condition: editCondition,
        };
        if (!isTextAlert(editCondition) && !isDrawingCondition(editCondition)) {
            patch.targetPrice = Number(editTarget);
            if (needsCandles(editCondition)) patch.params = paramObject(editCondition, editParam);
        }
        await act(alert._id, () => updateAlert(alert._id, patch), 'alerts.updated');
        setEditing(null);
    };

    /** The conditions the edit row offers: every price/series rule, plus the alert's own drawing rule. */
    const editConditions = (current: AlertCondition): AlertCondition[] =>
        isDrawingCondition(current) ? [current, ...ALERT_CONDITIONS] : ALERT_CONDITIONS;

    const whenLabel = (value: string) => {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return '—';
        return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-arab' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(date);
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

            <InAppNotifyToggle lang={lang} />
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
                    <RuleFields draft={draft} onChange={setDraft} lang={lang} strategies={strategies} idPrefix="alert-lead" />
                    <button type="submit" disabled={creating || !symbol.trim() || !ready} className={cn('btn btn-primary h-9', (creating || !symbol.trim() || !ready) && 'opacity-50')}>
                        {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {t('alerts.create')}
                    </button>
                </div>

                {extra.map((entry, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2">
                        <span className="min-w-16 text-[11px] font-semibold uppercase text-faint">
                            {t(join === 'or' ? 'alerts.join.or' : 'alerts.join.and')}
                        </span>
                        <RuleFields
                            draft={entry}
                            onChange={(next) => setExtra(extra.map((item, at) => (at === index ? next : item)))}
                            lang={lang}
                            strategies={strategies}
                            idPrefix={`alert-extra-${index}`}
                            onRemove={() => setExtra(extra.filter((_, at) => at !== index))}
                        />
                    </div>
                ))}

                <div className="flex flex-wrap items-center gap-2">
                    {extra.length > 0 && (
                        <button type="button" onClick={() => setJoin(join === 'and' ? 'or' : 'and')} className="pill h-7 px-2.5 text-[12px]">
                            {t(join === 'or' ? 'alerts.join.or' : 'alerts.join.and')}
                        </button>
                    )}
                    {extra.length < 4 && (
                        <button
                            type="button"
                            onClick={() => setExtra([...extra, emptyDraft()])}
                            className="pill h-7 gap-1 px-2.5 text-[12px]"
                        >
                            <Plus className="size-3" /> {t('alerts.addRule')}
                        </button>
                    )}
                </div>

                <p className="text-[11.5px] text-faint">
                    {draft.condition === 'FORMULA' || draft.condition === 'STRATEGY'
                        ? t(draft.condition === 'FORMULA' ? 'alerts.formulaHint' : 'alerts.strategyHint')
                        : t('alerts.auto')}
                </p>
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
                        const ruleSet = rulesOf(alert);
                        const grouped = ruleSet.length > 1;
                        const single = ruleSet.length === 1;
                        return (
                            <li key={alert._id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="flex items-center gap-2">
                                        <span dir="ltr" className="mono text-[13.5px] font-semibold text-foreground">{alert.symbol}</span>
                                        {source && <span className="text-[10.5px] text-faint">{t(source === 'yahoo' ? 'alerts.source.yahoo' : 'alerts.source.finnhub')}</span>}
                                        {grouped && (
                                            <span className="pill h-5 px-1.5 text-[10px]">
                                                {t(alert.join === 'or' ? 'alerts.join.or' : 'alerts.join.and')}
                                            </span>
                                        )}
                                    </p>
                                    {grouped ? (
                                        <ul className="flex flex-col gap-0.5">
                                            {ruleSet.map((rule, index) => (
                                                <li key={index} className="num flex flex-wrap items-center gap-1 text-[12px] text-faint">
                                                    <span className="text-[10px] uppercase text-faint">{t('alerts.rule').replace('{n}', arDigits(index + 1, lang))}</span>
                                                    <span>{alertConditionLabel(lang, rule.condition)} {alertTargetLabel(lang, rule.condition, rule.targetPrice)}</span>
                                                    {alertParamsLabel(lang, rule.condition, rule.params) && <span>· {alertParamsLabel(lang, rule.condition, rule.params)}</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="num truncate text-[12.5px] text-faint">
                                            {alertConditionLabel(lang, alert.condition)} {alertTargetLabel(lang, alert.condition, alert.targetPrice)}
                                            {alertParamsLabel(lang, alert.condition, alert.params) && ` · ${alertParamsLabel(lang, alert.condition, alert.params)}`}
                                            {!isTextAlert(alert.condition) && alert.lastPrice != null && ` · ${t('alerts.last').replace('{p}', priceLabel(alert.lastPrice, lang, alert.condition))}`}
                                            {alert.triggered && alert.triggeredPrice != null && ` · ${t('alerts.status.fired')} ${priceLabel(alert.triggeredPrice, lang, alert.condition)}`}
                                        </p>
                                    )}
                                </div>

                                {editing === alert._id && single ? (
                                    <div className="flex flex-wrap items-center gap-1">
                                        <input
                                            value={editSymbol}
                                            onChange={(event) => setEditSymbol(event.target.value)}
                                            aria-label={t('alerts.symbol')}
                                            dir="ltr"
                                            className="mono h-7 w-24 rounded-full bg-page px-2 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none"
                                        />
                                        <select
                                            value={editCondition}
                                            onChange={(event) => {
                                                const next = event.target.value as AlertCondition;
                                                setEditCondition(next);
                                                setEditTarget('');
                                                setEditParam(paramFor(next));
                                            }}
                                            aria-label={t('alerts.condition')}
                                            className="h-7 max-w-[150px] rounded-full bg-page px-2 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none"
                                        >
                                            {editConditions(alert.condition).map((value) => (
                                                <option key={value} value={value}>{alertConditionLabel(lang, value)}</option>
                                            ))}
                                        </select>
                                        {!isTextAlert(editCondition) && !isDrawingCondition(editCondition) && (
                                            <input
                                                value={editTarget}
                                                onChange={(event) => setEditTarget(event.target.value)}
                                                inputMode="decimal"
                                                aria-label={t('alerts.target')}
                                                className="num h-7 w-20 rounded-full bg-page px-2 text-[12px] shadow-[inset_0_0_0_1px_var(--line)] outline-none"
                                            />
                                        )}
                                        {hasSecondNumber(editCondition) && (
                                            <input
                                                value={editParam}
                                                onChange={(event) => setEditParam(event.target.value)}
                                                inputMode="numeric"
                                                aria-label={t(editCondition === 'VOLUME_SPIKE' ? 'alerts.param.window' : 'alerts.param.period')}
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
                                    single && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditing(alert._id);
                                                setEditSymbol(alert.symbol);
                                                setEditCondition(alert.condition);
                                                setEditTarget(String(alert.targetPrice));
                                                setEditParam(paramFor(alert.condition, alert));
                                            }}
                                            className="icon-btn"
                                            title={t('alerts.edit')}
                                            aria-label={t('alerts.edit')}
                                        >
                                            <Pencil className="size-3.5" />
                                        </button>
                                    )
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

            <section className="card flex flex-col gap-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                        <FlaskConical className="size-3.5 text-brand" /> {t('alerts.log')}
                    </p>
                    <button
                        type="button"
                        onClick={() => setLogOpen(!logOpen)}
                        className="pill ms-auto h-7 gap-1 px-2.5 text-[12px]"
                        aria-expanded={logOpen}
                    >
                        {t(logOpen ? 'alerts.logHide' : 'alerts.logShow')}
                        {logOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    </button>
                </div>
                <p className="text-[11.5px] text-faint">{t('alerts.logSub')}</p>
                {logOpen && (
                    log.length === 0 ? (
                        <p className="py-3 text-center text-[12px] text-faint">{t('alerts.logEmpty')}</p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-line/60">
                            {log.map((event) => (
                                <li key={event._id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
                                    <span dir="ltr" className="mono text-[12.5px] font-semibold text-foreground">{event.symbol}</span>
                                    <span className="num text-[12px] text-faint">
                                        {alertConditionLabel(lang, event.condition)} {alertTargetLabel(lang, event.condition, event.targetPrice)}
                                    </span>
                                    <span className="num text-[12px] text-muted-foreground">{priceLabel(event.value, lang, event.condition)}</span>
                                    {event.rules > 1 && (
                                        <span className="pill h-5 px-1.5 text-[10px]">
                                            {t(event.join === 'or' ? 'alerts.join.or' : 'alerts.join.and')} · {arDigits(event.rules, lang)}
                                        </span>
                                    )}
                                    <span className={cn('ms-auto text-[11px] text-faint')}>{whenLabel(event.at)}</span>
                                </li>
                            ))}
                        </ul>
                    )
                )}
            </section>
        </div>
    );
}

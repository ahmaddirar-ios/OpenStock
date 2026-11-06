'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Code2, ListTree, Plus, Save, Trash2, X } from 'lucide-react';
import {
    FORMULA_CONSTANTS,
    FORMULA_EXAMPLES,
    FORMULA_FUNCTIONS,
    FORMULA_SERIES,
    checkFormula,
    describeFormulaError,
} from '@/lib/formula';
import {
    BUILDER_INDICATORS,
    BUILDER_OPERATORS,
    BUILDER_PRICES,
    MAX_BUILDER_CONDITIONS,
    buildExpression,
    defaultBuilderCondition,
    emptyBuilderGroup,
    parseBuilder,
    type BuilderCondition,
    type BuilderGroup,
    type BuilderIndicator,
    type BuilderOperand,
    type BuilderOperator,
} from '@/lib/formula-builder';
import {
    MAX_SAVED_FORMULAS,
    addSavedFormula,
    cleanFormulaName,
    loadSavedFormulas,
    mergeFormulas,
    removeSavedFormula,
    saveSavedFormulas,
    type SavedFormula,
} from '@/lib/formula-library';
import { loadFormulas, saveFormulas } from '@/lib/actions/formula.actions';
import { MAX_FORMULA_LENGTH } from '@/lib/chart-studies';
import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// The formula studio: a real editor with a gutter and a column-accurate error, a visual builder that
// writes the same text, the function reference, and the shelf that follows the account. The text is
// the single source of truth — the builder writes it, the editor writes it, the chart reads it.

type Props = {
    lang: Lang;
    open: boolean;
    initialExpression: string;
    onApply: (expression: string) => void;
    onClose: () => void;
};

type Mode = 'code' | 'builder';
type Account = 'checking' | 'ready' | 'local';
type Notice = 'account' | 'local' | 'failed' | 'name' | 'invalid' | 'full' | null;

const AR_FUNCTION_HELP: Record<string, string> = {
    sma: 'المتوسط البسيط لآخر n شمعة',
    ema: 'المتوسط الأسي',
    rma: 'متوسط وايلدر، كما يستخدمه RSI',
    rsi: 'مؤشر القوة النسبية على n شمعة',
    sum: 'المجموع على آخر n شمعة',
    stdev: 'الانحراف المعياري على n شمعة',
    highest: 'أعلى قيمة في n شمعة',
    lowest: 'أدنى قيمة في n شمعة',
    change: 'الفرق عن الشمعة السابقة',
    crossover: '١ عند تقاطع a صعوداً فوق b، وإلا ٠',
    crossunder: '١ عند تقاطع a هبوطاً تحت b، وإلا ٠',
    if: 'a إذا تحقق الشرط، وإلا b',
    nz: 'x، أو البديل عندما تكون x غير متاحة (٠ إن لم يُذكر)',
    abs: 'القيمة المطلقة',
    sqrt: 'الجذر التربيعي',
    pow: 'a مرفوعة للقوة b',
    max: 'الأكبر من القيمتين',
    min: 'الأصغر من القيمتين',
};

const AR_SERIES_HELP: Record<string, string> = {
    open: 'سعر الافتتاح',
    high: 'أعلى سعر',
    low: 'أدنى سعر',
    close: 'سعر الإغلاق',
    volume: 'حجم التداول',
    hl2: 'منتصف المدى (أعلى + أدنى) ÷ ٢',
    hlc3: 'متوسط (أعلى + أدنى + إغلاق) ÷ ٣',
    ohlc4: 'متوسط الأسعار الأربعة',
    bar_index: 'رقم الشمعة، يبدأ من ٠',
    na: 'قيمة غير متاحة',
};

const OPERATOR_LABEL: Record<BuilderOperator, StringKey> = {
    '>': 'studio.op.gt',
    '>=': 'studio.op.gte',
    '<': 'studio.op.lt',
    '<=': 'studio.op.lte',
    '==': 'studio.op.eq',
    crossesAbove: 'studio.op.crossesAbove',
    crossesBelow: 'studio.op.crossesBelow',
};

const defaultOperand = (kind: BuilderOperand['kind']): BuilderOperand => {
    if (kind === 'number') return { kind: 'number', value: 0 };
    if (kind === 'indicator') return { kind: 'indicator', fn: 'sma', source: 'close', period: 20 };
    return { kind: 'price', series: 'close' };
};

function OperandEditor({
    operand,
    onChange,
    lang,
    label,
    paramKeys = [],
}: {
    operand: BuilderOperand;
    onChange: (next: BuilderOperand) => void;
    lang: Lang;
    label: string;
    paramKeys?: string[];
}) {
    const t = (key: StringKey) => tx(lang, key);
    const offset = operand.kind === 'price' || operand.kind === 'indicator' ? operand.offset ?? 0 : 0;
    return (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</span>
            <div className="flex min-w-0 flex-wrap items-center gap-1">
                <select
                    value={operand.kind}
                    onChange={(event) => {
                        const kind = event.target.value as BuilderOperand['kind'];
                        onChange(kind === 'param' ? { kind: 'param', key: paramKeys[0] ?? 'p1' } : defaultOperand(kind));
                    }}
                    aria-label={`${label} — ${t('studio.kind')}`}
                    className="h-7 rounded-[6px] bg-page px-1.5 text-[11.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                    <option value="price">{t('studio.operand.price')}</option>
                    <option value="indicator">{t('studio.operand.indicator')}</option>
                    <option value="number">{t('studio.operand.number')}</option>
                    {paramKeys.length > 0 && <option value="param">{t('studio.operand.param')}</option>}
                </select>

                {operand.kind === 'price' && (
                    <select
                        value={operand.series}
                        onChange={(event) => onChange({ ...operand, series: event.target.value })}
                        aria-label={t('studio.series')}
                        className="mono h-7 rounded-[6px] bg-page px-1.5 text-[11.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        {BUILDER_PRICES.map((series) => (
                            <option key={series} value={series}>{series}</option>
                        ))}
                    </select>
                )}

                {operand.kind === 'indicator' && (
                    <>
                        <select
                            value={operand.fn}
                            onChange={(event) => onChange({ ...operand, fn: event.target.value as BuilderIndicator })}
                            aria-label={t('studio.functions')}
                            className="h-7 rounded-[6px] bg-page px-1.5 text-[11.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            {BUILDER_INDICATORS.map((entry) => (
                                <option key={entry.id} value={entry.id}>{entry.label}</option>
                            ))}
                        </select>
                        <select
                            value={operand.source}
                            onChange={(event) => onChange({ ...operand, source: event.target.value })}
                            aria-label={t('studio.series')}
                            className="mono h-7 rounded-[6px] bg-page px-1.5 text-[11.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            {BUILDER_PRICES.map((series) => (
                                <option key={series} value={series}>{series}</option>
                            ))}
                        </select>
                        {paramKeys.length > 0 && (
                            <select
                                value={operand.periodParam ?? ''}
                                onChange={(event) => {
                                    const key = event.target.value;
                                    onChange(key ? { ...operand, periodParam: key } : { ...operand, periodParam: undefined });
                                }}
                                aria-label={t('studio.period')}
                                className="mono h-7 rounded-[6px] bg-page px-1.5 text-[11.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                <option value="">{t('studio.operand.number')}</option>
                                {paramKeys.map((key) => (
                                    <option key={key} value={key}>{`{${key}}`}</option>
                                ))}
                            </select>
                        )}
                        {!operand.periodParam && (
                            <input
                                type="number"
                                min={1}
                                max={2000}
                                value={operand.period}
                                onChange={(event) => {
                                    const value = Math.max(1, Math.min(2000, Math.floor(Number(event.target.value) || 1)));
                                    onChange({ ...operand, period: value });
                                }}
                                aria-label={t('studio.period')}
                                className="num h-7 w-14 rounded-[6px] bg-page px-1.5 text-[11.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                        )}
                    </>
                )}

                {operand.kind === 'param' && (
                    <select
                        value={operand.key}
                        onChange={(event) => onChange({ kind: 'param', key: event.target.value })}
                        aria-label={t('studio.operand.param')}
                        className="mono h-7 rounded-[6px] bg-page px-1.5 text-[11.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        {paramKeys.map((key) => (
                            <option key={key} value={key}>{`{${key}}`}</option>
                        ))}
                    </select>
                )}

                {operand.kind === 'number' && (
                    <input
                        type="number"
                        step="any"
                        value={operand.value}
                        onChange={(event) => onChange({ kind: 'number', value: Number(event.target.value) || 0 })}
                        aria-label={t('studio.operand.number')}
                        className="num h-7 w-20 rounded-[6px] bg-page px-1.5 text-[11.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                )}

                {(operand.kind === 'price' || operand.kind === 'indicator') && (
                    <label className="flex items-center gap-1 text-[10px] text-faint">
                        <span>{t('studio.offset')}</span>
                        <input
                            type="number"
                            min={0}
                            max={500}
                            value={offset}
                            onChange={(event) => {
                                const value = Math.max(0, Math.min(500, Math.floor(Number(event.target.value) || 0)));
                                if (operand.kind === 'price') {
                                    onChange(value > 0 ? { kind: 'price', series: operand.series, offset: value } : { kind: 'price', series: operand.series });
                                } else if (operand.kind === 'indicator') {
                                    onChange(
                                        value > 0
                                            ? { kind: 'indicator', fn: operand.fn, source: operand.source, period: operand.period, offset: value }
                                            : { kind: 'indicator', fn: operand.fn, source: operand.source, period: operand.period },
                                    );
                                }
                            }}
                            aria-label={t('studio.offset')}
                            className="num h-7 w-12 rounded-[6px] bg-page px-1 text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </label>
                )}
            </div>
        </div>
    );
}

export default function FormulaStudio({ lang, open, initialExpression, onApply, onClose }: Props) {
    const t = (key: StringKey) => tx(lang, key);
    const [mode, setMode] = useState<Mode>('code');
    const [text, setText] = useState(initialExpression);
    const [group, setGroup] = useState<BuilderGroup>(emptyBuilderGroup);
    const [builderUnreadable, setBuilderUnreadable] = useState(false);
    const [saved, setSaved] = useState<SavedFormula[]>([]);
    const [name, setName] = useState('');
    const [account, setAccount] = useState<Account>('checking');
    const [notice, setNotice] = useState<Notice>(null);
    const [busy, setBusy] = useState(false);
    const areaRef = useRef<HTMLTextAreaElement>(null);
    const gutterRef = useRef<HTMLDivElement>(null);

    const checked = useMemo(() => checkFormula(text), [text]);
    const errorLine = useMemo(() => {
        if (checked.ok || typeof checked.position !== 'number') return null;
        return text.slice(0, checked.position).split('\n').length;
    }, [checked, text]);
    const errorColumn = useMemo(() => {
        if (checked.ok || typeof checked.position !== 'number') return null;
        const before = text.slice(0, checked.position);
        return checked.position - before.lastIndexOf('\n');
    }, [checked, text]);
    const lines = useMemo(() => text.split('\n'), [text]);

    // Opening the studio starts from the study's current expression and re-reads the shelf.
    useEffect(() => {
        if (!open) return;
        setText(initialExpression);
        setMode('code');
        setBuilderUnreadable(false);
        setNotice(null);
        setName('');
        setAccount('checking');
        const local = loadSavedFormulas();
        setSaved(local);
        let cancelled = false;
        loadFormulas()
            .then((result) => {
                if (cancelled) return;
                if (!result.ok) {
                    setAccount('local');
                    return;
                }
                setAccount('ready');
                const merged = mergeFormulas(local, result.items);
                setSaved(merged);
                saveSavedFormulas(merged);
                // The account was missing something this browser had: push the union back once.
                if (JSON.stringify(merged) !== JSON.stringify(result.items)) void saveFormulas(merged);
            })
            .catch(() => {
                if (!cancelled) setAccount('local');
            });
        return () => {
            cancelled = true;
        };
    }, [open, initialExpression]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
            }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [open, onClose]);

    useEffect(() => {
        if (open && mode === 'code') areaRef.current?.focus();
    }, [open, mode]);

    const syncScroll = useCallback(() => {
        if (gutterRef.current && areaRef.current) gutterRef.current.scrollTop = areaRef.current.scrollTop;
    }, []);

    const insert = (snippet: string) => {
        const area = areaRef.current;
        if (!area) {
            setText((current) => current + snippet);
            return;
        }
        const start = area.selectionStart;
        const end = area.selectionEnd;
        const next = text.slice(0, start) + snippet + text.slice(end);
        setText(next);
        requestAnimationFrame(() => {
            area.focus();
            area.setSelectionRange(start + snippet.length, start + snippet.length);
        });
    };

    const switchMode = (next: Mode) => {
        if (next === 'builder') {
            const parsed = parseBuilder(text);
            if (parsed) {
                setGroup(parsed);
                setBuilderUnreadable(false);
            } else {
                setBuilderUnreadable(true);
            }
        }
        setMode(next);
    };

    const updateGroup = (next: BuilderGroup) => {
        setGroup(next);
        setBuilderUnreadable(false);
        setText(buildExpression(next));
    };

    const updateCondition = (index: number, patch: Partial<BuilderCondition>) => {
        updateGroup({
            ...group,
            conditions: group.conditions.map((condition, i) => (i === index ? { ...condition, ...patch } : condition)),
        });
    };

    const save = async () => {
        const cleaned = cleanFormulaName(name);
        if (!cleaned) {
            setNotice('name');
            return;
        }
        if (!checked.ok) {
            setNotice('invalid');
            return;
        }
        const next = addSavedFormula(saved, cleaned, text);
        if (next === saved) {
            setNotice('full');
            return;
        }
        setSaved(next);
        saveSavedFormulas(next);
        setName('');
        if (account !== 'ready') {
            setNotice('local');
            return;
        }
        setBusy(true);
        try {
            const result = await saveFormulas(next);
            setNotice(result.ok ? 'account' : 'failed');
        } catch {
            setNotice('failed');
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: string) => {
        const next = removeSavedFormula(saved, id);
        setSaved(next);
        saveSavedFormulas(next);
        if (account === 'ready') {
            try {
                await saveFormulas(next);
            } catch {
                // The browser copy is already correct; the next open retries the account.
            }
        }
    };

    const apply = () => {
        if (!checked.ok) return;
        onApply(text);
        onClose();
    };

    if (!open) return null;

    const noticeText: Record<Exclude<Notice, null>, string> = {
        account: t('studio.accountSaved'),
        local: t('studio.localSaved'),
        failed: t('studio.saveFailed'),
        name: t('studio.nameRequired'),
        invalid: t('studio.invalidCannotSave'),
        full: t('studio.shelfFull'),
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4" role="presentation">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t('studio.title')}
                className="relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[14px] bg-card text-start shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-1 ring-line"
            >
                <header className="flex items-start justify-between gap-3 border-b border-line px-3 py-2.5 sm:px-4">
                    <div className="min-w-0">
                        <h2 className="text-[14px] font-semibold text-foreground">{t('studio.title')}</h2>
                        <p className="mt-0.5 text-[11px] leading-snug text-faint">{t('studio.sub')}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <div className="flex rounded-[8px] bg-page p-0.5" role="tablist" aria-label={t('studio.mode')}>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={mode === 'code'}
                                onClick={() => switchMode('code')}
                                className={cn('pill h-6 gap-1 px-2 text-[11px]', mode === 'code' && 'is-brand')}
                            >
                                <Code2 className="size-3" />
                                {t('studio.code')}
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={mode === 'builder'}
                                onClick={() => switchMode('builder')}
                                className={cn('pill h-6 gap-1 px-2 text-[11px]', mode === 'builder' && 'is-brand')}
                            >
                                <ListTree className="size-3" />
                                {t('studio.builder')}
                            </button>
                        </div>
                        <button type="button" onClick={onClose} aria-label={t('studio.close')} className="icon-btn">
                            <X />
                        </button>
                    </div>
                </header>

                <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_17rem]">
                    <div className="flex min-h-0 flex-col gap-2 p-3 sm:p-4">
                        {mode === 'code' ? (
                            <div className="flex min-h-[15rem] flex-1 flex-col overflow-hidden rounded-[10px] bg-page ring-1 ring-line focus-within:ring-2 focus-within:ring-ring">
                                <div className="flex min-h-0 flex-1">
                                    <div
                                        ref={gutterRef}
                                        aria-hidden="true"
                                        className="mono num w-10 shrink-0 select-none overflow-hidden border-e border-line bg-card/40 py-2 text-end text-[11px] leading-5 text-faint"
                                    >
                                        {lines.map((_, index) => (
                                            <div
                                                key={index}
                                                className={cn('pe-1.5', errorLine === index + 1 && 'bg-down/15 font-semibold text-down')}
                                            >
                                                {index + 1}
                                            </div>
                                        ))}
                                    </div>
                                    <textarea
                                        ref={areaRef}
                                        value={text}
                                        onChange={(event) => setText(event.target.value.slice(0, MAX_FORMULA_LENGTH))}
                                        onScroll={syncScroll}
                                        maxLength={MAX_FORMULA_LENGTH}
                                        spellCheck={false}
                                        autoCapitalize="off"
                                        autoCorrect="off"
                                        wrap="off"
                                        dir="ltr"
                                        aria-label={t('studio.editor')}
                                        aria-invalid={!checked.ok}
                                        className="mono min-h-[15rem] w-full resize-none overflow-auto bg-transparent px-2 py-2 text-[12.5px] leading-5 text-foreground outline-none"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {builderUnreadable ? (
                                    <div className="rounded-[10px] bg-page p-3 ring-1 ring-line">
                                        <p className="text-[12px] leading-relaxed text-faint">{t('studio.builderUnreadable')}</p>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            <button type="button" onClick={() => switchMode('code')} className="pill h-7 px-2.5 text-[11.5px]">
                                                {t('studio.code')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => updateGroup({ join: 'and', conditions: [defaultBuilderCondition()] })}
                                                className="pill is-brand h-7 px-2.5 text-[11.5px]"
                                            >
                                                {t('studio.startFresh')}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <label className="flex items-center gap-1.5 text-[11px] text-faint">
                                                <span>{t('studio.join')}</span>
                                                <select
                                                    value={group.join}
                                                    onChange={(event) => updateGroup({ ...group, join: event.target.value as BuilderGroup['join'] })}
                                                    aria-label={t('studio.join')}
                                                    className="h-7 rounded-[6px] bg-page px-1.5 text-[11.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                >
                                                    <option value="and">{t('studio.joinAnd')}</option>
                                                    <option value="or">{t('studio.joinOr')}</option>
                                                </select>
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => updateGroup({ ...group, conditions: [...group.conditions, defaultBuilderCondition()] })}
                                                disabled={group.conditions.length >= MAX_BUILDER_CONDITIONS}
                                                className="pill h-7 gap-1 px-2.5 text-[11.5px] disabled:opacity-50"
                                            >
                                                <Plus className="size-3" />
                                                {t('studio.addCondition')}
                                            </button>
                                        </div>

                                        {group.conditions.length === 0 && (
                                            <p className="rounded-[10px] bg-page p-3 text-[12px] text-faint">{t('studio.builderEmpty')}</p>
                                        )}

                                        <div className="flex flex-col gap-2">
                                            {group.conditions.map((condition, index) => (
                                                <div key={index} className="rounded-[10px] bg-page p-2 ring-1 ring-line">
                                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                                        <OperandEditor
                                                            operand={condition.left}
                                                            onChange={(left) => updateCondition(index, { left })}
                                                            lang={lang}
                                                            label={t('studio.left')}
                                                        />
                                                        <div className="flex flex-col gap-1 sm:w-36">
                                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                                                                {t('studio.operator')}
                                                            </span>
                                                            <select
                                                                value={condition.op}
                                                                onChange={(event) => updateCondition(index, { op: event.target.value as BuilderOperator })}
                                                                aria-label={t('studio.operator')}
                                                                className="h-7 rounded-[6px] bg-card px-1.5 text-[11.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                            >
                                                                {BUILDER_OPERATORS.map((operator) => (
                                                                    <option key={operator} value={operator}>
                                                                        {t(OPERATOR_LABEL[operator])}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <OperandEditor
                                                            operand={condition.right}
                                                            onChange={(right) => updateCondition(index, { right })}
                                                            lang={lang}
                                                            label={t('studio.right')}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                updateGroup({
                                                                    ...group,
                                                                    conditions: group.conditions.filter((_, i) => i !== index),
                                                                })
                                                            }
                                                            aria-label={t('studio.removeCondition')}
                                                            title={t('studio.removeCondition')}
                                                            className="icon-btn is-danger shrink-0 self-end sm:mb-0.5"
                                                        >
                                                            <Trash2 />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                <div className="rounded-[10px] bg-page p-2 ring-1 ring-line">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">{t('studio.preview')}</p>
                                    <code className="mono mt-1 block break-words text-[11.5px] leading-relaxed text-foreground" dir="ltr">
                                        {text || '—'}
                                    </code>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                            {checked.ok ? (
                                <span className="flex items-center gap-1 text-up">
                                    <Check className="size-3.5" />
                                    {t('studio.valid')}
                                </span>
                            ) : (
                                <span className="flex items-start gap-1 text-down">
                                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                                    <span>
                                        {describeFormulaError(checked.error, lang)}
                                        {errorColumn != null && (
                                            <span className="num text-faint"> · {t('studio.errorAt').replace('{n}', arDigits(errorColumn, lang))}</span>
                                        )}
                                    </span>
                                </span>
                            )}
                            <span className="num text-faint">
                                {arDigits(text.length, lang)} / {arDigits(MAX_FORMULA_LENGTH, lang)}
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            <input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') void save();
                                }}
                                placeholder={t('studio.namePlaceholder')}
                                aria-label={t('studio.namePlaceholder')}
                                maxLength={28}
                                className="h-8 min-w-0 flex-1 rounded-[7px] bg-page px-2 text-[12px] text-foreground outline-none ring-1 ring-line focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <button
                                type="button"
                                onClick={() => void save()}
                                disabled={busy || !name.trim() || !checked.ok}
                                className="pill h-8 gap-1 px-2.5 text-[12px] disabled:opacity-50"
                            >
                                <Save className="size-3.5" />
                                {t('studio.save')}
                            </button>
                            <button
                                type="button"
                                onClick={apply}
                                disabled={!checked.ok}
                                className="pill is-brand h-8 px-3 text-[12px] font-semibold disabled:opacity-50"
                            >
                                {t('studio.apply')}
                            </button>
                        </div>
                        {notice && (
                            <p className={cn('text-[11px]', notice === 'account' ? 'text-up' : notice === 'failed' || notice === 'invalid' || notice === 'full' || notice === 'name' ? 'text-down' : 'text-faint')}>
                                {noticeText[notice]}
                            </p>
                        )}
                    </div>

                    <aside className="flex min-h-0 flex-col gap-3 border-t border-line p-3 sm:p-4 lg:border-s lg:border-t-0">
                        <section>
                            <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{t('studio.saved')}</h3>
                            <p className="mt-0.5 text-[10px] text-faint">
                                {account === 'checking' ? t('studio.syncing') : account === 'ready' ? t('studio.account') : t('studio.local')}
                                <span className="num"> · {arDigits(saved.length, lang)} / {arDigits(MAX_SAVED_FORMULAS, lang)}</span>
                            </p>
                            <div className="mt-1.5 flex max-h-44 flex-col gap-1 overflow-y-auto">
                                {saved.length === 0 && <p className="text-[11px] text-faint">{t('studio.savedEmpty')}</p>}
                                {saved.map((formula) => (
                                    <div key={formula.id} className="flex items-center gap-1 rounded-[7px] bg-page px-1.5 py-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setText(formula.expression);
                                                setName(formula.name);
                                                setMode('code');
                                                setNotice(null);
                                            }}
                                            title={formula.expression}
                                            className="min-w-0 flex-1 text-start"
                                        >
                                            <span className="block truncate text-[11.5px] font-medium text-foreground">{formula.name}</span>
                                            <span className="mono block truncate text-[10px] text-faint" dir="ltr">{formula.expression}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void remove(formula.id)}
                                            aria-label={`${t('studio.delete')} ${formula.name}`}
                                            title={t('studio.delete')}
                                            className="icon-btn is-danger shrink-0"
                                        >
                                            <Trash2 />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="min-h-0">
                            <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{t('studio.functions')}</h3>
                            <p className="mt-0.5 text-[10px] text-faint">{t('studio.insertHint')}</p>
                            <div className="mt-1.5 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                                {FORMULA_FUNCTIONS.map((fn) => (
                                    <button
                                        key={fn.name}
                                        type="button"
                                        onClick={() => insert(`${fn.name}()`)}
                                        title={lang === 'ar' ? AR_FUNCTION_HELP[fn.name] : fn.help}
                                        className="rounded-[6px] px-1.5 py-1 text-start hover:bg-page"
                                    >
                                        <span className="mono block text-[11px] text-foreground" dir="ltr">{fn.signature}</span>
                                        <span className="block text-[10px] leading-snug text-faint">
                                            {lang === 'ar' ? AR_FUNCTION_HELP[fn.name] : fn.help}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section>
                            <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{t('studio.series')}</h3>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                                {[...FORMULA_SERIES, ...FORMULA_CONSTANTS].map((series) => (
                                    <button
                                        key={series}
                                        type="button"
                                        onClick={() => insert(series)}
                                        title={AR_SERIES_HELP[series]}
                                        className="pill mono h-6 px-1.5 text-[10.5px]"
                                    >
                                        {series}
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section>
                            <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{t('studio.examples')}</h3>
                            <div className="mt-1.5 flex flex-col gap-0.5">
                                {FORMULA_EXAMPLES.map((example) => (
                                    <button
                                        key={example}
                                        type="button"
                                        onClick={() => {
                                            setText(example);
                                            setMode('code');
                                            setNotice(null);
                                        }}
                                        title={example}
                                        className="mono truncate rounded-[6px] px-1.5 py-1 text-start text-[10.5px] text-faint hover:bg-page hover:text-foreground"
                                        dir="ltr"
                                    >
                                        {example}
                                    </button>
                                ))}
                            </div>
                        </section>
                    </aside>
                </div>
            </div>
        </div>
    );
}

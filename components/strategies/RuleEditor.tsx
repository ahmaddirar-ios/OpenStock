'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Check, Code2, ListTree, Plus, Trash2 } from 'lucide-react';
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
} from '@/lib/formula/builder';
import { MAX_FORMULA_LENGTH } from '@/lib/chart/studies';
import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// One rule, two ways to write it: the code editor and the visual builder, both writing the same
// string. The strategy studio owns the string; this component only edits it, so a rule typed by
// hand and a rule clicked together are the same thing to the engine.

type Props = {
    lang: Lang;
    label: string;
    value: string;
    onChange: (next: string) => void;
    /** The parser's message, already localised, or null when the rule is valid. */
    error: string | null;
    /** Character offset of the error inside the substituted rule, when the parser gave one. */
    errorPosition?: number | null;
    /** Parameter names, offered as `{name}` chips so a rule can be parameterised without typing. */
    paramKeys: string[];
    hint?: string;
};

type Mode = 'code' | 'builder';

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

export default function RuleEditor({ lang, label, value, onChange, error, errorPosition, paramKeys, hint }: Props) {
    const t = (key: StringKey) => tx(lang, key);
    const [mode, setMode] = useState<Mode>('code');
    const [group, setGroup] = useState<BuilderGroup>(emptyBuilderGroup);
    const [unreadable, setUnreadable] = useState(false);

    const lines = useMemo(() => value.split('\n'), [value]);
    const errorLine = useMemo(() => {
        if (error == null || typeof errorPosition !== 'number') return null;
        return value.slice(0, errorPosition).split('\n').length;
    }, [error, errorPosition, value]);

    const switchMode = (next: Mode) => {
        if (next === 'builder') {
            const parsed = parseBuilder(value, paramKeys);
            if (parsed) {
                setGroup(parsed);
                setUnreadable(false);
            } else {
                setUnreadable(true);
            }
        }
        setMode(next);
    };

    const updateGroup = (next: BuilderGroup) => {
        setGroup(next);
        setUnreadable(false);
        onChange(buildExpression(next));
    };

    const updateCondition = (index: number, patch: Partial<BuilderCondition>) => {
        updateGroup({
            ...group,
            conditions: group.conditions.map((condition, i) => (i === index ? { ...condition, ...patch } : condition)),
        });
    };

    return (
        <section className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</h3>
                <div className="flex rounded-[8px] bg-page p-0.5" role="tablist" aria-label={label}>
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
            </div>

            {mode === 'code' ? (
                <div className="flex overflow-hidden rounded-[10px] bg-page ring-1 ring-line focus-within:ring-2 focus-within:ring-ring">
                    <div aria-hidden="true" className="mono num w-8 shrink-0 select-none border-e border-line bg-card/40 py-2 text-end text-[10.5px] leading-5 text-faint">
                        {lines.map((_, index) => (
                            <div key={index} className={cn('pe-1', errorLine === index + 1 && 'bg-down/15 font-semibold text-down')}>
                                {index + 1}
                            </div>
                        ))}
                    </div>
                    <textarea
                        value={value}
                        onChange={(event) => onChange(event.target.value.slice(0, MAX_FORMULA_LENGTH))}
                        maxLength={MAX_FORMULA_LENGTH}
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        wrap="off"
                        dir="ltr"
                        rows={3}
                        aria-label={label}
                        aria-invalid={error != null}
                        className="mono min-h-[4.5rem] w-full min-w-0 flex-1 resize-y bg-transparent px-2 py-2 text-[12px] leading-5 text-foreground outline-none"
                    />
                </div>
            ) : (
                <div className="flex flex-col gap-2 rounded-[10px] bg-page p-2 ring-1 ring-line">
                    {unreadable ? (
                        <div>
                            <p className="text-[11.5px] leading-relaxed text-faint">{t('studio.builderUnreadable')}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <button type="button" onClick={() => switchMode('code')} className="pill h-7 px-2.5 text-[11px]">
                                    {t('studio.code')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateGroup({ join: 'and', conditions: [defaultBuilderCondition()] })}
                                    className="pill is-brand h-7 px-2.5 text-[11px]"
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
                                        className="h-7 rounded-[6px] bg-card px-1.5 text-[11.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    >
                                        <option value="and">{t('studio.joinAnd')}</option>
                                        <option value="or">{t('studio.joinOr')}</option>
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => updateGroup({ ...group, conditions: [...group.conditions, defaultBuilderCondition()] })}
                                    disabled={group.conditions.length >= MAX_BUILDER_CONDITIONS}
                                    className="pill h-7 gap-1 px-2.5 text-[11px] disabled:opacity-50"
                                >
                                    <Plus className="size-3" />
                                    {t('studio.addCondition')}
                                </button>
                            </div>

                            {group.conditions.length === 0 && (
                                <p className="text-[11.5px] text-faint">{t('studio.builderEmpty')}</p>
                            )}

                            {group.conditions.map((condition, index) => (
                                <div key={index} className="rounded-[8px] bg-card p-2 ring-1 ring-line">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                        <OperandEditor
                                            operand={condition.left}
                                            onChange={(left) => updateCondition(index, { left })}
                                            lang={lang}
                                            label={t('studio.left')}
                                            paramKeys={paramKeys}
                                        />
                                        <div className="flex flex-col gap-1 sm:w-32">
                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">{t('studio.operator')}</span>
                                            <select
                                                value={condition.op}
                                                onChange={(event) => updateCondition(index, { op: event.target.value as BuilderOperator })}
                                                aria-label={t('studio.operator')}
                                                className="h-7 rounded-[6px] bg-page px-1.5 text-[11.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            >
                                                {BUILDER_OPERATORS.map((operator) => (
                                                    <option key={operator} value={operator}>{t(OPERATOR_LABEL[operator])}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <OperandEditor
                                            operand={condition.right}
                                            onChange={(right) => updateCondition(index, { right })}
                                            lang={lang}
                                            label={t('studio.right')}
                                            paramKeys={paramKeys}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => updateGroup({ ...group, conditions: group.conditions.filter((_, i) => i !== index) })}
                                            aria-label={t('studio.removeCondition')}
                                            title={t('studio.removeCondition')}
                                            className="icon-btn is-danger shrink-0 self-end"
                                        >
                                            <Trash2 />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px]">
                {error == null ? (
                    <span className="flex items-center gap-1 text-up">
                        <Check className="size-3" />
                        {t('studio.valid')}
                    </span>
                ) : (
                    <span className="flex items-start gap-1 text-down">
                        <AlertCircle className="mt-0.5 size-3 shrink-0" />
                        <span>
                            {error}
                            {errorLine != null && (
                                <span className="num text-faint"> · {t('studio.errorAt').replace('{n}', arDigits(errorLine, lang))}</span>
                            )}
                        </span>
                    </span>
                )}
                {paramKeys.length > 0 && (
                    <span className="flex flex-wrap items-center gap-1">
                        {paramKeys.map((key) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => onChange(`${value}{${key}}`)}
                                title={`{${key}}`}
                                className="pill mono h-5 px-1.5 text-[10px]"
                            >
                                {`{${key}}`}
                            </button>
                        ))}
                    </span>
                )}
            </div>
            {hint && <p className="text-[10.5px] leading-snug text-faint">{hint}</p>}
        </section>
    );
}

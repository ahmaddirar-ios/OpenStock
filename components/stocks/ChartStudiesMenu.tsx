'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Maximize2, Plus, Search, X } from 'lucide-react';
import { MAX_FORMULA_LENGTH, MAX_STUDIES, STUDIES, STUDY_COLOR_SOURCES, STUDY_COLOR_TOKENS, STUDY_IDS, STUDY_LINE_DASHES, STUDY_WIDTHS, defaultStudy, describeStudy, studiesChoice, studiesParam, studiesText, studyLineStyle, studyLines, studyWidth, type StudyConfig, type StudyId, type StudyLineStyle } from '@/lib/chart-studies';
import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { checkFormula, describeFormulaError } from '@/lib/formula';
import { addSavedFormula, loadSavedFormulas, removeSavedFormula, saveSavedFormulas, type SavedFormula } from '@/lib/formula-library';
import FormulaStudio from '@/components/stocks/FormulaStudio';

// The indicators menu: search a study, add it, tune its parameters, remove it. It owns no state of
// its own beyond what is being typed — the list belongs to the page (and through it, the browser),
// so the same menu on /charts and on the symbol page edits the same list.

type Props = {
    lang: Lang;
    studies: StudyConfig[];
    onChange: (next: StudyConfig[]) => void;
    className?: string;
};

export default function ChartStudiesMenu({ lang, studies, onChange, className }: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    // Text being typed in a parameter box, kept per input so the box shows exactly what was typed
    // while the chart already follows the last usable number. A draft is dropped on blur, so the box
    // falls back to the clamped value that was actually applied.
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    // The shelf of formulas this browser keeps: written once, applied to any chart after that.
    const [savedFormulas, setSavedFormulas] = useState<SavedFormula[]>([]);
    const [formulaName, setFormulaName] = useState('');
    // The index of the formula study whose studio is open; null when the studio is closed.
    const [studioIndex, setStudioIndex] = useState<number | null>(null);

    useEffect(() => {
        setSavedFormulas(loadSavedFormulas());
    }, []);
    const box = useRef<HTMLDivElement>(null);
    const t = (key: StringKey) => tx(lang, key);

    useEffect(() => {
        if (!open) return;
        const dismiss = () => {
            setOpen(false);
            setDrafts({});
        };
        const onDown = (event: MouseEvent) => {
            // The studio is a fixed panel outside this dropdown; a click in it must not close the menu
            // that owns it, or the panel unmounts the moment it is used.
            if (studioIndex !== null) return;
            if (box.current && !box.current.contains(event.target as Node)) dismiss();
        };
        const onKey = (event: KeyboardEvent) => {
            if (studioIndex === null && event.key === 'Escape') dismiss();
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, studioIndex]);

    const add = (id: StudyId) => {
        if (studies.length >= MAX_STUDIES) return;
        onChange([...studies, defaultStudy(id)]);
    };

    const remove = (index: number) => {
        setDrafts({});
        onChange(studies.filter((_, i) => i !== index));
    };

    /**
     * Applies a parameter the moment the typed text is usable, so the chart never waits for a blur
     * that may not arrive (closing the panel by clicking away unmounts the input). A half-typed
     * "1" therefore keeps its draft and applies nothing until it reads as a number.
     */
    const apply = (index: number, key: string, min: number, max: number, raw: string) => {
        setDrafts((current) => ({ ...current, [`${index}:${key}`]: raw }));
        if (raw.trim() === '') return;
        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        const clamped = Math.min(max, Math.max(min, value));
        onChange(
            studies.map((study, i) =>
                i === index ? { ...study, params: { ...study.params, [key]: clamped } } : study,
            ),
        );
    };

    /**
     * Applies a formula the moment it parses, so the chart follows the typing and a half-written
     * expression is simply not applied yet. The box keeps the text either way.
     */
    const setText = (index: number, key: string, raw: string) => {
        const next = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_FORMULA_LENGTH);
        setDrafts((current) => ({ ...current, [`${index}:${key}`]: next }));
        if (!next || !checkFormula(next).ok) return;
        onChange(studies.map((study, i) => (i === index ? { ...study, params: { ...study.params, [key]: next } } : study)));
    };

    /** Applies a whole expression at once, as clicking a saved formula does. */
    const applyText = (index: number, key: string, expression: string) => {
        setDrafts((current) => {
            const next = { ...current };
            delete next[`${index}:${key}`];
            return next;
        });
        setText(index, key, expression);
    };

    /** Picks a named parameter (a source): a select, so there is no half-typed state to keep. */
    const choose = (index: number, key: string, value: string) => {
        onChange(
            studies.map((study, i) =>
                i === index ? { ...study, params: { ...study.params, [key]: value } } : study,
            ),
        );
    };

    /** Styles one plot of a study: colour and dash are per line, so a band keeps its meaning. */
    const styleLine = (index: number, key: string, patch: StudyLineStyle) => {
        onChange(
            studies.map((study, i) =>
                i === index
                    ? { ...study, lines: { ...study.lines, [key]: { ...study.lines?.[key], ...patch } } }
                    : study,
            ),
        );
    };

    /** Restyles one study: the whole card keeps its place, only the style changes. */
    const restyle = (index: number, patch: Pick<StudyConfig, 'color' | 'width'>) => {
        onChange(studies.map((study, i) => (i === index ? { ...study, ...patch } : study)));
    };

    /** Drops the draft so the box shows the value that was actually applied. */
    const settle = (index: number, key: string) => {
        setDrafts((current) => {
            const next = { ...current };
            delete next[`${index}:${key}`];
            return next;
        });
    };

    const close = () => {
        setOpen(false);
        setDrafts({});
    };


    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return STUDY_IDS;
        return STUDY_IDS.filter((id) => {
            const label = tx(lang, STUDIES[id].label).toLowerCase();
            return label.includes(needle) || id.includes(needle);
        });
    }, [query, lang]);

    return (
        <div ref={box} className={cn('relative', className)}>
            <button
                type="button"
                onClick={() => (open ? close() : setOpen(true))}
                aria-expanded={open}
                aria-haspopup="dialog"
                className={cn('pill h-7 gap-1.5 px-2.5 text-[12px]', studies.length > 0 && 'is-up')}
            >
                {t('chart.studies')}
                {studies.length > 0 && <span className="num text-faint">{arDigits(studies.length, lang)}</span>}
                <ChevronDown className="size-3" />
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label={t('chart.studies')}
                    className="absolute end-0 top-full z-50 mt-1 w-80 rounded-[12px] bg-card p-2 text-start shadow-[0_18px_50px_rgba(0,0,0,0.45)] ring-1 ring-line"
                >
                    <label className="flex items-center gap-1.5 rounded-[8px] bg-page px-2 py-1.5">
                        <Search className="size-3.5 shrink-0 text-faint" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={t('study.search')}
                            aria-label={t('study.search')}
                            className="w-full bg-transparent text-[12px] outline-none"
                        />
                    </label>

                    <p className="mt-2 flex items-center justify-between px-1 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                        <span>{t('study.active')}</span>
                        <span className="num">{arDigits(studies.length, lang)}</span>
                    </p>
                    <div className="max-h-60 overflow-y-auto">
                        {studies.length === 0 && (
                            <p className="px-1 py-1.5 text-[11.5px] leading-snug text-faint">{t('study.empty')}</p>
                        )}
                        {studies.map((study, index) => {
                            const def = STUDIES[study.id];
                            const name = describeStudy(study, lang);
                            return (
                                <div key={`${index}:${study.id}`} className="rounded-[8px] px-1 py-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11.5px] font-medium">{name}</span>
                                        <button
                                            type="button"
                                            onClick={() => remove(index)}
                                            aria-label={t('study.remove').replace('{name}', name)}
                                            className="text-faint transition-colors hover:text-down"
                                        >
                                            <X className="size-3.5" />
                                        </button>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-[10.5px] text-faint">
                                        <span>{t('study.width')}</span>
                                        <div
                                            role="group"
                                            aria-label={t('study.width')}
                                            className="flex items-center gap-0.5"
                                        >
                                            {STUDY_WIDTHS.map((step) => {
                                                const active = studyWidth(study) === step;
                                                return (
                                                    <button
                                                        key={step}
                                                        type="button"
                                                        onClick={() => restyle(index, { width: step })}
                                                        aria-pressed={active}
                                                        aria-label={`${t('study.width')} ${arDigits(step, lang)}`}
                                                        className={cn(
                                                            'num rounded-[5px] px-1 py-px text-[10.5px] transition-colors',
                                                            active
                                                                ? 'bg-hover/60 text-foreground'
                                                                : 'hover:bg-hover/30',
                                                        )}
                                                    >
                                                        {arDigits(step, lang)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="mt-1 flex flex-col gap-0.5">
                                        {/* A profile is drawn as bars, not lines: it has nothing to
                                            recolour per plot, and an empty list is the honest rendering. */}
                                        {studyLines(study).map((line) => {
                                            const style = studyLineStyle(study, line);
                                            return (
                                                <div key={line.key} className="flex items-center gap-1.5 text-[10.5px] text-faint">
                                                    <span aria-hidden="true" className="w-6 shrink-0 text-faint">
                                                        {studyLines(study).length > 1 ? line.short : t(line.name)}
                                                    </span>
                                                    <div
                                                        role="group"
                                                        aria-label={`${t('study.colour')} ${t(line.name)}`}
                                                        className="flex items-center gap-1"
                                                    >
                                                        {STUDY_COLOR_TOKENS.map((token) => {
                                                            const name = t(`study.colour.${token}`);
                                                            const active = style.color === token;
                                                            return (
                                                                <button
                                                                    key={token}
                                                                    type="button"
                                                                    onClick={() => styleLine(index, line.key, { color: token })}
                                                                    aria-pressed={active}
                                                                    aria-label={`${name} — ${t(line.name)}`}
                                                                    title={name}
                                                                    style={{
                                                                        background: `var(${STUDY_COLOR_SOURCES[token].token})`,
                                                                    }}
                                                                    className={cn(
                                                                        'size-3 rounded-full ring-1 ring-line transition-shadow',
                                                                        active && 'ring-2 ring-foreground',
                                                                    )}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                    <div
                                                        role="group"
                                                        aria-label={`${t('study.dash')} ${t(line.name)}`}
                                                        className="ms-auto flex items-center gap-0.5"
                                                    >
                                                        {STUDY_LINE_DASHES.map((dash) => {
                                                            const active = style.dash === dash;
                                                            return (
                                                                <button
                                                                    key={dash}
                                                                    type="button"
                                                                    onClick={() => styleLine(index, line.key, { dash })}
                                                                    aria-pressed={active}
                                                                    aria-label={`${t(`study.dash.${dash}`)} — ${t(line.name)}`}
                                                                    title={t(`study.dash.${dash}`)}
                                                                    className={cn(
                                                                        'rounded-[5px] px-1 py-px transition-colors',
                                                                        active ? 'bg-hover/60 text-foreground' : 'hover:bg-hover/30',
                                                                    )}
                                                                >
                                                                    <span
                                                                        aria-hidden="true"
                                                                        className="block w-4"
                                                                        style={{
                                                                            borderTop: `2px ${
                                                                                dash === 'dotted' ? 'dotted' : dash === 'dashed' ? 'dashed' : 'solid'
                                                                            } currentColor`,
                                                                        }}
                                                                    />
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {def.params.length > 0 && (
                                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                            {def.params.map((param) => {
                                                if (param.kind === 'text' && param.input === 'date') {
                                                    const shown = drafts[`${index}:${param.key}`] ?? studiesText(study, param.key);
                                                    return (
                                                        <label key={param.key} className="flex items-center gap-1 text-[10.5px] text-faint">
                                                            {t(param.label)}
                                                            <input
                                                                type="date"
                                                                value={shown}
                                                                onChange={(event) => {
                                                                    setDrafts((current) => ({
                                                                        ...current,
                                                                        [`${index}:${param.key}`]: event.target.value,
                                                                    }));
                                                                    // A date is either a date or nothing: an empty box
                                                                    // means "from the first bar", not "ignore me".
                                                                    choose(index, param.key, event.target.value);
                                                                }}
                                                                aria-label={t(param.label)}
                                                                title={param.hint ? t(param.hint) : undefined}
                                                                className="num rounded-[6px] bg-page px-1 py-0.5 text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                            />
                                                        </label>
                                                    );
                                                }
                                                if (param.kind === 'text') {
                                                    const value = studiesText(study, param.key);
                                                    // The box holds the draft while the study holds the last committed
                                                    // expression, and the reason has to be about what the box says: a
                                                    // typo should name itself as it is typed, not after a blur.
                                                    const shown = drafts[`${index}:${param.key}`] ?? value;
                                                    const checked = checkFormula(shown);
                                                    return (
                                                        <div key={param.key} className="flex w-full flex-col gap-0.5 text-[10.5px] text-faint">
                                                            <span className="flex items-center justify-between gap-1">
                                                                <span>{t(param.label)}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setStudioIndex(index)}
                                                                    className="pill h-5 gap-1 px-1.5 text-[10px]"
                                                                >
                                                                    <Maximize2 className="size-2.5" />
                                                                    {t('study.formulaStudio')}
                                                                </button>
                                                            </span>
                                                            <input
                                                                type="text"
                                                                dir="ltr"
                                                                value={shown}
                                                                onChange={(event) => setDrafts((current) => ({ ...current, [`${index}:${param.key}`]: event.target.value }))}
                                                                onBlur={(event) => setText(index, param.key, event.target.value)}
                                                                onKeyDown={(event) => {
                                                                    if (event.key === 'Enter') event.currentTarget.blur();
                                                                }}
                                                                aria-label={t(param.label)}
                                                                aria-invalid={!checked.ok}
                                                                className="mono w-full rounded-[6px] bg-page px-1.5 py-0.5 text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                            />
                                                            <span className={checked.ok ? 'text-faint' : 'text-down'}>
                                                                {checked.ok ? (param.hint ? t(param.hint) : '') : describeFormulaError(checked.error, lang)}
                                                            </span>
                                                            {/* Save the box as a named formula, or apply one already saved. */}
                                                            <span className="mt-0.5 flex items-center gap-1">
                                                                <input
                                                                    type="text"
                                                                    value={formulaName}
                                                                    onChange={(event) => setFormulaName(event.target.value)}
                                                                    placeholder={t('study.formulaName')}
                                                                    aria-label={t('study.formulaName')}
                                                                    className="min-w-0 flex-1 rounded-[6px] bg-page px-1.5 py-0.5 text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const next = addSavedFormula(savedFormulas, formulaName, shown);
                                                                        if (next === savedFormulas) return;
                                                                        setSavedFormulas(next);
                                                                        saveSavedFormulas(next);
                                                                        setFormulaName('');
                                                                    }}
                                                                    disabled={!formulaName.trim()}
                                                                    className="pill h-6 px-2 text-[10.5px] disabled:opacity-50"
                                                                >
                                                                    {t('study.formulaSave')}
                                                                </button>
                                                            </span>
                                                            {savedFormulas.length > 0 && (
                                                                <span className="mt-0.5 flex flex-wrap gap-1">
                                                                    {savedFormulas.map((saved) => (
                                                                        <span key={saved.id} className="inline-flex items-center gap-0.5">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => applyText(index, param.key, saved.expression)}
                                                                                title={saved.expression}
                                                                                className="pill h-6 px-2 text-[10.5px]"
                                                                            >
                                                                                {saved.name}
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                aria-label={`${t('study.formulaDelete')} ${saved.name}`}
                                                                                title={t('study.formulaDelete')}
                                                                                onClick={() => {
                                                                                    const next = removeSavedFormula(savedFormulas, saved.id);
                                                                                    setSavedFormulas(next);
                                                                                    saveSavedFormulas(next);
                                                                                }}
                                                                                className="icon-btn text-down"
                                                                            >
                                                                                <X className="size-3" />
                                                                            </button>
                                                                        </span>
                                                                    ))}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                                if (param.kind === 'choice') {
                                                    return (
                                                        <label
                                                            key={param.key}
                                                            className="flex items-center gap-1 text-[10.5px] text-faint"
                                                        >
                                                            {t(param.label)}
                                                            <select
                                                                value={studiesChoice(study, param.key)}
                                                                onChange={(event) =>
                                                                    choose(index, param.key, event.target.value)
                                                                }
                                                                aria-label={t(param.label)}
                                                                className="num rounded-[6px] bg-page px-1 py-0.5 text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                            >
                                                                {param.choices.map((choice) => (
                                                                    <option key={choice.value} value={choice.value}>
                                                                        {t(choice.label)}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </label>
                                                    );
                                                }
                                                const draftKey = `${index}:${param.key}`;
                                                return (
                                                    <label key={param.key} className="flex items-center gap-1 text-[10.5px] text-faint">
                                                        {t(param.label)}
                                                        <input
                                                            type="number"
                                                            inputMode="numeric"
                                                            min={param.min}
                                                            max={param.max}
                                                            step={param.step}
                                                            value={drafts[draftKey] ?? String(studiesParam(study, param.key))}
                                                            onChange={(event) =>
                                                                apply(index, param.key, param.min, param.max, event.target.value)
                                                            }
                                                            onBlur={() => settle(index, param.key)}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter') event.currentTarget.blur();
                                                            }}
                                                            className="num w-14 rounded-[6px] bg-page px-1 py-0.5 text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                        />
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <p className="mt-2 px-1 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                        {t('study.add')}
                    </p>
                    <div className="max-h-52 overflow-y-auto">
                        {filtered.length === 0 && (
                            <p className="px-1 py-1.5 text-[11.5px] text-faint">
                                {t('study.searchEmpty').replace('{q}', query.trim())}
                            </p>
                        )}
                        {(['overlay', 'oscillator'] as const).map((group) => {
                            const ids = filtered.filter((id) => STUDIES[id].group === group);
                            if (ids.length === 0) return null;
                            return (
                                <div key={group} className="mt-1">
                                    <p className="px-1 text-[10.5px] text-faint">{t(`study.group.${group}`)}</p>
                                    {ids.map((id) => (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => add(id)}
                                            disabled={studies.length >= MAX_STUDIES}
                                            className="flex w-full items-center justify-between rounded-[8px] px-1 py-1 text-[11.5px] transition-colors hover:bg-hover/40 disabled:opacity-40"
                                        >
                                            <span>{tx(lang, STUDIES[id].label)}</span>
                                            <Plus className="size-3.5 text-faint" />
                                        </button>
                                    ))}
                                </div>
                            );
                        })}
                    </div>

                    {studies.length >= MAX_STUDIES && (
                        <p className="px-1 pt-1 text-[10.5px] text-warn">
                            {t('study.full').replace('{n}', arDigits(MAX_STUDIES, lang))}
                        </p>
                    )}
                </div>
            )}

            {studioIndex !== null && studies[studioIndex] && (
                <FormulaStudio
                    lang={lang}
                    open
                    initialExpression={studiesText(studies[studioIndex], 'expression')}
                    onApply={(expression) => applyText(studioIndex, 'expression', expression)}
                    onClose={() => setStudioIndex(null)}
                />
            )}
        </div>
    );
}

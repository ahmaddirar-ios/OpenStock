// A shelf of formulas a trader writes once and reaches for again: "the spread", "range %", "above
// the 50". Stored per browser beside the drawing templates, because a formula is a preference, not
// part of a chart — and the share link is what carries one to someone else.

import { checkFormula } from '@/lib/formula';

export const FORMULA_LIBRARY_KEY = 'openstock-formula-library';

export const MAX_SAVED_FORMULAS = 20;
export const MAX_FORMULA_NAME = 28;

export type SavedFormula = { id: string; name: string; expression: string };

/** Trim and collapse whitespace; an empty result means "no name, nothing to save". */
export const cleanFormulaName = (raw: unknown): string =>
    typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_FORMULA_NAME) : '';

/** Statements are kept on one line, so a saved formula and a typed one are the same string. */
export const cleanExpression = (raw: unknown): string =>
    typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';

/** Parses whatever was stored. Anything malformed is dropped, never thrown. */
export function parseSavedFormulas(raw: string | null): SavedFormula[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const out: SavedFormula[] = [];
        for (const entry of parsed) {
            if (typeof entry !== 'object' || entry === null) continue;
            const candidate = entry as Record<string, unknown>;
            const name = cleanFormulaName(candidate.name);
            const expression = cleanExpression(candidate.expression);
            const id = typeof candidate.id === 'string' && candidate.id ? candidate.id : '';
            if (!name || !id || !expression) continue;
            // A saved formula that no longer parses is a bug in the shelf, not a line to draw.
            if (!checkFormula(expression).ok) continue;
            if (out.some((saved) => saved.name.toLowerCase() === name.toLowerCase())) continue;
            out.push({ id, name, expression });
            if (out.length >= MAX_SAVED_FORMULAS) break;
        }
        return out;
    } catch {
        return [];
    }
}

export const serializeSavedFormulas = (formulas: SavedFormula[]): string => JSON.stringify(formulas);

export function loadSavedFormulas(): SavedFormula[] {
    if (typeof window === 'undefined') return [];
    try {
        return parseSavedFormulas(window.localStorage.getItem(FORMULA_LIBRARY_KEY));
    } catch {
        return [];
    }
}

export function saveSavedFormulas(formulas: SavedFormula[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(FORMULA_LIBRARY_KEY, serializeSavedFormulas(formulas));
    } catch {
        // A full or blocked store must not break the chart; the formula simply is not kept.
    }
}

/**
 * Adds a formula, replacing one with the same name (case-insensitive) so saving "spread" twice is
 * one entry. Returns the list unchanged when the name is empty, the expression does not parse, or
 * the shelf is full.
 */
export function addSavedFormula(
    formulas: SavedFormula[],
    name: string,
    expression: string,
    id = `f${Date.now().toString(36)}`,
): SavedFormula[] {
    const cleanedName = cleanFormulaName(name);
    const cleaned = cleanExpression(expression);
    if (!cleanedName || !cleaned || !checkFormula(cleaned).ok) return formulas;
    const without = formulas.filter((saved) => saved.name.toLowerCase() !== cleanedName.toLowerCase());
    if (without.length >= MAX_SAVED_FORMULAS) return formulas;
    return [...without, { id, name: cleanedName, expression: cleaned }];
}

export const removeSavedFormula = (formulas: SavedFormula[], id: string): SavedFormula[] =>
    formulas.filter((saved) => saved.id !== id);

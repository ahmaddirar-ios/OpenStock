// A shelf of formulas a trader writes once and reaches for again: "the spread", "range %", "above
// the 50". Stored per browser beside the drawing templates, because a formula is a preference, not
// part of a chart — and the account keeps the same shelf so it follows the trader to another device.
// The share link is still what carries one formula to someone else.

import { checkFormula } from '@/lib/formula';

export const FORMULA_LIBRARY_KEY = 'openstock-formula-library';

export const MAX_SAVED_FORMULAS = 50;
export const MAX_FORMULA_NAME = 28;

export type SavedFormula = { id: string; name: string; expression: string; updatedAt?: number };

/** Trim and collapse whitespace; an empty result means "no name, nothing to save". */
export const cleanFormulaName = (raw: unknown): string =>
    typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_FORMULA_NAME) : '';

/** Statements are kept on one line, so a saved formula and a typed one are the same string. */
export const cleanExpression = (raw: unknown): string =>
    typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';

const cleanTimestamp = (raw: unknown): number =>
    typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;

/**
 * The single gate for a shelf, whether it came from localStorage, a server action or a share link.
 * Anything malformed is dropped entry by entry, never thrown and never the whole shelf.
 */
export function normalizeSavedFormulas(input: unknown): SavedFormula[] {
    if (!Array.isArray(input)) return [];
    const out: SavedFormula[] = [];
    for (const entry of input) {
        if (typeof entry !== 'object' || entry === null) continue;
        const candidate = entry as Record<string, unknown>;
        const name = cleanFormulaName(candidate.name);
        const expression = cleanExpression(candidate.expression);
        const id = typeof candidate.id === 'string' && candidate.id ? candidate.id.slice(0, 64) : '';
        if (!name || !id || !expression) continue;
        // A saved formula that no longer parses is a bug in the shelf, not a line to draw.
        if (!checkFormula(expression).ok) continue;
        if (out.some((saved) => saved.name.toLowerCase() === name.toLowerCase())) continue;
        const updatedAt = cleanTimestamp(candidate.updatedAt);
        out.push(updatedAt > 0 ? { id, name, expression, updatedAt } : { id, name, expression });
        if (out.length >= MAX_SAVED_FORMULAS) break;
    }
    return out;
}

/** Parses whatever was stored as JSON. Anything malformed is dropped, never thrown. */
export function parseSavedFormulas(raw: string | null): SavedFormula[] {
    if (!raw) return [];
    try {
        return normalizeSavedFormulas(JSON.parse(raw));
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
    id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    now = Date.now(),
): SavedFormula[] {
    const cleanedName = cleanFormulaName(name);
    const cleaned = cleanExpression(expression);
    if (!cleanedName || !cleaned || !checkFormula(cleaned).ok) return formulas;
    const without = formulas.filter((saved) => saved.name.toLowerCase() !== cleanedName.toLowerCase());
    if (without.length >= MAX_SAVED_FORMULAS) return formulas;
    return [...without, { id, name: cleanedName, expression: cleaned, updatedAt: now }];
}

export const removeSavedFormula = (formulas: SavedFormula[], id: string): SavedFormula[] =>
    formulas.filter((saved) => saved.id !== id);

/**
 * The account and the browser are two copies of one shelf. Newest wins per id, then a formula with
 * the same name is one formula, then the newest first — so opening the studio on a second device
 * shows what was saved on either, without duplicating either.
 */
export function mergeFormulas(local: readonly SavedFormula[], remote: readonly SavedFormula[]): SavedFormula[] {
    const byId = new Map<string, SavedFormula>();
    for (const formula of [...local, ...remote]) {
        const existing = byId.get(formula.id);
        if (!existing || cleanTimestamp(formula.updatedAt) >= cleanTimestamp(existing.updatedAt)) {
            byId.set(formula.id, formula);
        }
    }
    const byName = new Map<string, SavedFormula>();
    for (const formula of byId.values()) {
        const key = formula.name.toLowerCase();
        const existing = byName.get(key);
        if (!existing || cleanTimestamp(formula.updatedAt) >= cleanTimestamp(existing.updatedAt)) {
            byName.set(key, formula);
        }
    }
    return [...byName.values()]
        .sort((a, b) => cleanTimestamp(b.updatedAt) - cleanTimestamp(a.updatedAt) || a.name.localeCompare(b.name))
        .slice(0, MAX_SAVED_FORMULAS);
}

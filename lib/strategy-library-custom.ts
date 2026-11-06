// A shelf of custom strategies, stored per account and mirrored in the browser. A strategy is a
// structured object — rules, parameters, stops, sizing — so unlike a formula it is not a string to
// validate loosely: `lib/custom-strategy.ts` is the single gate, and this shelf only decides which
// entries are worth keeping.

import { checkCustomStrategy, parseCustomStrategy, type CustomStrategy } from '@/lib/custom-strategy';

export const STRATEGY_LIBRARY_KEY = 'openstock-custom-strategies';

export const MAX_SAVED_STRATEGIES = 30;

export type SavedStrategy = { id: string; name: string; strategy: CustomStrategy; updatedAt?: number };

/** Names are display text; the strategy's own name travels inside the object. */
export const cleanStrategyLabel = (raw: unknown): string =>
    typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 40) : '';

const cleanTimestamp = (raw: unknown): number =>
    typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;

/**
 * The single gate for the shelf, whatever its source. A malformed entry is dropped, never thrown,
 * and never takes the rest of the shelf with it.
 */
export function normalizeSavedStrategies(input: unknown): SavedStrategy[] {
    if (!Array.isArray(input)) return [];
    const out: SavedStrategy[] = [];
    for (const entry of input) {
        if (typeof entry !== 'object' || entry === null) continue;
        const candidate = entry as Record<string, unknown>;
        const strategy = parseCustomStrategy(candidate.strategy);
        if (!strategy) continue;
        const id = typeof candidate.id === 'string' && candidate.id ? candidate.id.slice(0, 64) : '';
        if (!id) continue;
        // A saved strategy that no longer parses is a bug in the shelf, not a strategy to run.
        if (!checkCustomStrategy(strategy).ok) continue;
        const name = cleanStrategyLabel(candidate.name) || strategy.name;
        if (out.some((saved) => saved.name.toLowerCase() === name.toLowerCase())) continue;
        const updatedAt = cleanTimestamp(candidate.updatedAt);
        out.push(updatedAt > 0 ? { id, name, strategy, updatedAt } : { id, name, strategy });
        if (out.length >= MAX_SAVED_STRATEGIES) break;
    }
    return out;
}

export function parseSavedStrategies(raw: string | null): SavedStrategy[] {
    if (!raw) return [];
    try {
        return normalizeSavedStrategies(JSON.parse(raw));
    } catch {
        return [];
    }
}

export const serializeSavedStrategies = (strategies: SavedStrategy[]): string => JSON.stringify(strategies);

export function loadSavedStrategies(): SavedStrategy[] {
    if (typeof window === 'undefined') return [];
    try {
        return parseSavedStrategies(window.localStorage.getItem(STRATEGY_LIBRARY_KEY));
    } catch {
        return [];
    }
}

export function storeSavedStrategies(strategies: SavedStrategy[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STRATEGY_LIBRARY_KEY, serializeSavedStrategies(strategies));
    } catch {
        // A full or blocked store must not break the studio; the strategy simply is not kept.
    }
}

/** Adds one, replacing the same name (case-insensitive) so saving twice is one entry. */
export function addSavedStrategy(
    strategies: SavedStrategy[],
    strategy: CustomStrategy,
    id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    now = Date.now(),
): SavedStrategy[] {
    if (!checkCustomStrategy(strategy).ok) return strategies;
    const name = cleanStrategyLabel(strategy.name) || 'Custom strategy';
    const without = strategies.filter((saved) => saved.name.toLowerCase() !== name.toLowerCase());
    if (without.length >= MAX_SAVED_STRATEGIES) return strategies;
    return [...without, { id, name, strategy: { ...strategy, id, name }, updatedAt: now }];
}

export const removeSavedStrategy = (strategies: SavedStrategy[], id: string): SavedStrategy[] =>
    strategies.filter((saved) => saved.id !== id);

/**
 * The account and the browser are two copies of one shelf: newest wins per id, then a strategy with
 * the same name is one strategy, then the newest first.
 */
export function mergeStrategies(local: readonly SavedStrategy[], remote: readonly SavedStrategy[]): SavedStrategy[] {
    const byId = new Map<string, SavedStrategy>();
    for (const saved of [...local, ...remote]) {
        const existing = byId.get(saved.id);
        if (!existing || cleanTimestamp(saved.updatedAt) >= cleanTimestamp(existing.updatedAt)) {
            byId.set(saved.id, saved);
        }
    }
    const byName = new Map<string, SavedStrategy>();
    for (const saved of byId.values()) {
        const key = saved.name.toLowerCase();
        const existing = byName.get(key);
        if (!existing || cleanTimestamp(saved.updatedAt) >= cleanTimestamp(existing.updatedAt)) {
            byName.set(key, saved);
        }
    }
    return [...byName.values()]
        .sort((a, b) => cleanTimestamp(b.updatedAt) - cleanTimestamp(a.updatedAt) || a.name.localeCompare(b.name))
        .slice(0, MAX_SAVED_STRATEGIES);
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    MAX_SAVED_STRATEGIES,
    addSavedStrategy,
    loadSavedStrategies,
    mergeStrategies,
    normalizeSavedStrategies,
    parseSavedStrategies,
    removeSavedStrategy,
    storeSavedStrategies,
    type SavedStrategy,
} from '@/lib/strategy-library-custom';
import type { CustomStrategy } from '@/lib/custom-strategy';

const strategy = (over: Partial<CustomStrategy> = {}): CustomStrategy => ({
    id: 'base',
    name: 'Momentum',
    entry: 'close > sma(close, 20)',
    exit: 'close < sma(close, 20)',
    params: [],
    stopPct: 5,
    targetPct: 0,
    trailingPct: 0,
    riskPct: 0,
    direction: 'long',
    ...over,
});

const saved = (id: string, name: string, updatedAt: number, over: Partial<CustomStrategy> = {}): SavedStrategy => ({
    id,
    name,
    strategy: strategy({ name, ...over }),
    updatedAt,
});

describe('normalizeSavedStrategies', () => {
    it('keeps a well-formed entry', () => {
        const out = normalizeSavedStrategies([saved('a', 'Momentum', 10)]);
        expect(out).toHaveLength(1);
        expect(out[0].name).toBe('Momentum');
        expect(out[0].strategy.stopPct).toBe(5);
    });

    it('drops anything that would not run', () => {
        const out = normalizeSavedStrategies([
            null,
            'nope',
            { id: 'b' },
            { id: 'c', name: 'Broken', strategy: { entry: 'close >', exit: 'close < 1' } },
            { id: '', name: 'No id', strategy: strategy() },
            saved('d', 'Fine', 1),
        ]);
        expect(out.map((entry) => entry.id)).toEqual(['d']);
    });

    it('rejects an unfinished rule even when the shape is right', () => {
        const broken = saved('e', 'Unknown name', 1, { entry: 'close > {missing}' });
        expect(normalizeSavedStrategies([broken])).toHaveLength(0);
    });

    it('dedupes by name and caps the shelf', () => {
        const dupes = normalizeSavedStrategies([saved('a', 'Momentum', 1), saved('b', 'momentum', 2)]);
        expect(dupes).toHaveLength(1);

        const many = Array.from({ length: MAX_SAVED_STRATEGIES + 5 }, (_, i) => saved(`s${i}`, `Plan ${i}`, i));
        expect(normalizeSavedStrategies(many)).toHaveLength(MAX_SAVED_STRATEGIES);
        expect(normalizeSavedStrategies(undefined)).toEqual([]);
    });
});

describe('storage', () => {
    it('round-trips through JSON and survives garbage', () => {
        const list = [saved('a', 'Momentum', 10)];
        expect(parseSavedStrategies(JSON.stringify(list))).toHaveLength(1);
        expect(parseSavedStrategies('{not json')).toEqual([]);
        expect(parseSavedStrategies(null)).toEqual([]);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads and writes localStorage, and never throws when it is blocked', () => {
        const store = new Map<string, string>();
        const storage = {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
            removeItem: (key: string) => void store.delete(key),
            clear: () => store.clear(),
            key: (index: number) => [...store.keys()][index] ?? null,
            get length() {
                return store.size;
            },
        };
        vi.stubGlobal('window', { localStorage: storage });

        expect(loadSavedStrategies()).toEqual([]);
        storeSavedStrategies([saved('a', 'Momentum', 10)]);
        expect(loadSavedStrategies().map((entry) => entry.id)).toEqual(['a']);

        vi.stubGlobal('window', {
            localStorage: {
                ...storage,
                setItem: () => {
                    throw new Error('quota');
                },
            },
        });
        expect(() => storeSavedStrategies([saved('b', 'Other', 1)])).not.toThrow();
    });
});

describe('shelf edits', () => {
    it('adds, replaces a same-named strategy, and refuses one that does not parse', () => {
        const first = addSavedStrategy([], strategy({ name: 'Breakout' }), 'x1', 100);
        expect(first).toHaveLength(1);
        expect(first[0].strategy.name).toBe('Breakout');
        expect(first[0].updatedAt).toBe(100);

        const replaced = addSavedStrategy(first, strategy({ name: 'breakout', stopPct: 9 }), 'x2', 200);
        expect(replaced).toHaveLength(1);
        expect(replaced[0].id).toBe('x2');
        expect(replaced[0].strategy.stopPct).toBe(9);

        expect(addSavedStrategy(first, strategy({ entry: 'close >' }), 'x3', 300)).toEqual(first);
    });

    it('removes by id and stops at the cap', () => {
        const list = [saved('a', 'One', 1), saved('b', 'Two', 2)];
        expect(removeSavedStrategy(list, 'a').map((entry) => entry.id)).toEqual(['b']);

        let full: SavedStrategy[] = [];
        for (let i = 0; i < MAX_SAVED_STRATEGIES; i += 1) {
            full = addSavedStrategy(full, strategy({ name: `Plan ${i}` }), `s${i}`, i + 1);
        }
        expect(full).toHaveLength(MAX_SAVED_STRATEGIES);
        expect(addSavedStrategy(full, strategy({ name: 'One more' }), 'extra', 999)).toHaveLength(MAX_SAVED_STRATEGIES);
    });
});

describe('mergeStrategies', () => {
    it('keeps the newest copy of each id and the newest of each name', () => {
        const local = [saved('a', 'Momentum', 10), saved('b', 'Breakout', 50)];
        const remote = [saved('a', 'Momentum', 20, { stopPct: 8 }), saved('c', 'Expired name', 5)];
        const merged = mergeStrategies(local, remote);
        expect(merged.map((entry) => entry.id).sort()).toEqual(['a', 'b', 'c']);
        expect(merged.find((entry) => entry.id === 'a')!.strategy.stopPct).toBe(8);
        expect(merged[0].id).toBe('b');
    });

    it('collapses a name that exists under two ids', () => {
        const merged = mergeStrategies([saved('a', 'Momentum', 10)], [saved('b', 'momentum', 30)]);
        expect(merged).toHaveLength(1);
        expect(merged[0].id).toBe('b');
    });

    it('caps the result', () => {
        const local = Array.from({ length: 20 }, (_, i) => saved(`l${i}`, `L ${i}`, i));
        const remote = Array.from({ length: 20 }, (_, i) => saved(`r${i}`, `R ${i}`, i));
        expect(mergeStrategies(local, remote)).toHaveLength(MAX_SAVED_STRATEGIES);
    });
});

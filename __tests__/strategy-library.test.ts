import { describe, expect, it } from 'vitest';
import { STRATEGY_IDS } from '@/lib/strategies';
import { CATEGORY_KEYS, STRATEGY_LIBRARY, strategyById } from '@/lib/strategy-library';

describe('strategy library', () => {
    it('documents every strategy the engine knows', () => {
        expect(STRATEGY_LIBRARY.map((doc) => doc.id).sort()).toEqual([...STRATEGY_IDS].sort());
    });

    it('speaks both languages everywhere', () => {
        for (const doc of STRATEGY_LIBRARY) {
            for (const key of ['name', 'nameAr', 'idea', 'ideaAr', 'entry', 'entryAr', 'exit', 'exitAr', 'risk', 'riskAr', 'failure', 'failureAr'] as const) {
                expect(doc[key].trim().length, `${doc.id}.${key}`).toBeGreaterThan(10);
            }
            expect(doc.timeframe.en.trim()).not.toBe('');
            expect(doc.timeframe.ar.trim()).not.toBe('');
        }
    });

    it('shows a formula for every strategy', () => {
        for (const doc of STRATEGY_LIBRARY) {
            expect(doc.formula.length, doc.id).toBeGreaterThan(1);
            for (const line of doc.formula) expect(line.trim()).not.toBe('');
        }
    });

    it('keeps every default inside its own field bounds', () => {
        for (const doc of STRATEGY_LIBRARY) {
            for (const field of doc.paramFields) {
                const value = doc.defaults[field.key];
                expect(Number.isFinite(value), `${doc.id}.${field.key}`).toBe(true);
                expect(value, `${doc.id}.${field.key}`).toBeGreaterThanOrEqual(field.min);
                expect(value, `${doc.id}.${field.key}`).toBeLessThanOrEqual(field.max);
            }
            for (const key of Object.keys(doc.defaults)) {
                expect(doc.paramFields.some((field) => field.key === key), `${doc.id}.${key} field`).toBe(true);
            }
        }
    });

    it('gives every strategy one of the four categories', () => {
        for (const doc of STRATEGY_LIBRARY) expect(CATEGORY_KEYS).toContain(doc.category);
    });

    it('finds a strategy by id and nothing for junk', () => {
        expect(strategyById('sma-cross')?.nameAr).toContain('تقاطع');
        expect(strategyById('nope')).toBeUndefined();
    });
});

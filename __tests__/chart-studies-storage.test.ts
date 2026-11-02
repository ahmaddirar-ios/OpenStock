import { describe, expect, it } from 'vitest';
import { STUDIES_KEY, readStudies, writeStudies } from '@/lib/chart-studies-storage';
import { defaultStudy, type StudyConfig } from '@/lib/chart-studies';

const memory = (initial: Record<string, string> = {}) => {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
            map.set(key, value);
        },
        raw: map,
    };
};

const broken = {
    getItem: () => {
        throw new Error('blocked');
    },
    setItem: () => {
        throw new Error('quota');
    },
};

describe('study storage', () => {
    it('starts empty rather than failing on a key that was never written', () => {
        expect(readStudies(memory())).toEqual([]);
    });

    it('round-trips the list', () => {
        const storage = memory();
        const studies: StudyConfig[] = [defaultStudy('sma'), defaultStudy('bb')];
        studies[1].params.stdDev = 2.5;
        writeStudies(storage, studies);
        expect(storage.raw.get(STUDIES_KEY)).toContain('"v":1');
        expect(readStudies(storage)).toEqual(studies);
    });

    it('reads empty instead of throwing on junk or a stale version', () => {
        expect(readStudies(memory({ [STUDIES_KEY]: '{not json' }))).toEqual([]);
        expect(readStudies(memory({ [STUDIES_KEY]: '{"v":2,"studies":[]}' }))).toEqual([]);
        expect(readStudies(memory({ [STUDIES_KEY]: '[]' }))).toEqual([]);
    });

    it('survives a storage that refuses both directions (private mode)', () => {
        expect(readStudies(broken)).toEqual([]);
        expect(() => writeStudies(broken, [defaultStudy('rsi')])).not.toThrow();
    });
});

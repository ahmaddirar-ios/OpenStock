// @vitest-environment jsdom
// A chart setup (the drawings and the studies of one symbol) now lives in two places: this browser,
// which is instant and works signed out, and the account, which follows the trader to another device.
// These tests pin the rules that decide who wins, because getting that wrong loses a trader's work.
import { describe, expect, it } from 'vitest';
import { MAX_DRAWINGS, type ShapeTool } from '@/lib/chart/drawings';
import { MAX_STUDIES } from '@/lib/chart/studies';
import {
    SETUP_VERSION,
    mergeSetup,
    parseChartSetup,
    readSetupPending,
    setupDecision,
    writeSetupPending,
    type ChartSetup,
} from '@/lib/chart/setup';

const drawing = (id: string, tool: ShapeTool = 'trend') => ({
    id,
    tool,
    points: [{ time: 1000, price: 10 }, { time: 2000, price: 12 }],
});
const setup = (drawings: ReturnType<typeof drawing>[], studies: unknown[] = []): ChartSetup =>
    ({ drawings, studies }) as unknown as ChartSetup;

describe('who wins when a setup is in two places', () => {
    it('does nothing at all when nobody is signed in', () => {
        // A guest keeps today's behaviour exactly: the browser is the only copy.
        for (const hasRemote of [true, false]) {
            for (const hasLocal of [true, false]) {
                for (const localPending of [true, false]) {
                    expect(setupDecision({ signedIn: false, hasRemote, hasLocal, localPending })).toBe('idle');
                }
            }
        }
    });

    it('merges when the account has a copy', () => {
        expect(setupDecision({ signedIn: true, hasRemote: true, hasLocal: true, localPending: false })).toBe('merge');
        expect(setupDecision({ signedIn: true, hasRemote: true, hasLocal: false, localPending: false })).toBe('merge');
    });

    it('pushes the browser copy up when the account has none (the one-time migration)', () => {
        expect(setupDecision({ signedIn: true, hasRemote: false, hasLocal: true, localPending: false })).toBe('push');
        expect(setupDecision({ signedIn: true, hasRemote: false, hasLocal: false, localPending: false })).toBe('idle');
    });

    it('pushes, never clobbers, when this browser still holds an unsent save', () => {
        // The trader drew offline: their browser is newer than the account until it has been sent.
        expect(setupDecision({ signedIn: true, hasRemote: true, hasLocal: true, localPending: true })).toBe('push');
        // Nothing local to send, so the account's copy is still the one to read.
        expect(setupDecision({ signedIn: true, hasRemote: true, hasLocal: false, localPending: true })).toBe('merge');
    });
});

describe('merging the browser and the account', () => {
    it('keeps every drawing from both sides', () => {
        const merged = mergeSetup(setup([drawing('a'), drawing('b')]), setup([drawing('c')]));
        expect(merged.drawings.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    });

    it('lets the account win when both sides hold the same drawing', () => {
        const mine = { ...drawing('a'), color: 'gold' as const };
        const theirs = { ...drawing('a'), color: 'cyan' as const };
        const merged = mergeSetup(setup([mine]), setup([theirs]));
        expect(merged.drawings).toHaveLength(1);
        expect(merged.drawings[0].color).toBe('cyan');
    });

    it('keeps both study lists, one entry per study', () => {
        const merged = mergeSetup(
            setup([], [{ id: 'sma', params: { length: 20 } }, { id: 'rsi', params: { length: 14 } }]),
            setup([], [{ id: 'sma', params: { length: 50 } }, { id: 'macd', params: {} }]),
        );
        expect(merged.studies.map((s) => s.id)).toEqual(['sma', 'rsi', 'macd']);
        expect(merged.studies.find((s) => s.id === 'sma')?.params).toEqual({ length: 50 });
    });

    it('never grows past the caps the chart enforces', () => {
        const many = Array.from({ length: MAX_DRAWINGS + 20 }, (_, i) => drawing(`d${i}`));
        expect(mergeSetup(setup([], []), setup(many)).drawings).toHaveLength(MAX_DRAWINGS);
        const lots = Array.from({ length: MAX_STUDIES + 5 }, (_, i) => ({ id: 'sma', params: { length: i + 1 } }));
        expect(mergeSetup(setup([], []), setup([], lots)).studies.length).toBeLessThanOrEqual(MAX_STUDIES);
    });
});

describe('a setup that arrives from the server', () => {
    it('keeps the drawings and drops anything malformed', () => {
        const parsed = parseChartSetup({
            v: SETUP_VERSION,
            drawings: [drawing('a'), { id: 'x', tool: 'not-a-tool', points: [] }, { nothing: true }, drawing('b', 'rectangle')],
            studies: [{ id: 'sma', params: { length: 20 } }, { id: 'not-a-study' }, 7],
        });
        expect(parsed?.drawings.map((d) => d.id)).toEqual(['a', 'b']);
        expect(parsed?.studies.map((s) => s.id)).toEqual(['sma']);
    });

    it('refuses a payload it does not know', () => {
        expect(parseChartSetup(null)).toBeNull();
        expect(parseChartSetup('a string')).toBeNull();
        expect(parseChartSetup({ drawings: [], studies: [] })).toBeNull();
        expect(parseChartSetup({ v: SETUP_VERSION + 1, drawings: [], studies: [] })).toBeNull();
    });

    it('accepts an empty setup, which is how a symbol with nothing saved answers', () => {
        const parsed = parseChartSetup({ v: SETUP_VERSION, drawings: [], studies: [] });
        expect(parsed).toEqual({ drawings: [], studies: [] });
    });
});

describe('the mark that says a save never reached the account', () => {
    const store = new Map<string, string>();
    const storage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, String(value)),
        removeItem: (key: string) => void store.delete(key),
    };

    it('remembers a symbol whose save failed, and forgets it once sent', () => {
        expect(readSetupPending(storage, '2222.SR')).toBe(false);
        writeSetupPending(storage, '2222.SR', true);
        expect(readSetupPending(storage, '2222.SR')).toBe(true);
        // The mark is per symbol: another chart is not implicated.
        expect(readSetupPending(storage, '1120.SR')).toBe(false);
        writeSetupPending(storage, '2222.SR', false);
        expect(readSetupPending(storage, '2222.SR')).toBe(false);
    });

    it('never throws when storage is unavailable', () => {
        const broken = {
            getItem: () => {
                throw new Error('private mode');
            },
            setItem: () => {
                throw new Error('quota');
            },
        };
        expect(readSetupPending(broken, '2222.SR')).toBe(false);
        expect(() => writeSetupPending(broken, '2222.SR', true)).not.toThrow();
    });
});

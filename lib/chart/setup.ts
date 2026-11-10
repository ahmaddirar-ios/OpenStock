// The chart setup — the drawings and the studies of one symbol — lives in two places: this browser
// (instant, works signed out) and the trader's account (follows them to another device). Everything in
// this file is the policy between the two, kept out of the components so it can be proved without a
// browser or a database: who wins on load, how the two are merged, and what a payload from the server
// is allowed to contain.

import { MAX_DRAWINGS, parseDrawingList, type Drawing } from '@/lib/chart/drawings';
import { MAX_STUDIES, parseStudies, type StudyConfig } from '@/lib/chart/studies';

/** The shape the account stores. Bumped whenever either list's own format changes. */
export const SETUP_VERSION = 1;

export type ChartSetup = {
    drawings: Drawing[];
    studies: StudyConfig[];
};

export const emptySetup = (): ChartSetup => ({ drawings: [], studies: [] });

/** What the trader has in this browser right now, in the shape the account wants. */
export const setupFromLocal = (drawings: Drawing[], studies: StudyConfig[]): ChartSetup => ({ drawings, studies });

export type SetupDecision = 'merge' | 'push' | 'idle';

/**
 * What to do when the chart opens. Signed out, the browser is the only copy and nothing moves. Signed in:
 * an account copy is merged in (never replaces: the merge keeps both sides' work), the browser's copy is
 * pushed up when the account has none — the one-time migration for every chart saved before today — and a
 * browser that still holds a save it could not send is pushed instead, so an offline session cannot be
 * overwritten by an older copy from the account.
 */
export function setupDecision(input: { signedIn: boolean; hasRemote: boolean; hasLocal: boolean; localPending: boolean }): SetupDecision {
    if (!input.signedIn) return 'idle';
    if (input.localPending && input.hasLocal) return 'push';
    if (input.hasRemote) return 'merge';
    if (input.hasLocal) return 'push';
    return 'idle';
}

/** Studies are one per id: the account's wins, the rest of both lists is kept, and the cap holds. */
export function mergeStudies(current: StudyConfig[], incoming: StudyConfig[]): StudyConfig[] {
    const byId = new Map(current.map((study) => [study.id, study]));
    for (const study of incoming) byId.set(study.id, study);
    return [...byId.values()].slice(0, MAX_STUDIES);
}

/** The two lists merged: nothing from either side is lost when the same symbol exists in two places. */
export function mergeSetup(local: ChartSetup, remote: ChartSetup): ChartSetup {
    const byId = new Map(local.drawings.map((drawing) => [drawing.id, drawing]));
    for (const drawing of remote.drawings) byId.set(drawing.id, drawing);
    return {
        drawings: [...byId.values()].slice(0, MAX_DRAWINGS),
        studies: mergeStudies(local.studies, remote.studies),
    };
}

/**
 * A payload from the server, held to the same gates as everything else: the drawings go through the one
 * validator the loader and the importer use, and the studies through the registry's own parser. Anything
 * that does not survive is dropped, never thrown — a stale or hand-edited row can only lose entries.
 */
export function parseChartSetup(raw: unknown): ChartSetup | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const payload = raw as Record<string, unknown>;
    if (payload.v !== SETUP_VERSION) return null;
    return {
        drawings: parseDrawingList(payload.drawings),
        studies: parseStudies({ v: 1, studies: payload.studies }),
    };
}

/** A setup as the account stores it. */
export const serializeChartSetup = (setup: ChartSetup): Record<string, unknown> => ({
    v: SETUP_VERSION,
    drawings: setup.drawings,
    studies: setup.studies,
});

// --- the mark left when a save could not reach the account ------------------
// One key per symbol, so the flag names the chart it belongs to. A browser holding a marked symbol
// pushes its copy up on the next open instead of reading the account's, which is how work done offline
// survives coming back online.

const pendingKey = (symbol: string): string => `openstock-setup-pending:${symbol.toUpperCase()}`;

type Readable = Pick<Storage, 'getItem'>;
type Writable = Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'removeItem'>>;

export function readSetupPending(storage: Readable, symbol: string): boolean {
    try {
        return storage.getItem(pendingKey(symbol)) === '1';
    } catch {
        return false;
    }
}

export function writeSetupPending(storage: Writable, symbol: string, pending: boolean): void {
    try {
        if (pending) storage.setItem(pendingKey(symbol), '1');
        else if (storage.removeItem) storage.removeItem(pendingKey(symbol));
        else storage.setItem(pendingKey(symbol), '0');
    } catch {
        /* a blocked storage only means the flag cannot be kept; the chart still works */
    }
}

// The study list is this browser's, like its drawings and the grid workspace: one key, read and
// written through the registry's validating parser, and never allowed to throw at the caller.
//
// Two shapes live here. A single chart keeps one list (`STUDIES_KEY`); the grid keeps one list per
// pane (`PANE_STUDIES_KEY`), because a study screen runs different indicators over different
// timeframes of the same company. The single key is still read as the seed for a grid that has
// never been split, so an existing setup is not lost when the panes learn to differ.

import { parseStudies, type StudyConfig } from '@/lib/chart/studies';
import { MAX_PANES } from '@/lib/chart/grid';

export const STUDIES_KEY = 'openstock:chart-studies';
export const PANE_STUDIES_KEY = 'openstock:chart-studies-panes';

type Readable = Pick<Storage, 'getItem'>;
type Writable = Pick<Storage, 'setItem'>;

export function readStudies(storage: Readable): StudyConfig[] {
    try {
        const raw = storage.getItem(STUDIES_KEY);
        if (!raw) return [];
        return parseStudies(JSON.parse(raw));
    } catch {
        return [];
    }
}

export function writeStudies(storage: Writable, studies: StudyConfig[]): void {
    try {
        storage.setItem(STUDIES_KEY, JSON.stringify({ v: 1, studies }));
    } catch {
        /* private mode or a full quota: the list still applies for this visit */
    }
}

/** One list per pane, in pane order and always `MAX_PANES` long so a pane index is an index. */
export function readPaneStudies(storage: Readable): StudyConfig[][] {
    try {
        const raw = storage.getItem(PANE_STUDIES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as { v?: number; panes?: unknown };
        if (parsed.v !== 1 || !Array.isArray(parsed.panes)) return [];
        return parsed.panes
            .slice(0, MAX_PANES)
            .map((list) => parseStudies(list as StudyConfig[]));
    } catch {
        return [];
    }
}

export function writePaneStudies(storage: Writable, panes: readonly StudyConfig[][]): void {
    try {
        storage.setItem(PANE_STUDIES_KEY, JSON.stringify({ v: 1, panes: panes.slice(0, MAX_PANES) }));
    } catch {
        /* private mode or a full quota: the lists still apply for this visit */
    }
}

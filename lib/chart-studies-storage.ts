// The study list is this browser's, like its drawings and the grid workspace: one key, read and
// written through the registry's validating parser, and never allowed to throw at the caller.

import { parseStudies, type StudyConfig } from '@/lib/chart-studies';

export const STUDIES_KEY = 'openstock:chart-studies';

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

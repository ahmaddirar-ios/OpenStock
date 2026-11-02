// Undo/redo for the drawings layer. The history holds whole snapshots of the drawing list, not
// diffs: a drawing is a small plain object, and "the list before this gesture" is both simpler and
// safer to restore than replaying inverse operations. Every change goes through `apply` (a discrete
// edit) or a checkpoint (the end of a drag, whose intermediate positions must not each be a step).

export type History<T> = { past: T[]; present: T; future: T[] };

/** How many steps a chart remembers. Fifty is deep enough to recover a session's work, small enough
 *  that a hundred drawings on five charts cannot eat the tab's memory. */
export const HISTORY_LIMIT = 50;

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

/** A finished edit: the state before it becomes the last undo step, and redo is discarded. */
export function applyHistory<T>(history: History<T>, next: T): History<T> {
    if (Object.is(next, history.present)) return history;
    return {
        past: [...history.past, history.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
    };
}

/**
 * The end of a continuous gesture. `before` is the snapshot taken when the drag started; the
 * intermediate positions were applied without touching the past, so exactly one step is recorded.
 */
export function checkpointHistory<T>(history: History<T>, before: T): History<T> {
    if (Object.is(before, history.present)) return history;
    return {
        past: [...history.past, before].slice(-HISTORY_LIMIT),
        present: history.present,
        future: [],
    };
}

export function undoHistory<T>(history: History<T>): History<T> {
    if (history.past.length === 0) return history;
    const past = history.past.slice(0, -1);
    const present = history.past[history.past.length - 1];
    return { past, present, future: [history.present, ...history.future].slice(0, HISTORY_LIMIT) };
}

export function redoHistory<T>(history: History<T>): History<T> {
    if (history.future.length === 0) return history;
    const [present, ...future] = history.future;
    return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present, future };
}

export const canUndo = <T>(history: History<T>) => history.past.length > 0;
export const canRedo = <T>(history: History<T>) => history.future.length > 0;

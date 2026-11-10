import { describe, expect, it } from 'vitest';
import {
    HISTORY_LIMIT,
    applyHistory,
    canRedo,
    canUndo,
    checkpointHistory,
    createHistory,
    redoHistory,
    undoHistory,
} from '@/lib/chart/history';

describe('history', () => {
    it('starts with nothing to undo or redo', () => {
        const history = createHistory(['a']);
        expect(canUndo(history)).toBe(false);
        expect(canRedo(history)).toBe(false);
        expect(undoHistory(history)).toBe(history);
        expect(redoHistory(history)).toBe(history);
    });

    it('walks back and forward through edits', () => {
        let history = createHistory(['a']);
        history = applyHistory(history, ['a', 'b']);
        history = applyHistory(history, ['a', 'b', 'c']);
        expect(history.present).toEqual(['a', 'b', 'c']);

        history = undoHistory(history);
        expect(history.present).toEqual(['a', 'b']);
        history = undoHistory(history);
        expect(history.present).toEqual(['a']);
        expect(canUndo(history)).toBe(false);

        history = redoHistory(history);
        expect(history.present).toEqual(['a', 'b']);
        history = redoHistory(history);
        expect(history.present).toEqual(['a', 'b', 'c']);
        expect(canRedo(history)).toBe(false);
    });

    it('discards the redo branch when a new edit lands', () => {
        let history = createHistory(['a']);
        history = applyHistory(history, ['b']);
        history = undoHistory(history);
        expect(canRedo(history)).toBe(true);
        history = applyHistory(history, ['c']);
        expect(history.present).toEqual(['c']);
        expect(canRedo(history)).toBe(false);
        expect(undoHistory(history).present).toEqual(['a']);
    });

    it('ignores an edit that changes nothing (same reference)', () => {
        const list = ['a'];
        const history = applyHistory(createHistory(list), list);
        expect(canUndo(history)).toBe(false);
    });

    it('records one step for a whole drag, not one per move', () => {
        let history = createHistory(['start']);
        const before = history.present;
        // The drag mutates the present directly, the way pointermove does.
        history = { ...history, present: ['dragged'] };
        history = { ...history, present: ['dragged', 'more'] };
        history = checkpointHistory(history, before);
        expect(history.past).toHaveLength(1);
        expect(undoHistory(history).present).toEqual(['start']);
    });

    it('keeps at most the limit, dropping the oldest step', () => {
        let history = createHistory(0);
        for (let i = 1; i <= HISTORY_LIMIT + 10; i += 1) history = applyHistory(history, i);
        expect(history.past).toHaveLength(HISTORY_LIMIT);
        // The oldest reachable step is the one just past the dropped range.
        let depth = 0;
        while (canUndo(history)) {
            history = undoHistory(history);
            depth += 1;
        }
        expect(depth).toBe(HISTORY_LIMIT);
        expect(history.present).toBe(10);
    });

    it('caps redo as well', () => {
        let history = createHistory(0);
        for (let i = 1; i <= 60; i += 1) history = applyHistory(history, i);
        for (let i = 0; i < 60; i += 1) history = undoHistory(history);
        expect(history.future).toHaveLength(HISTORY_LIMIT);
    });
});

// @vitest-environment jsdom
// The rail is the chart's tool surface: a group button must open exactly one flyout, a row must
// report the tool the chart should start, and Escape/outside must close what is open. The chart
// itself is not rendered here — only the rail's own contract is asserted.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import DrawingRail from '@/components/stocks/DrawingRail';
import { toolsInGroup } from '@/lib/chart-drawings';
import { railGroupsWithTools, TOOL_LABEL_KEYS } from '@/lib/drawing-groups';
import { tx } from '@/lib/i18n';

const label = (key: Parameters<typeof tx>[1]) => tx('en', key);

const baseProps = {
    tool: null,
    onPick: () => {},
    magnet: false,
    onMagnet: () => {},
    locked: false,
    canLock: false,
    onToggleLock: () => {},
    hidden: false,
    onHideAll: () => {},
    canDelete: false,
    onDelete: () => {},
    canUndo: false,
    canRedo: false,
    onUndo: () => {},
    onRedo: () => {},
    canClear: false,
    onClear: () => {},
    label,
};

afterEach(cleanup);

describe('DrawingRail', () => {
    it('shows one button per group that actually holds tools', () => {
        render(<DrawingRail {...baseProps} />);
        const groups = railGroupsWithTools();
        for (const { group, label: key } of groups) {
            expect(screen.getByTitle(label(key)), group).toBeTruthy();
        }
        // Groups with no tools yet (forecast, shapes, brush) must not open an empty flyout.
        for (const { group } of railGroupsWithTools()) {
            expect(toolsInGroup(group).length, group).toBeGreaterThan(0);
        }
    });

    it('opens one flyout at a time and reports the picked tool', () => {
        const onPick = vi.fn();
        render(<DrawingRail {...baseProps} onPick={onPick} />);

        fireEvent.click(screen.getByTitle('Lines'));
        const linesMenu = screen.getByRole('menu', { name: 'Lines' });
        expect(within(linesMenu).getAllByRole('menuitem').map((row) => row.textContent)).toContain('Trend line');

        // Opening another group replaces the first flyout instead of stacking them.
        fireEvent.click(screen.getByTitle('Fibonacci'));
        expect(screen.queryByRole('menu', { name: 'Lines' })).toBeNull();
        expect(screen.getByRole('menu', { name: 'Fibonacci' })).toBeTruthy();

        fireEvent.click(within(screen.getByRole('menu', { name: 'Fibonacci' })).getByText(label(TOOL_LABEL_KEYS.fib)));
        expect(onPick).toHaveBeenCalledWith('fib');
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('closes an open flyout on Escape and on an outside pointer press', () => {
        render(<DrawingRail {...baseProps} />);

        fireEvent.click(screen.getByTitle('Lines'));
        expect(screen.getByRole('menu')).toBeTruthy();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('menu')).toBeNull();

        fireEvent.click(screen.getByTitle('Lines'));
        expect(screen.getByRole('menu')).toBeTruthy();
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('marks the active tool and enables the actions that have something to act on', () => {
        const isDisabled = (key: Parameters<typeof tx>[1]) =>
            (screen.getByTitle(label(key)) as HTMLButtonElement).disabled;

        const { rerender } = render(<DrawingRail {...baseProps} />);
        expect(isDisabled('chart.tool.undo')).toBe(true);
        expect(isDisabled('chart.tool.delete')).toBe(true);

        rerender(<DrawingRail {...baseProps} tool="trend" canUndo canDelete canLock locked />);
        // The group holding the active tool is highlighted, so the rail shows where the pick landed.
        expect(screen.getByTitle('Lines').className).toContain('is-on');
        expect(screen.getByTitle('Fibonacci').className).not.toContain('is-on');
        expect(isDisabled('chart.tool.undo')).toBe(false);
        expect(isDisabled('chart.tool.delete')).toBe(false);
    });
});

// @vitest-environment jsdom
// The chart toolbar is grouped, not a flat row of equal pills: the intervals are one segmented track,
// and the four settings a trader changes once in a while (zone, scale, inverted axis, session gaps)
// live behind one gear instead of taking four slots on the bar.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChartPeriods from '@/components/stocks/ChartPeriods';
import ChartSettingsMenu from '@/components/stocks/ChartSettingsMenu';

const periods = [
    { id: '1d', label: '1D' },
    { id: '5d', label: '5D' },
    { id: '1mo', label: '1M' },
    { id: '3mo', label: '3M' },
    { id: '6mo', label: '6M' },
    { id: '1y', label: '1Y' },
    { id: '5y', label: '5Y' },
];

afterEach(cleanup);

describe('the interval track', () => {
    it('is one group of seven periods, only the chosen one pressed', () => {
        render(<ChartPeriods periods={periods} active="3mo" lang="en" onPick={() => {}} />);

        const group = screen.getByRole('group', { name: 'Period' });
        const buttons = Array.from(group.querySelectorAll('button'));
        expect(buttons).toHaveLength(7);
        expect(buttons.filter((button) => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
        expect(screen.getByRole('button', { name: '3M' }).getAttribute('aria-pressed')).toBe('true');
        // The pressed segment is the one that wears the accent.
        expect(screen.getByRole('button', { name: '3M' }).className).toContain('is-up');
    });

    it('hands the picked period back, and marks it active', () => {
        const onPick = vi.fn();
        render(<ChartPeriods periods={periods} active="1d" lang="ar" onPick={onPick} />);

        fireEvent.click(screen.getByRole('button', { name: '1Y' }));
        expect(onPick).toHaveBeenCalledWith('1y');
        expect(screen.getByRole('group', { name: 'الفترة' })).toBeTruthy();
    });
});

describe('the settings gear', () => {
    const menu = (over: Partial<React.ComponentProps<typeof ChartSettingsMenu>> = {}) => (
        <ChartSettingsMenu
            lang="en"
            timeZone="Asia/Riyadh"
            scaleMode="linear"
            invert={false}
            sessionBreaks={false}
            onTimeZone={() => {}}
            onScaleMode={() => {}}
            onInvert={() => {}}
            onSessionBreaks={() => {}}
            {...over}
        />
    );

    it('stays shut until asked, then carries the four settings', () => {
        render(menu());

        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Chart settings' }));

        const panel = screen.getByRole('dialog');
        expect(panel.textContent).toContain('Time zone');
        expect(panel.textContent).toContain('Scale');
        expect(panel.textContent).toContain('Invert scale');
        expect(panel.textContent).toContain('Session breaks');
    });

    it('closes on Escape, because a panel that traps the keyboard is a trap', () => {
        render(menu());
        fireEvent.click(screen.getByRole('button', { name: 'Chart settings' }));
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByRole('button', { name: 'Chart settings' }).getAttribute('aria-expanded')).toBe('false');
    });

    it('reports each change without deciding anything itself', () => {
        const onTimeZone = vi.fn();
        const onScaleMode = vi.fn();
        const onInvert = vi.fn();
        const onSessionBreaks = vi.fn();
        render(menu({ onTimeZone, onScaleMode, onInvert, onSessionBreaks }));
        fireEvent.click(screen.getByRole('button', { name: 'Chart settings' }));

        fireEvent.click(screen.getByRole('button', { name: 'Logarithmic' }));
        expect(onScaleMode).toHaveBeenCalledWith('log');

        fireEvent.change(screen.getByRole('combobox', { name: 'Time zone' }), { target: { value: 'UTC' } });
        expect(onTimeZone).toHaveBeenCalledWith('UTC');

        fireEvent.click(screen.getByRole('checkbox', { name: 'Invert scale' }));
        expect(onInvert).toHaveBeenCalledWith(true);
        fireEvent.click(screen.getByRole('checkbox', { name: 'Session breaks' }));
        expect(onSessionBreaks).toHaveBeenCalledWith(true);
    });
});

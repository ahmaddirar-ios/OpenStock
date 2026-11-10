// @vitest-environment jsdom
// The mobile fold: a phone sees the interval, the tool palette, the chart type and one more button;
// everything else waits behind it. The button is the only JS in the fold — the CSS media query does
// the hiding — so this test pins its label, its state and the class the media query reads.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import ChartToolbarMore from '@/components/stocks/ChartToolbarMore';

afterEach(cleanup);

describe('the chart toolbar fold', () => {
    it('names itself in both languages', () => {
        const { rerender, getByRole } = render(<ChartToolbarMore lang="en" open={false} onToggle={() => {}} />);
        expect(getByRole('button').textContent).toContain('More');

        rerender(<ChartToolbarMore lang="ar" open={false} onToggle={() => {}} />);
        expect(getByRole('button').textContent).toContain('المزيد');
    });

    it('says whether the rest of the toolbar is showing', () => {
        const { rerender, getByRole } = render(<ChartToolbarMore lang="en" open={false} onToggle={() => {}} />);
        expect(getByRole('button').getAttribute('aria-expanded')).toBe('false');

        rerender(<ChartToolbarMore lang="en" open onToggle={() => {}} />);
        expect(getByRole('button').getAttribute('aria-expanded')).toBe('true');
    });

    it('calls back once per press', () => {
        const onToggle = vi.fn();
        const { getByRole } = render(<ChartToolbarMore lang="en" open={false} onToggle={onToggle} />);
        fireEvent.click(getByRole('button'));
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('carries the class that hides it on a wide screen', () => {
        // `.chart-more` is display:none above 768px; without it the desktop toolbar would grow a button.
        const { getByRole } = render(<ChartToolbarMore lang="en" open={false} onToggle={() => {}} />);
        expect(getByRole('button').className).toContain('chart-more');
    });
});

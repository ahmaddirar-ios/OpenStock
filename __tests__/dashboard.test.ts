import { describe, expect, it } from 'vitest';
import {
    DEFAULT_LAYOUT,
    WIDGETS,
    WIDGET_IDS,
    moveWidget,
    normalizeLayout,
    toggleWidget,
    visibleWidgets,
} from '@/lib/dashboard';

describe('the widget catalogue', () => {
    it('names every widget in both languages', async () => {
        const { tx } = await import('@/lib/i18n');
        for (const widget of WIDGETS) {
            expect(tx('en', widget.labelKey)).not.toBe(widget.labelKey);
            expect(tx('ar', widget.labelKey)).not.toBe(widget.labelKey);
        }
    });

    it('has one entry per id, in catalogue order', () => {
        expect(WIDGETS.map((widget) => widget.id)).toEqual([...WIDGET_IDS]);
    });
});

describe('normalizeLayout', () => {
    it('keeps a valid layout as it is', () => {
        const layout = { order: ['alerts', 'portfolio', 'watchlist', 'scanner', 'strategies', 'screeners'], hidden: ['scanner'] };
        expect(normalizeLayout(layout)).toEqual(layout);
    });

    it('drops unknown ids and duplicates', () => {
        const layout = normalizeLayout({ order: ['alerts', 'nope', 'alerts', 42], hidden: ['ghost', 'alerts', 'alerts'] });
        expect(layout.order.slice(0, 2)).toEqual(['alerts', 'portfolio']);
        expect(layout.order).toHaveLength(WIDGET_IDS.length);
        expect(layout.hidden).toEqual(['alerts']);
    });

    it('appends widgets the catalogue gained since the row was written', () => {
        const layout = normalizeLayout({ order: ['alerts'], hidden: [] });
        expect(layout.order[0]).toBe('alerts');
        expect(new Set(layout.order)).toEqual(new Set(WIDGET_IDS));
    });

    it('falls back to the default for anything unusable', () => {
        expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
        expect(normalizeLayout('nope')).toEqual(DEFAULT_LAYOUT);
        expect(normalizeLayout({})).toEqual(DEFAULT_LAYOUT);
        expect(normalizeLayout({ order: 'alerts' })).toEqual(DEFAULT_LAYOUT);
    });
});

describe('arranging the board', () => {
    it('moves a widget one place and refuses to fall off either end', () => {
        const moved = moveWidget(DEFAULT_LAYOUT, 'watchlist', -1);
        expect(moved.order.slice(0, 2)).toEqual(['watchlist', 'portfolio']);
        expect(moveWidget(DEFAULT_LAYOUT, 'portfolio', -1)).toEqual(DEFAULT_LAYOUT);
        expect(moveWidget(DEFAULT_LAYOUT, 'screeners', 1)).toEqual(DEFAULT_LAYOUT);
        expect(moveWidget(DEFAULT_LAYOUT, 'nope' as never, 1)).toEqual(DEFAULT_LAYOUT);
    });

    it('hides and restores a widget', () => {
        const hidden = toggleWidget(DEFAULT_LAYOUT, 'alerts');
        expect(hidden.hidden).toEqual(['alerts']);
        expect(visibleWidgets(hidden)).not.toContain('alerts');
        expect(toggleWidget(hidden, 'alerts').hidden).toEqual([]);
    });
});

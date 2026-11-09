// The overview board: which cards exist, and how a saved arrangement is repaired.
//
// Pure and client-safe. The catalogue is the one list the board, the layout action and the tests
// read; `normalizeLayout` is the only place that decides what a stored layout means, so a stale
// row (a widget that was removed, a duplicate, a forged id) can never break the page.

import type { StringKey } from '@/lib/i18n';

export const WIDGET_IDS = ['portfolio', 'watchlist', 'alerts', 'scanner', 'strategies', 'screeners'] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export type WidgetDef = {
    id: WidgetId;
    labelKey: StringKey;
    href: string;
};

export const WIDGETS: readonly WidgetDef[] = [
    { id: 'portfolio', labelKey: 'board.portfolio', href: '/portfolio' },
    { id: 'watchlist', labelKey: 'board.watchlist', href: '/watchlist' },
    { id: 'alerts', labelKey: 'board.alerts', href: '/alerts' },
    { id: 'scanner', labelKey: 'board.scanner', href: '/scanner' },
    { id: 'strategies', labelKey: 'board.strategies', href: '/strategies' },
    { id: 'screeners', labelKey: 'board.screeners', href: '/screener' },
];

export type DashboardLayout = {
    /** Every widget, in the order the user put them. */
    order: WidgetId[];
    /** The widgets the user has put away. */
    hidden: WidgetId[];
};

export const DEFAULT_LAYOUT: DashboardLayout = {
    order: [...WIDGET_IDS],
    hidden: [],
};

const isWidgetId = (value: unknown): value is WidgetId =>
    typeof value === 'string' && (WIDGET_IDS as readonly string[]).includes(value);

/**
 * A stored layout, made safe: unknown ids are dropped, duplicates collapse, widgets the catalogue
 * gained since the row was written are appended, and the order is preserved. Anything unusable
 * falls back to the default.
 */
export function normalizeLayout(input: unknown): DashboardLayout {
    if (!input || typeof input !== 'object') return { order: [...DEFAULT_LAYOUT.order], hidden: [] };
    const record = input as { order?: unknown; hidden?: unknown };

    const order: WidgetId[] = [];
    if (Array.isArray(record.order)) {
        for (const value of record.order) {
            if (isWidgetId(value) && !order.includes(value)) order.push(value);
        }
    }
    for (const id of WIDGET_IDS) if (!order.includes(id)) order.push(id);

    const hidden: WidgetId[] = [];
    if (Array.isArray(record.hidden)) {
        for (const value of record.hidden) {
            if (isWidgetId(value) && !hidden.includes(value)) hidden.push(value);
        }
    }

    return { order, hidden };
}

/** The widgets a layout shows, in order. */
export const visibleWidgets = (layout: DashboardLayout): WidgetId[] =>
    layout.order.filter((id) => !layout.hidden.includes(id));

/** Move a widget one place up or down, keeping the rest of the order. */
export function moveWidget(layout: DashboardLayout, id: WidgetId, direction: -1 | 1): DashboardLayout {
    const order = [...layout.order];
    const index = order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return layout;
    [order[index], order[target]] = [order[target], order[index]];
    return { ...layout, order };
}

/** Put a widget away, or bring it back. */
export function toggleWidget(layout: DashboardLayout, id: WidgetId): DashboardLayout {
    const hidden = layout.hidden.includes(id)
        ? layout.hidden.filter((value) => value !== id)
        : [...layout.hidden, id];
    return { ...layout, hidden };
}

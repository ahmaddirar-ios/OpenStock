// The chart grid: several symbols on one screen, each pane its own chart. Pure functions only —
// the URL round trip, the layout presets, the day change and the local symbol search — so the
// screen's behaviour can be pinned by tests without a browser.

import { compareYahooSymbol } from '@/lib/compare';
import { DEFAULT_CANDLE_INTERVAL, isCandleIntervalId, type Candle } from '@/lib/yahoo-candles';
import { SCREENER_UNIVERSE, type UniverseEntry } from '@/lib/screener-universe';
import { normalizeArabic } from '@/lib/saudi-symbols';
import { cursorForTime, minStartIndex, randomCursor, visibleCandles } from '@/lib/replay';
import type { StringKey } from '@/lib/i18n';

export type GridLayoutId = 1 | 2 | 3 | 4;

/** Four panes is as many as read on a laptop without shrinking a candle to a line. */
export const MAX_PANES = 4;
export const DEFAULT_LAYOUT: GridLayoutId = 4;

export type ChartLayout = {
    id: GridLayoutId;
    panes: number;
    /** Grid template utilities: one column on a phone, the shape on a wide screen. */
    className: string;
    /** The first pane's extra classes — layout 3 gives it the tall left column. */
    firstClassName: string;
};

export const CHART_LAYOUTS: Record<GridLayoutId, ChartLayout> = {
    1: { id: 1, panes: 1, className: 'grid-cols-1', firstClassName: '' },
    2: { id: 2, panes: 2, className: 'grid-cols-1 lg:grid-cols-2', firstClassName: '' },
    3: {
        id: 3,
        panes: 3,
        className: 'grid-cols-1 lg:grid-cols-2 lg:grid-rows-2',
        firstClassName: 'lg:row-span-2',
    },
    4: { id: 4, panes: 4, className: 'grid-cols-1 lg:grid-cols-2 lg:grid-rows-2', firstClassName: '' },
};

export const LAYOUT_IDS: GridLayoutId[] = [1, 2, 3, 4];

/** The interval labels, shared by the symbol page's toolbar and the grid's. */
export const INTERVAL_LABEL_KEYS: Record<string, StringKey> = {
    '1m': 'chart.tf.1m',
    '5m': 'chart.tf.5m',
    '15m': 'chart.tf.15m',
    '30m': 'chart.tf.30m',
    '60m': 'chart.tf.60m',
    '2h': 'chart.tf.2h',
    '4h': 'chart.tf.4h',
    '1d': 'chart.tf.1d',
    '1wk': 'chart.tf.1wk',
    '1mo': 'chart.tf.1mo',
};

export function isGridLayoutId(value: unknown): value is GridLayoutId {
    return value === 1 || value === 2 || value === 3 || value === 4;
}

export function parseGridLayout(value: unknown): GridLayoutId | null {
    const numeric = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
    return isGridLayoutId(numeric) ? numeric : null;
}

export type GridState = {
    layout: GridLayoutId;
    /** Every symbol that resolved, in pane order, capped at four. Empty panes are absent. */
    symbols: string[];
    intervalId: string;
};

/**
 * Keeps the symbols a pane can chart: resolved through the same resolver compare uses (so a plain
 * US ticker and a suffixed Tadawul or Hong Kong listing both pass), de-duped, capped at MAX_PANES.
 * `fallback` fills the remaining slots, which is how a remembered workspace meets a shared URL.
 */
export function normalizeGridSymbols(inputs: readonly unknown[], fallback: readonly unknown[] = []): string[] {
    const out: string[] = [];
    const add = (value: unknown) => {
        if (typeof value !== 'string' || out.length >= MAX_PANES) return;
        const symbol = compareYahooSymbol(value);
        if (!symbol || out.includes(symbol)) return;
        out.push(symbol);
    };
    inputs.forEach(add);
    fallback.forEach(add);
    return out;
}

/** What each pane shows: the resolved symbol, or an empty string for a pane still waiting for one. */
export function paneSymbols(symbols: readonly string[], panes: number): string[] {
    return Array.from({ length: Math.max(0, panes) }, (_, index) => symbols[index] ?? '');
}

/**
 * Splits the URL's `s` parameter into one entry per pane. A cleared pane keeps its place (`a,,b`
 * stays three wide), while trailing empties are dropped so the URL does not carry padding.
 */
export function parsePaneSlots(raw: string | undefined): string[] {
    const parts = (raw ?? '').split(',');
    const slots = parts.map((part) => compareYahooSymbol(part) ?? '');
    while (slots.length > 0 && slots[slots.length - 1] === '') slots.pop();
    return slots;
}

/** The pane already charting this symbol, or -1. A duplicate buys nothing: the interval is shared. */
export function paneOwning(symbols: readonly string[], symbol: string, except = -1): number {
    const wanted = (symbol || '').trim().toUpperCase();
    if (!wanted) return -1;
    return symbols.findIndex((current, index) => index !== except && current.toUpperCase() === wanted);
}

const firstValue = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

export type GridFallback = { symbols?: readonly string[]; intervalId?: string };

/**
 * The URL is the workspace: `?l=4&s=2222.SR,1120.SR&i=1d`. Anything unreadable falls back to the
 * remembered workspace and then to the defaults, so a stale link can never break the screen.
 */
export function parseGridState(
    search: Record<string, string | string[] | undefined>,
    fallback: GridFallback = {},
): GridState {
    const layout = parseGridLayout(firstValue(search.l)) ?? DEFAULT_LAYOUT;
    const slots = parsePaneSlots(firstValue(search.s)).slice(0, MAX_PANES);
    // A link with panes named keeps those panes; the remembered symbols only fill a link that is
    // silent about them (or names nobody), which is what makes a bare `/charts` resume the workspace.
    const named = slots.filter(Boolean);
    const symbols = named.length > 0 ? slots : normalizeGridSymbols(slots, fallback.symbols ?? []);
    const interval = firstValue(search.i);
    const remembered = isCandleIntervalId(fallback.intervalId) ? fallback.intervalId : DEFAULT_CANDLE_INTERVAL;
    return { layout, symbols, intervalId: isCandleIntervalId(interval) ? interval : remembered };
}

/**
 * The symbols as one query value. A cleared pane in the middle keeps its place, so a later pane does
 * not slide left, while trailing empties are dropped and a widened layout does not pad the link with
 * commas nobody asked for.
 */
export function serializeGridSymbols(symbols: readonly string[]): string {
    const slots = [...symbols];
    while (slots.length > 0 && !slots[slots.length - 1]) slots.pop();
    return slots.join(',');
}

export function serializeGridState(state: GridState): string {
    return new URLSearchParams({
        l: String(state.layout),
        s: serializeGridSymbols(state.symbols),
        i: state.intervalId,
    }).toString();
}

export type SessionChange = { price: number; change: number; percent: number };

/**
 * The day change a pane header shows, read from the candles it already has: the last close against
 * the one before it. A single bar (a freshly listed symbol) reports no move rather than a fake one.
 */
export function sessionChange(candles: readonly Candle[]): SessionChange | null {
    if (candles.length === 0) return null;
    const last = candles[candles.length - 1];
    if (!Number.isFinite(last.close) || last.close <= 0) return null;
    const previous = candles.length > 1 ? candles[candles.length - 2] : null;
    if (!previous || !Number.isFinite(previous.close) || previous.close <= 0) {
        return { price: last.close, change: 0, percent: 0 };
    }
    const change = last.close - previous.close;
    return { price: last.close, change, percent: (change / previous.close) * 100 };
}

// How well a local universe entry answers a query. Symbol hits outrank name hits, because a reader
// typing "2222" wants that listing, not every company whose name contains those digits.
const symbolScore = (symbol: string, query: string): number => {
    if (!query) return 0;
    if (symbol === query) return 120;
    if (symbol.startsWith(query)) return 100 + query.length;
    if (symbol.includes(query)) return 60 + query.length;
    return 0;
};

const nameScore = (name: string, query: string): number => {
    if (!name || query.length < 2) return 0;
    if (name === query) return 95;
    if (name.startsWith(query)) return 70 + query.length;
    if (name.includes(` ${query}`)) return 55 + query.length;
    if (name.includes(query)) return 35 + query.length;
    return 0;
};

/**
 * Searches the 906-company universe in the browser: symbol, English name and Arabic name, with the
 * Arabic folding the Tadawul table already uses ("أرامكو" == "ارامكو"). No network call, so a pane
 * answers on the first keystroke.
 */
export function searchUniverse(query: string, limit = 8): UniverseEntry[] {
    const raw = (query || '').trim();
    if (!raw) return [];
    const upper = raw.toUpperCase();
    const folded = normalizeArabic(raw);

    const hits: { entry: UniverseEntry; score: number }[] = [];
    for (const entry of SCREENER_UNIVERSE) {
        const best = Math.max(
            symbolScore(entry.symbol.toUpperCase(), upper),
            nameScore(normalizeArabic(entry.name), folded),
            entry.nameAr ? nameScore(normalizeArabic(entry.nameAr), folded) : 0,
        );
        if (best > 0) hits.push({ entry, score: best });
    }

    return hits
        .sort((a, b) => b.score - a.score || a.entry.symbol.localeCompare(b.entry.symbol))
        .slice(0, Math.max(1, limit))
        .map((hit) => hit.entry);
}

/** The company name for a pane header: the Arabic trading name when we have one. */
export function universeName(symbol: string, lang: 'en' | 'ar'): string | null {
    const upper = (symbol || '').trim().toUpperCase();
    const entry = SCREENER_UNIVERSE.find((row) => row.symbol.toUpperCase() === upper);
    if (!entry) return null;
    return (lang === 'ar' && entry.nameAr) || entry.name;
}

// -- Replay across the panes -------------------------------------------------------------------
// One cursor for the whole screen. The rules are here, not in the component: which pane defines a
// "bar", where a shared replay may start, and how far a pane may be clipped.

/** The pane whose series defines a shared step: the longest one, so every pane can keep up. */
export function replayAnchor(series: readonly (readonly Candle[])[]): readonly Candle[] | null {
    let anchor: readonly Candle[] | null = null;
    for (const bars of series) {
        if (bars.length > 0 && (anchor === null || bars.length > anchor.length)) anchor = bars;
    }
    return anchor;
}

/** The first legal shared cursor: the latest warm-up bar among the panes, so none starts blind. */
export function replayStartTime(series: readonly (readonly Candle[])[]): number | null {
    let time = -Infinity;
    for (const bars of series) {
        if (bars.length === 0) continue;
        time = Math.max(time, bars[Math.min(minStartIndex(bars.length), bars.length - 1)].time);
    }
    return Number.isFinite(time) ? time : null;
}

/** The last shared cursor: the anchor's final bar. */
export function replayEndTime(series: readonly (readonly Candle[])[]): number | null {
    const anchor = replayAnchor(series);
    return anchor ? anchor[anchor.length - 1].time : null;
}

/**
 * The bars a pane may show for this shared cursor. A cursor older than the pane's own data is not
 * a one-bar chart: the pane shows its warm-up window, the earliest honest view it has.
 */
export function clipToCursor(candles: readonly Candle[], cursorTime: number | null): Candle[] {
    if (candles.length === 0) return [];
    if (cursorTime == null) return [...candles];
    const index = Math.max(minStartIndex(candles.length), cursorForTime(candles, cursorTime));
    return visibleCandles(candles, index);
}

/** Moves the shared cursor by whole bars on the anchor's scale, clamped to the series' span. */
export function stepReplayTime(
    series: readonly (readonly Candle[])[],
    cursorTime: number | null,
    delta: number,
): number | null {
    const anchor = replayAnchor(series);
    if (!anchor) return null;
    const start = replayStartTime(series) ?? anchor[0].time;
    const current = cursorTime == null ? cursorForTime(anchor, start) : cursorForTime(anchor, cursorTime);
    const from = current < 0 ? cursorForTime(anchor, start) : current;
    const next = Math.max(0, Math.min(anchor.length - 1, from + Math.trunc(delta)));
    return anchor[next].time;
}

/** A random start that is never inside the warm-up and never on the last bar. */
export function randomReplayTime(series: readonly (readonly Candle[])[], random: () => number = Math.random): number | null {
    const anchor = replayAnchor(series);
    if (!anchor) return null;
    return anchor[randomCursor(anchor.length, random)].time;
}

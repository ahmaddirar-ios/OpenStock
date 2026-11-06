// The chart's own colours. The app theme paints the page; this is the one surface a trader stares
// at for hours, so it gets a palette of its own — the candles, the tile they sit on, the grid that
// squares it, and the axis text. Presets cover the looks people ask for by name; the pickers cover
// the rest. `theme` is the default and means "follow the app", which is what the chart did before
// this existed.

import type { StringKey } from '@/lib/i18n';

export type ChartPalette = {
    /** The rising candle, its wick, and the volume bar on an up day. */
    up: string;
    /** The falling candle, its wick, and the volume bar on a down day. */
    down: string;
    /** The tile the chart is drawn on — the panel behind the candles and the toolbar. */
    background: string;
    /** The grid lines that square the tile. */
    grid: string;
    /** Axis labels, the crosshair readout, the watermark. */
    text: string;
};

export type ChartPaletteId =
    | 'theme'
    | 'midnight'
    | 'graphite'
    | 'paper'
    | 'classic'
    | 'contrast'
    | 'custom';

/** The order the menu lists them in: the default first, then dark to light. */
export const CHART_PALETTE_IDS: readonly ChartPaletteId[] = [
    'theme',
    'midnight',
    'graphite',
    'classic',
    'paper',
    'contrast',
    'custom',
];

export const CHART_PALETTES: Record<Exclude<ChartPaletteId, 'theme' | 'custom'>, ChartPalette> = {
    midnight: { up: '#26a69a', down: '#ef5350', background: '#0b0f14', grid: '#1b2430', text: '#8b98a5' },
    graphite: { up: '#4ade80', down: '#f87171', background: '#16181c', grid: '#262a30', text: '#9aa4ae' },
    classic: { up: '#089981', down: '#f23645', background: '#ffffff', grid: '#e0e3eb', text: '#131722' },
    paper: { up: '#0f9d58', down: '#d93025', background: '#fbfbf9', grid: '#e6e4dd', text: '#5f6368' },
    contrast: { up: '#00e676', down: '#ff1744', background: '#000000', grid: '#2a2a2a', text: '#b0b0b0' },
};

export const CHART_PALETTE_KEYS: Record<ChartPaletteId, StringKey> = {
    theme: 'chart.palette.theme',
    midnight: 'chart.palette.midnight',
    graphite: 'chart.palette.graphite',
    classic: 'chart.palette.classic',
    paper: 'chart.palette.paper',
    contrast: 'chart.palette.contrast',
    custom: 'chart.palette.custom',
};

/** What the browser remembers: the chosen preset plus any colour the trader overrode by hand. */
export type ChartPaletteState = {
    id: ChartPaletteId;
    custom: Partial<ChartPalette>;
};

export const DEFAULT_PALETTE_STATE: ChartPaletteState = { id: 'theme', custom: {} };

export const PALETTE_STORAGE_KEY = 'openstock:chart-palette';

/** The five fields, in the order the pickers show them. */
export const PALETTE_FIELDS: readonly (keyof ChartPalette)[] = ['up', 'down', 'background', 'grid', 'text'];

export const PALETTE_FIELD_KEYS: Record<keyof ChartPalette, StringKey> = {
    up: 'chart.palette.up',
    down: 'chart.palette.down',
    background: 'chart.palette.background',
    grid: 'chart.palette.grid',
    text: 'chart.palette.text',
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const isHex = (value: unknown): value is string => typeof value === 'string' && HEX.test(value.trim());

/**
 * The palette the chart should paint with, or null for "follow the app theme". A preset is its own
 * five colours with any hand-picked override on top; `custom` is the overrides alone, so it needs a
 * complete set to be usable and falls back to graphite when it is not.
 */
export function resolvePalette(state: ChartPaletteState): ChartPalette | null {
    if (state.id === 'theme') return null;
    if (state.id === 'custom') {
        const base = CHART_PALETTES.graphite;
        const merged = { ...base };
        for (const field of PALETTE_FIELDS) {
            const value = state.custom[field];
            if (isHex(value)) merged[field] = value;
        }
        return merged;
    }
    const base = CHART_PALETTES[state.id] ?? CHART_PALETTES.graphite;
    const merged = { ...base };
    for (const field of PALETTE_FIELDS) {
        const value = state.custom[field];
        if (isHex(value)) merged[field] = value;
    }
    return merged;
}

/** Anything unreadable reads as the default: a chart never opens in a palette it cannot paint. */
export function parsePaletteState(raw: unknown): ChartPaletteState {
    if (!raw || typeof raw !== 'object') return DEFAULT_PALETTE_STATE;
    const record = raw as Record<string, unknown>;
    const id = typeof record.id === 'string' && (CHART_PALETTE_IDS as readonly string[]).includes(record.id)
        ? (record.id as ChartPaletteId)
        : 'theme';
    const custom: Partial<ChartPalette> = {};
    if (record.custom && typeof record.custom === 'object') {
        const source = record.custom as Record<string, unknown>;
        for (const field of PALETTE_FIELDS) {
            if (isHex(source[field])) custom[field] = (source[field] as string).trim();
        }
    }
    return { id, custom };
}

/** What the chart shows before the browser has read the theme's tokens. */
export const FALLBACK_THEME_PALETTE: ChartPalette = {
    up: '#4ade80',
    down: '#f87171',
    background: '#16181c',
    grid: '#1c2320',
    text: '#7d8a84',
};

/** Rasterises any CSS colour the browser understands (oklch, lab, rgb) to #rrggbb. */
function cssToHex(css: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback;
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return fallback;
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** The app theme's own five colours, as hex, so the pickers can show and edit them. */
export function themePalette(): ChartPalette {
    if (typeof window === 'undefined') return FALLBACK_THEME_PALETTE;
    const read = (name: string, fallback: string) => {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return raw ? cssToHex(raw, fallback) : fallback;
    };
    return {
        up: read('--up', FALLBACK_THEME_PALETTE.up),
        down: read('--down', FALLBACK_THEME_PALETTE.down),
        background: read('--card', FALLBACK_THEME_PALETTE.background),
        grid: read('--line', FALLBACK_THEME_PALETTE.grid),
        text: read('--faint', FALLBACK_THEME_PALETTE.text),
    };
}

/** True when a #rrggbb colour is light enough that text on it must be dark. */
export function isLightColor(hex: string): boolean {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if ([r, g, b].some((channel) => Number.isNaN(channel))) return false;
    // Rec. 709 luma: the same weighting the eye uses, so a saturated green reads as light.
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
}

/**
 * The chart panel is its own surface: when a palette is set, the toolbar, the quote header and the
 * legend must read on that background too, not on the page's. These are the tokens the chart's
 * chrome already uses, re-pointed at the palette so the whole tile changes together.
 */
export function paletteVars(palette: ChartPalette): Record<string, string> {
    const strong = isLightColor(palette.background) ? '#0b0f14' : '#e8eef4';
    return {
        '--card': palette.background,
        '--page': palette.background,
        '--frame': palette.background,
        '--text': strong,
        '--muted': palette.text,
        '--faint': palette.text,
        '--line': palette.grid,
        '--up': palette.up,
        '--down': palette.down,
        '--brand': palette.up,
        '--brand-ink': palette.up,
        '--brand-soft': `color-mix(in oklab, ${palette.up} 16%, transparent)`,
        '--hover': `color-mix(in oklab, ${strong} 8%, transparent)`,
        // The hatch shell's diagonal weave is a token too, so a paletted chart does not sit in a
        // frame woven in the app theme's grey.
        '--hatch-weave': `color-mix(in oklab, ${strong} 9%, transparent)`,
    };
}

export function readPaletteState(): ChartPaletteState {
    if (typeof window === 'undefined') return DEFAULT_PALETTE_STATE;
    try {
        const raw = window.localStorage.getItem(PALETTE_STORAGE_KEY);
        return raw ? parsePaletteState(JSON.parse(raw)) : DEFAULT_PALETTE_STATE;
    } catch {
        return DEFAULT_PALETTE_STATE;
    }
}

export function writePaletteState(state: ChartPaletteState): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // A full or blocked store is not a reason to break the chart: the palette just will not stick.
    }
}

// The stroke a *new* drawing of a tool starts with — "templates" in TradingView's language.
// A style is a preference, not part of a chart's drawings: it is stored once for the whole app, keyed
// by tool, so a trader who draws levels in gold gets gold levels on every symbol from then on.
// Every value is validated against the palette and the width/dash lists in lib/chart-drawings, so a
// hand-edited or stale store can never put a colour on the chart that the theme does not own.

import {
    DRAWING_DASHES,
    DRAWING_WIDTHS,
    isColorKey,
    isShapeTool,
    type ColorKey,
    type DrawingDash,
    type DrawingWidth,
    type ShapeTool,
} from '@/lib/chart-drawings';

export const DRAWING_STYLES_KEY = 'openstock-drawing-styles';

export type DrawingStyle = { color?: ColorKey; width?: DrawingWidth; dash?: DrawingDash };
export type DrawingStyleMap = Partial<Record<ShapeTool, DrawingStyle>>;

const isWidth = (value: unknown): value is DrawingWidth => typeof value === 'number' && (DRAWING_WIDTHS as readonly number[]).includes(value);
const isDash = (value: unknown): value is DrawingDash => typeof value === 'string' && (DRAWING_DASHES as readonly string[]).includes(value);

/** One tool's stroke, with anything off-palette dropped rather than kept and later refused. */
function cleanStyle(raw: unknown): DrawingStyle {
    if (typeof raw !== 'object' || raw === null) return {};
    const candidate = raw as Record<string, unknown>;
    return {
        ...(isColorKey(candidate.color) ? { color: candidate.color } : {}),
        ...(isWidth(candidate.width) ? { width: candidate.width } : {}),
        ...(isDash(candidate.dash) ? { dash: candidate.dash } : {}),
    };
}

const isEmptyStyle = (style: DrawingStyle): boolean =>
    style.color === undefined && style.width === undefined && style.dash === undefined;

/** Parses whatever was stored. Anything malformed is dropped, never thrown. */
export function parseDrawingStyles(raw: string | null): DrawingStyleMap {
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
        const styles: DrawingStyleMap = {};
        for (const [tool, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (!isShapeTool(tool)) continue;
            const style = cleanStyle(value);
            if (!isEmptyStyle(style)) styles[tool] = style;
        }
        return styles;
    } catch {
        return {};
    }
}

export const serializeDrawingStyles = (styles: DrawingStyleMap): string => JSON.stringify(styles);

/** The saved strokes. Safe on the server: returns {} when there is no window. */
export function loadDrawingStyles(): DrawingStyleMap {
    if (typeof window === 'undefined') return {};
    try {
        return parseDrawingStyles(window.localStorage.getItem(DRAWING_STYLES_KEY));
    } catch {
        return {};
    }
}

export function saveDrawingStyles(styles: DrawingStyleMap): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(DRAWING_STYLES_KEY, serializeDrawingStyles(styles));
    } catch {
        // A full or blocked storage must not break the chart; the default simply is not kept.
    }
}

/** The stroke to start a new drawing of this tool with: '' means the tool's own look. */
export const styleFor = (tool: ShapeTool, styles: DrawingStyleMap): DrawingStyle => styles[tool] ?? {};

/** Saves a tool's stroke. An empty stroke clears it: there is nothing to remember. */
export function withDrawingStyle(styles: DrawingStyleMap, tool: ShapeTool, style: DrawingStyle): DrawingStyleMap {
    const cleaned = cleanStyle(style);
    const next = { ...styles };
    if (isEmptyStyle(cleaned)) delete next[tool];
    else next[tool] = cleaned;
    return next;
}

export function withoutDrawingStyle(styles: DrawingStyleMap, tool: ShapeTool): DrawingStyleMap {
    const next = { ...styles };
    delete next[tool];
    return next;
}

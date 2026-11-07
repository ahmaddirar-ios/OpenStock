// "Copy style" in TradingView's language: the look of one drawing, carried to another — colour,
// weight, dash, fill and the type styling a note carries. It is *not* the per-tool template in
// lib/drawing-styles: that one changes what every future drawing of a tool starts with, while this
// one paints the drawings that are already on the chart and then forgets.

import {
    DRAWING_DASHES,
    DRAWING_WIDTHS,
    TEXT_SIZES,
    carriesText,
    hasFill,
    isColorKey,
    isCustomColor,
    type ColorKey,
    type Drawing,
    type DrawingDash,
    type DrawingWidth,
    type ShapeTool,
    type TextSize,
} from '@/lib/chart-drawings';

/** The fields a copy carries. Everything else — the geometry, the words, lock and visibility — stays with its drawing. */
export type CopiedStyle = {
    color?: ColorKey;
    customColor?: string;
    width?: DrawingWidth;
    dash?: DrawingDash;
    fill?: ColorKey;
    customFill?: string;
    fillOpacity?: number;
    textSize?: TextSize;
    bold?: boolean;
    italic?: boolean;
    background?: boolean;
    textColor?: ColorKey;
    customTextColor?: string;
};

const isWidth = (value: unknown): value is DrawingWidth =>
    typeof value === 'number' && (DRAWING_WIDTHS as readonly number[]).includes(value);
const isDash = (value: unknown): value is DrawingDash =>
    typeof value === 'string' && (DRAWING_DASHES as readonly string[]).includes(value);
const isTextSize = (value: unknown): value is TextSize =>
    typeof value === 'string' && (TEXT_SIZES as readonly string[]).includes(value);
const isFillStrength = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

/** The style a drawing is actually painted with, laid out in a fixed key order so two can be compared. */
export function copyStyleOf(drawing: Drawing): CopiedStyle {
    return {
        ...(isColorKey(drawing.color) ? { color: drawing.color } : {}),
        ...(isCustomColor(drawing.customColor) ? { customColor: drawing.customColor.toLowerCase() } : {}),
        ...(isWidth(drawing.width) ? { width: drawing.width } : {}),
        ...(isDash(drawing.dash) ? { dash: drawing.dash } : {}),
        ...(hasFill(drawing.tool) && isColorKey(drawing.fill) ? { fill: drawing.fill } : {}),
        ...(hasFill(drawing.tool) && isCustomColor(drawing.customFill) ? { customFill: drawing.customFill.toLowerCase() } : {}),
        ...(hasFill(drawing.tool) && isFillStrength(drawing.fillOpacity) ? { fillOpacity: drawing.fillOpacity } : {}),
        ...(carriesText(drawing.tool) && isTextSize(drawing.textSize) ? { textSize: drawing.textSize } : {}),
        ...(carriesText(drawing.tool) && drawing.bold === true ? { bold: true } : {}),
        ...(carriesText(drawing.tool) && drawing.italic === true ? { italic: true } : {}),
        ...(carriesText(drawing.tool) && drawing.background === true ? { background: true } : {}),
        ...(carriesText(drawing.tool) && isColorKey(drawing.textColor) ? { textColor: drawing.textColor } : {}),
        ...(carriesText(drawing.tool) && isCustomColor(drawing.customTextColor)
            ? { customTextColor: drawing.customTextColor.toLowerCase() }
            : {}),
    };
}

/** Which style fields mean anything on this tool. A width on a note is real; a fill on a line is not. */
function carries(style: CopiedStyle, tool: ShapeTool, key: keyof CopiedStyle): boolean {
    if (!(key in style)) return false;
    if (key === 'fill' || key === 'customFill' || key === 'fillOpacity') return hasFill(tool);
    if (
        key === 'textSize' ||
        key === 'bold' ||
        key === 'italic' ||
        key === 'background' ||
        key === 'textColor' ||
        key === 'customTextColor'
    ) {
        return carriesText(tool);
    }
    return true;
}

/**
 * Paint `drawing` with a copied style: the geometry and the words stay, every style field the tool
 * can show is replaced (so pasting a thin green line cannot leave a stale fill behind). A style
 * field the target cannot show is dropped rather than stored and ignored.
 */
export function applyCopiedStyle(drawing: Drawing, style: CopiedStyle): Drawing {
    const next: Drawing = { ...drawing };
    // Clear first: a paste is a whole look, not a merge with whatever was there.
    delete next.color;
    delete next.customColor;
    delete next.width;
    delete next.dash;
    delete next.fill;
    delete next.customFill;
    delete next.fillOpacity;
    delete next.textSize;
    delete next.bold;
    delete next.italic;
    delete next.background;
    delete next.textColor;
    delete next.customTextColor;
    for (const [key, value] of Object.entries(style) as [keyof CopiedStyle, unknown][]) {
        if (value === undefined || !carries(style, drawing.tool, key)) continue;
        // The type is already checked by copyStyleOf; this assignment is the one place that trusts it.
        (next as Record<string, unknown>)[key] = value;
    }
    return next;
}

/** Whether two drawings are painted the same way — what a "pasted" tick in the interface reads. */
export function sameStyle(a: Drawing, b: Drawing): boolean {
    return JSON.stringify(copyStyleOf(a)) === JSON.stringify(copyStyleOf(b));
}

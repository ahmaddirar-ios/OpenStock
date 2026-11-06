// Drawing geometry for the chart, kept apart from the canvas so it can be tested without a browser.
// Everything here works in screen pixels: the component converts a drawing's { time, price } points
// to pixels with the chart's own scales, then asks these helpers what the pointer is touching.
//
// The tool set follows the one the fork already shipped (trend / Fibonacci / Gann / patterns /
// Elliott counts / cycles / notes), reshaped onto this chart's single shape model: one tool
// registry drives how many clicks a shape needs, how it is drawn and what its points are called.

export type DrawPoint = { time: number; price: number };

/** How a shape is painted. Two tools can share a kind and differ only in their point count. */
export type ShapeKind =
    | 'trend'
    | 'horizontal'
    | 'rectangle'
    | 'xrect'
    | 'channel'
    | 'arrow'
    | 'pricetime'
    | 'ray'
    | 'extended'
    | 'hray'
    | 'vline'
    | 'cross'
    | 'trendangle'
    | 'info'
    | 'longpos'
    | 'shortpos'
    | 'pricerange'
    | 'daterange'
    | 'dprange'
    | 'projection'
    | 'fibext'
    | 'fibtrendext'
    | 'fibfan'
    | 'fibchannel'
    | 'fibtime'
    | 'fibarc'
    | 'fibspeed'
    | 'ellipse'
    | 'circle'
    | 'tri'
    | 'rotrect'
    | 'polyline'
    | 'arc'
    | 'curve'
    | 'dcurve'
    | 'fibspiral'
    | 'brush'
    | 'highlighter'
    | 'callout'
    | 'balloon'
    | 'signpost'
    | 'flag'
    | 'pricenote'
    | 'gannfan'
    | 'gannbox'
    | 'gannsquare'
    | 'pitchfork'
    | 'schiffpitchfork'
    | 'modpitchfork'
    | 'insidepitchfork'
    | 'regression'
    | 'flattop'
    | 'disjoint'
    | 'icon'
    | 'image'
    | 'bars'
    | 'avwap'
    | 'vprofile'
    | 'fib'
    | 'gann'
    | 'text'
    | 'poly'
    | 'hs'
    | 'triangle'
    | 'vlines'
    | 'sine';

export type ShapeTool =
    // lines and boxes
    | 'trend' | 'horizontal' | 'rectangle' | 'xrect' | 'channel' | 'arrow' | 'pricetime' | 'fib' | 'gann' | 'text'
    // the basic line family
    | 'ray' | 'extended' | 'hray' | 'vline' | 'cross' | 'trendangle' | 'info'
    // forecasts: positions, ranges and a projected move
    | 'longpos' | 'shortpos' | 'pricerange' | 'daterange' | 'dprange' | 'projection'
    // the Fibonacci family
    | 'fibext' | 'fibtrendext' | 'fibfan' | 'fibchannel' | 'fibtime' | 'fibarc' | 'fibspeed'
    // geometric shapes (a polyline is open-ended: it takes clicks until it is finished)
    | 'ellipse' | 'circle' | 'tri' | 'rotrect' | 'polyline' | 'arc' | 'curve' | 'dcurve'
    // Fibonacci spiral: a logarithmic curve through the golden ratio from a centre
    | 'fibspiral'
    // freehand strokes (drawn by dragging, not by clicking)
    | 'brush' | 'highlighter'
    // annotations: a label the trader writes, or the price at the point they marked
    | 'callout' | 'balloon' | 'signpost' | 'flag' | 'pricenote'
    // Gann, pitchforks and the measured channels
    | 'gannfan' | 'gannbox' | 'gannsquare' | 'pitchfork' | 'schiffpitchfork' | 'modpitchfork' | 'insidepitchfork'
    | 'regression' | 'flattop' | 'disjoint'
    // the exotics: a sticker, a pasted image, and the three tools that read the candles themselves
    | 'icon' | 'image' | 'bars' | 'avwap' | 'vprofile'
    // classical patterns
    | 'xabcd' | 'cypher' | 'hs' | 'abcd' | 'triangle' | 'drives3'
    // Elliott wave shapes
    | 'ew-impulse' | 'ew-abc' | 'ew-triangle' | 'ew-double' | 'ew-triple'
    // manual counts (labels come from the chosen degree)
    | 'ew-count' | 'ew-count-abc'
    // time cycles
    | 'cycles' | 'sine';

export type Drawing = {
    id: string;
    tool: ShapeTool;
    /** One point for a level or a label, two for a line or a box, more for a pattern. */
    points: DrawPoint[];
    /** Glyphs beside the points; patterns have defaults, counts supply their degree's set. */
    labels?: string[];
    /** The trader's own words, for the tools that carry them: the note and the annotation family. */
    text?: string;
    /** Palette key, not a raw colour, so the stored value cannot drift from the theme. */
    color?: ColorKey;
    /** Locked drawings still render and still select, but their points cannot be dragged. */
    locked?: boolean;
    /** Hidden drawings are kept, listed and remembered, but not painted — a chart decluttered. */
    hidden?: boolean;
    /** Stroke weight, 1–4; unset means the tool's own default. */
    width?: DrawingWidth;
    /** Stroke pattern, independent of the tool; unset keeps the tool's own (a level is dashed). */
    dash?: DrawingDash;
    /** Text size for the note family; unset means medium. Ignored by tools that carry no words. */
    textSize?: TextSize;
    /** Heavier glyphs, so a note can stand out from the rest of the markup. */
    bold?: boolean;
    /** Slanted glyphs, the third half of a text style. */
    italic?: boolean;
    /** Paint a chip behind a note, so it stays readable over candles. */
    background?: boolean;
    /** Glyph colour for the tools that carry words; unset means the stroke's own colour. */
    textColor?: ColorKey;
    /** A free colour (#rrggbb) that wins over the palette key, for the stroke. */
    customColor?: string;
    /** A free fill colour (#rrggbb) that wins over the fill palette key. */
    customFill?: string;
    /** A free glyph colour (#rrggbb) that wins over the text palette key. */
    customTextColor?: string;
    /** Fill palette key for the closed shapes; unset means the stroke's own colour. */
    fill?: ColorKey;
    /** Fill strength in percent (0 is invisible); unset means the tool's own look. */
    fillOpacity?: number;
    /** Interval ids this drawing is allowed on; empty or unset means every interval. */
    timeframes?: string[];
    /** Ratio list for the Fibonacci tools; unset keeps the classic set for that tool. */
    fibLevels?: number[];
};

/** The fill steps the toolbar offers, in percent. Zero is "no fill". */
export const FILL_OPACITIES = [0, 5, 10, 15, 20, 25, 30, 40, 50] as const;
const isFillOpacity = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

export const TEXT_SIZES = ['sm', 'md', 'lg'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** The sizes the renderer paints, in chart pixels. */
export const TEXT_FONT_PX: Record<TextSize, number> = { sm: 11, md: 12, lg: 15 };

/** How a note should be painted, with the defaults applied in one place. */
export const textStyleOf = (drawing: Pick<Drawing, 'textSize' | 'bold' | 'italic'>) => ({
    fontSize: TEXT_FONT_PX[drawing.textSize ?? 'md'],
    fontWeight: drawing.bold ? 700 : 500,
    fontStyle: drawing.italic ? 'italic' : 'normal',
});

/** The colour a drawing's words are painted in: its own, or the stroke's. */
export const textColorOf = (drawing: Pick<Drawing, 'textColor' | 'color' | 'tool' | 'customColor' | 'customTextColor'>): string =>
    isCustomColor(drawing.customTextColor)
        ? drawing.customTextColor.toLowerCase()
        : drawing.customColor && !drawing.color && !drawing.textColor
          ? drawing.customColor.toLowerCase()
          : DRAWING_COLORS[drawing.textColor ?? drawing.color ?? toolDef(drawing.tool).defaultColor];

/** The tool's own fill strength, so a box and a circle keep the look they had before fills were editable. */
const TOOL_FILL_DEFAULT: Partial<Record<ShapeTool, number>> = {
    rectangle: 12,
    xrect: 12,
    ellipse: 10,
    circle: 10,
    tri: 10,
    rotrect: 10,
};

/**
 * Whether a drawing belongs on this interval. An empty list means everywhere — the default, because
 * a level drawn on a daily chart is useful on an hourly one.
 */
export const visibleOn = (drawing: Pick<Drawing, 'timeframes'>, intervalId: string): boolean =>
    !drawing.timeframes || drawing.timeframes.length === 0 || drawing.timeframes.includes(intervalId);

/**
 * Shifts every point of a drawing by a time and a price offset — the whole shape moves, its shape
 * does not change. Used when a trader grabs the line itself rather than one of its handles.
 */
export function translateDrawing(drawing: Drawing, delta: { time: number; price: number }): Drawing {
    if (delta.time === 0 && delta.price === 0) return drawing;
    return {
        ...drawing,
        points: drawing.points.map((point) => ({
            ...point,
            time: point.time + delta.time,
            price: Math.max(0, point.price + delta.price),
        })),
    };
}

/** Whether this tool encloses an area at all: a trend line takes a stroke, not a fill. */
export const hasFill = (tool: ShapeTool): boolean => TOOL_FILL_DEFAULT[tool] !== undefined;

/** How a closed shape should be filled, with the palette and the default strength applied once. */
export function fillOf(
    drawing: Pick<Drawing, 'tool' | 'color' | 'fill' | 'fillOpacity' | 'customColor' | 'customFill'>,
): { color: string; opacity: number } {
    const color = isCustomColor(drawing.customFill)
        ? drawing.customFill.toLowerCase()
        : DRAWING_COLORS[drawing.fill ?? drawing.color ?? toolDef(drawing.tool).defaultColor];
    const opacity = drawing.fillOpacity ?? TOOL_FILL_DEFAULT[drawing.tool] ?? 0;
    return { color, opacity };
}

export const DRAWING_WIDTHS = [1, 2, 3, 4] as const;
export type DrawingWidth = (typeof DRAWING_WIDTHS)[number];

export type DrawingDash = 'solid' | 'dashed' | 'dotted';
export const DRAWING_DASHES: readonly DrawingDash[] = ['solid', 'dashed', 'dotted'];

const isWidth = (value: unknown): value is DrawingWidth =>
    typeof value === 'number' && (DRAWING_WIDTHS as readonly number[]).includes(value);
const isDash = (value: unknown): value is DrawingDash =>
    typeof value === 'string' && (DRAWING_DASHES as string[]).includes(value);
const isTextSize = (value: unknown): value is TextSize =>
    typeof value === 'string' && (TEXT_SIZES as readonly string[]).includes(value);

// --- colours ---------------------------------------------------------------

// A fixed palette, in hex: the same values lightweight-charts and the SVG agree on, and the same
// idea the fork used (cycle the colour of one drawing with a click).
export const DRAWING_COLORS = {
    blue: '#2962FF',
    orange: '#FF6D00',
    teal: '#26A69A',
    red: '#EF5350',
    violet: '#7E57C2',
    cyan: '#00BCD4',
    gold: '#EAB308',
    white: '#F0F3FA',
} as const;

export type ColorKey = keyof typeof DRAWING_COLORS;

export const COLOR_KEYS = Object.keys(DRAWING_COLORS) as ColorKey[];

export const isColorKey = (value: unknown): value is ColorKey =>
    typeof value === 'string' && (COLOR_KEYS as string[]).includes(value);

/** The next palette colour, wrapping round; without a current colour it starts at the first. */
export const nextColor = (current?: ColorKey): ColorKey => COLOR_KEYS[(COLOR_KEYS.indexOf(current as ColorKey) + 1) % COLOR_KEYS.length];

// --- the tool registry -----------------------------------------------------

export type ToolGroup = 'cursor' | 'lines' | 'fib' | 'gann' | 'patterns' | 'elliott' | 'forecast' | 'shapes' | 'annotation' | 'brush';

export type ToolDef = {
    tool: ShapeTool;
    group: ToolGroup;
    kind: ShapeKind;
    /** How many chart clicks place the shape. */
    clicks: number;
    /** Glyphs printed beside the points, when the tool has them. */
    pointLabels?: string[];
    defaultColor: ColorKey;
    /**
     * Retired from the rail, but still a valid tool. A stored drawing keeps painting and stays
     * selectable; nothing offers the tool again. Used when a richer tool replaces an older one.
     */
    hidden?: boolean;
};

export const TOOL_DEFS: ToolDef[] = [
    { tool: 'trend', group: 'lines', kind: 'trend', clicks: 2, defaultColor: 'blue' },
    { tool: 'horizontal', group: 'lines', kind: 'horizontal', clicks: 1, defaultColor: 'blue' },
    { tool: 'rectangle', group: 'lines', kind: 'rectangle', clicks: 2, defaultColor: 'blue' },
    { tool: 'xrect', group: 'lines', kind: 'xrect', clicks: 2, defaultColor: 'blue' },
    { tool: 'channel', group: 'lines', kind: 'channel', clicks: 3, defaultColor: 'violet' },
    { tool: 'arrow', group: 'lines', kind: 'arrow', clicks: 2, defaultColor: 'orange' },
    { tool: 'pricetime', group: 'lines', kind: 'pricetime', clicks: 2, defaultColor: 'white' },

    // The basic line family: one segment whose far end the chart's edges decide.
    { tool: 'ray', group: 'lines', kind: 'ray', clicks: 2, defaultColor: 'blue' },
    { tool: 'extended', group: 'lines', kind: 'extended', clicks: 2, defaultColor: 'blue' },
    { tool: 'hray', group: 'lines', kind: 'hray', clicks: 1, defaultColor: 'blue' },
    { tool: 'vline', group: 'lines', kind: 'vline', clicks: 1, defaultColor: 'white' },
    // A cross is fixed by one point: the renderer draws both arms from it, so a second click would
    // only move a crosshair that is already complete.
    { tool: 'cross', group: 'lines', kind: 'cross', clicks: 1, defaultColor: 'white' },
    { tool: 'trendangle', group: 'lines', kind: 'trendangle', clicks: 2, defaultColor: 'violet' },
    { tool: 'info', group: 'lines', kind: 'info', clicks: 2, defaultColor: 'white' },

    // Forecasts: a position sizes a trade, a range measures one, a projection repeats a move.
    { tool: 'longpos', group: 'forecast', kind: 'longpos', clicks: 3, defaultColor: 'teal' },
    { tool: 'shortpos', group: 'forecast', kind: 'shortpos', clicks: 3, defaultColor: 'red' },
    { tool: 'pricerange', group: 'forecast', kind: 'pricerange', clicks: 2, defaultColor: 'blue' },
    { tool: 'daterange', group: 'forecast', kind: 'daterange', clicks: 2, defaultColor: 'blue' },
    { tool: 'dprange', group: 'forecast', kind: 'dprange', clicks: 2, defaultColor: 'blue' },
    { tool: 'projection', group: 'forecast', kind: 'projection', clicks: 2, defaultColor: 'orange' },
    { tool: 'fib', group: 'fib', kind: 'fib', clicks: 2, defaultColor: 'gold' },

    // The rest of the Fibonacci family: the retracement shipped first, these are the readings
    // built on it — extensions, a fan, a channel, time zones, arcs and the speed fan.
    { tool: 'fibext', group: 'fib', kind: 'fibext', clicks: 3, defaultColor: 'gold' },
    { tool: 'fibtrendext', group: 'fib', kind: 'fibtrendext', clicks: 3, defaultColor: 'gold' },
    { tool: 'fibfan', group: 'fib', kind: 'fibfan', clicks: 2, defaultColor: 'gold' },
    { tool: 'fibchannel', group: 'fib', kind: 'fibchannel', clicks: 3, defaultColor: 'gold' },
    { tool: 'fibtime', group: 'fib', kind: 'fibtime', clicks: 2, defaultColor: 'cyan' },
    { tool: 'fibarc', group: 'fib', kind: 'fibarc', clicks: 3, defaultColor: 'gold' },
    { tool: 'fibspeed', group: 'fib', kind: 'fibspeed', clicks: 2, defaultColor: 'violet' },
    // The spiral: a centre, then a point that sets the first radius and the starting angle.
    { tool: 'fibspiral', group: 'fib', kind: 'fibspiral', clicks: 2, defaultColor: 'gold' },

    // Geometric shapes. A polyline is open-ended (`clicks: 0`): it keeps taking points until the
    // trader double-clicks to finish it.
    { tool: 'ellipse', group: 'shapes', kind: 'ellipse', clicks: 2, defaultColor: 'cyan' },
    { tool: 'circle', group: 'shapes', kind: 'circle', clicks: 2, defaultColor: 'cyan' },
    { tool: 'tri', group: 'shapes', kind: 'tri', clicks: 3, defaultColor: 'cyan' },
    // A box that can be turned: two corners set the width, the third lifts the height off the base
    // line, so the rectangle is free to sit at any angle.
    { tool: 'rotrect', group: 'shapes', kind: 'rotrect', clicks: 3, defaultColor: 'cyan' },
    { tool: 'polyline', group: 'shapes', kind: 'polyline', clicks: 0, defaultColor: 'cyan' },
    { tool: 'arc', group: 'shapes', kind: 'arc', clicks: 3, defaultColor: 'cyan' },
    { tool: 'curve', group: 'shapes', kind: 'curve', clicks: 3, defaultColor: 'cyan' },
    { tool: 'dcurve', group: 'shapes', kind: 'dcurve', clicks: 4, defaultColor: 'cyan' },

    // Freehand: open-ended like the polyline, but drawn by dragging rather than clicking.
    { tool: 'brush', group: 'brush', kind: 'brush', clicks: 0, defaultColor: 'white' },
    { tool: 'highlighter', group: 'brush', kind: 'highlighter', clicks: 0, defaultColor: 'gold' },

    // The original Gann box. The richer gannbox (rectangle, diagonals and the fan of angles) took
    // its place in the rail, so it is retired: stored drawings still paint, nothing offers it.
    { tool: 'gann', group: 'gann', kind: 'gann', clicks: 2, defaultColor: 'violet', hidden: true },
    { tool: 'text', group: 'annotation', kind: 'text', clicks: 1, defaultColor: 'white' },
    // Annotations. The first two are two clicks (the point, then where the label sits); the price
    // markers are one click and read their own price.
    { tool: 'callout', group: 'annotation', kind: 'callout', clicks: 2, defaultColor: 'white' },
    { tool: 'balloon', group: 'annotation', kind: 'balloon', clicks: 2, defaultColor: 'gold' },
    { tool: 'signpost', group: 'annotation', kind: 'signpost', clicks: 1, defaultColor: 'cyan' },
    { tool: 'flag', group: 'annotation', kind: 'flag', clicks: 1, defaultColor: 'orange' },
    { tool: 'pricenote', group: 'annotation', kind: 'pricenote', clicks: 1, defaultColor: 'white' },

    // Gann, pitchforks and the measured channels: the same group the design put them in.
    { tool: 'gannfan', group: 'gann', kind: 'gannfan', clicks: 2, defaultColor: 'violet' },
    { tool: 'gannbox', group: 'gann', kind: 'gannbox', clicks: 2, defaultColor: 'violet' },
    { tool: 'gannsquare', group: 'gann', kind: 'gannsquare', clicks: 2, defaultColor: 'violet' },
    { tool: 'pitchfork', group: 'gann', kind: 'pitchfork', clicks: 3, defaultColor: 'gold' },
    { tool: 'schiffpitchfork', group: 'gann', kind: 'schiffpitchfork', clicks: 3, defaultColor: 'gold' },
    { tool: 'modpitchfork', group: 'gann', kind: 'modpitchfork', clicks: 3, defaultColor: 'gold' },
    { tool: 'insidepitchfork', group: 'gann', kind: 'insidepitchfork', clicks: 3, defaultColor: 'gold' },
    { tool: 'regression', group: 'gann', kind: 'regression', clicks: 2, defaultColor: 'teal' },
    { tool: 'flattop', group: 'gann', kind: 'flattop', clicks: 2, defaultColor: 'cyan' },
    { tool: 'disjoint', group: 'gann', kind: 'disjoint', clicks: 3, defaultColor: 'violet' },

    // The exotics. A sticker marks a point and is re-worded by the same double click a note uses; an
    // image is pasted by its web address. The three volume tools read the candles: a bars pattern
    // copies a range of them forward, an anchored VWAP averages them from its anchor, and a volume
    // profile counts a range's volume into price rows.
    { tool: 'icon', group: 'annotation', kind: 'icon', clicks: 1, defaultColor: 'gold' },
    { tool: 'image', group: 'annotation', kind: 'image', clicks: 2, defaultColor: 'white' },
    { tool: 'bars', group: 'forecast', kind: 'bars', clicks: 3, defaultColor: 'teal' },
    { tool: 'avwap', group: 'forecast', kind: 'avwap', clicks: 1, defaultColor: 'violet' },
    { tool: 'vprofile', group: 'forecast', kind: 'vprofile', clicks: 2, defaultColor: 'cyan' },

    { tool: 'xabcd', group: 'patterns', kind: 'poly', clicks: 5, pointLabels: ['X', 'A', 'B', 'C', 'D'], defaultColor: 'teal' },
    { tool: 'cypher', group: 'patterns', kind: 'poly', clicks: 5, pointLabels: ['X', 'A', 'B', 'C', 'D'], defaultColor: 'teal' },
    { tool: 'hs', group: 'patterns', kind: 'hs', clicks: 5, pointLabels: ['LS', 'N1', 'H', 'N2', 'RS'], defaultColor: 'teal' },
    { tool: 'abcd', group: 'patterns', kind: 'poly', clicks: 4, pointLabels: ['A', 'B', 'C', 'D'], defaultColor: 'teal' },
    { tool: 'triangle', group: 'patterns', kind: 'triangle', clicks: 4, pointLabels: ['1', '2', '3', '4'], defaultColor: 'teal' },
    { tool: 'drives3', group: 'patterns', kind: 'poly', clicks: 3, pointLabels: ['1', '2', '3'], defaultColor: 'teal' },

    { tool: 'ew-impulse', group: 'elliott', kind: 'poly', clicks: 6, pointLabels: ['0', '1', '2', '3', '4', '5'], defaultColor: 'cyan' },
    { tool: 'ew-abc', group: 'elliott', kind: 'poly', clicks: 4, pointLabels: ['0', 'A', 'B', 'C'], defaultColor: 'cyan' },
    { tool: 'ew-triangle', group: 'elliott', kind: 'poly', clicks: 6, pointLabels: ['0', 'A', 'B', 'C', 'D', 'E'], defaultColor: 'cyan' },
    { tool: 'ew-double', group: 'elliott', kind: 'poly', clicks: 4, pointLabels: ['0', 'W', 'X', 'Y'], defaultColor: 'cyan' },
    { tool: 'ew-triple', group: 'elliott', kind: 'poly', clicks: 6, pointLabels: ['0', 'W', 'X', 'Y', 'X', 'Z'], defaultColor: 'cyan' },

    { tool: 'ew-count', group: 'elliott', kind: 'poly', clicks: 5, defaultColor: 'teal' },
    { tool: 'ew-count-abc', group: 'elliott', kind: 'poly', clicks: 3, defaultColor: 'orange' },

    { tool: 'cycles', group: 'gann', kind: 'vlines', clicks: 2, defaultColor: 'white' },
    { tool: 'sine', group: 'gann', kind: 'sine', clicks: 2, defaultColor: 'violet' },
];

export const TOOL_BY_ID: Record<ShapeTool, ToolDef> = Object.fromEntries(TOOL_DEFS.map((d) => [d.tool, d])) as Record<
    ShapeTool,
    ToolDef
>;

export const TOOL_IDS = TOOL_DEFS.map((d) => d.tool);

export const isShapeTool = (value: unknown): value is ShapeTool => typeof value === 'string' && value in TOOL_BY_ID;

export const toolDef = (tool: ShapeTool): ToolDef => TOOL_BY_ID[tool];

/** How many chart clicks the tool needs; shapes with one point are placed in a single click, and an
 *  open-ended tool (a polyline, a freehand stroke) reports 0 because it takes points until the
 *  trader finishes it. */
export const pointsNeeded = (tool: ShapeTool): number => toolDef(tool).clicks;

/**
 * Tools whose drawing carries the trader's own words (a note, a callout, a balloon, a flag): the
 * chart stores their text and re-opens the editor on a double click. The price markers derive their
 * label instead, so nothing of theirs has to be stored.
 */
const TEXT_TOOLS = new Set<ShapeTool>(['text', 'callout', 'balloon', 'signpost', 'flag', 'icon', 'image']);
export const carriesText = (tool: ShapeTool): boolean => TEXT_TOOLS.has(tool);

/** A price the way the chart prints it: two decimals, thousands separated. */
export const priceLabel = (price: number): string =>
    price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The words a freshly placed annotation carries. A note, a callout and a balloon take what the
 * trader typed (and fall back to the price so the label is never empty); a signpost or a flag is a
 * price marker, so it starts with its own price and ignores whatever the note field still held —
 * a double click edits it afterwards. Tools with no text carry none.
 */
export function annotationText(tool: ShapeTool, price: number, typed?: string | null): string | undefined {
    if (!carriesText(tool)) return undefined;
    if (tool === 'signpost' || tool === 'flag') return priceLabel(price);
    // A sticker starts on the first glyph of the set; an image starts empty until its address is
    // pasted, because a price would not be an address.
    if (tool === 'icon') return cleanText(typed ?? '') ?? ICON_GLYPHS[0];
    if (tool === 'image') return cleanText(typed ?? '', IMAGE_DATA_MAX) ?? undefined;
    return cleanText(typed ?? '') ?? priceLabel(price);
}

/** Freehand tools are drawn by dragging the pointer, not by clicking point after point. */
export const isFreehand = (tool: ShapeTool): boolean => toolDef(tool).kind === 'brush' || toolDef(tool).kind === 'highlighter';

/** The most points an open-ended stroke keeps, so a freehand line cannot fill the storage quota. */
export const MAX_STROKE_POINTS = 240;

/** The tools a flyout offers. A retired tool is skipped here but still paints and still parses. */
export const toolsInGroup = (group: ToolGroup): ToolDef[] => TOOL_DEFS.filter((d) => d.group === group && !d.hidden);

/** Which end of the pile a drawing is moved to. The list's order *is* the stacking: see layerDrawings. */
export type LayerMove = 'front' | 'back';

/**
 * Moves a drawing to the top or the bottom of the pile and returns the new list. The SVG paints its
 * children in order, so the end of the list is what the trader sees on top. A move that would change
 * nothing returns the same array, so the caller's history does not record an empty step.
 */
export function layerDrawings(list: Drawing[], id: string, move: LayerMove): Drawing[] {
    const index = list.findIndex((d) => d.id === id);
    if (index === -1) return list;
    const last = list.length - 1;
    if ((move === 'front' && index === last) || (move === 'back' && index === 0)) return list;
    const drawing = list[index];
    return move === 'front' ? [...list.filter((d) => d.id !== id), drawing] : [drawing, ...list.filter((d) => d.id !== id)];
}

export const newDrawingId = (): string => Math.random().toString(36).slice(2, 10);

/** The two rails of a parallel channel: the base through the first two points, and the copy of it
 *  that passes through the third point (the one that sets the width). */
export function channelRails(a: DrawPoint, b: DrawPoint, c: DrawPoint): { base: [DrawPoint, DrawPoint]; parallel: [DrawPoint, DrawPoint] } {
    const offset = { time: c.time - b.time, price: c.price - b.price };
    return {
        base: [a, b],
        parallel: [
            { time: a.time + offset.time, price: a.price + offset.price },
            { time: b.time + offset.time, price: b.price + offset.price },
        ],
    };
}

/** What a price/time box measures: the move in price and the span in seconds, signed. */
export function measureSpan(a: DrawPoint, b: DrawPoint): { price: number; seconds: number } {
    return { price: b.price - a.price, seconds: b.time - a.time };
}

// --- the basic line family -------------------------------------------------
// Every tool below paints one segment; what differs is where its far end sits and one click
// count. The helpers return the *ends* of that segment in chart space, so the painter only
// draws a line between two points and never has to know about the visible range.

/** The price of the line through `a` and `b` at `time` (the pair must not be vertical). */
const priceAt = (a: DrawPoint, b: DrawPoint, time: number): number =>
    a.price + ((b.price - a.price) * (time - a.time)) / (b.time - a.time);

/** The far end of a ray drawn from `a` through `b` and continued to the edge of the visible range.
 *  `edgeTime` is the time at the edge the ray is heading for, so a ray aimed leftwards takes the
 *  left edge and one aimed rightwards the right edge. A vertical pair has no direction to extend,
 *  and an edge that is already behind the second point leaves the segment as it was clicked. */
export function rayEnd(a: DrawPoint, b: DrawPoint, edgeTime: number): DrawPoint {
    if (b.time === a.time) return b;
    const rightward = b.time > a.time;
    const edgeIsBehind = rightward ? edgeTime <= b.time : edgeTime >= b.time;
    if (edgeIsBehind) return b;
    return { time: edgeTime, price: priceAt(a, b, edgeTime) };
}

/** Both ends of the line through `a` and `b`, extended to the chart's first and last visible bars.
 *  The result is always in time order, whichever way the two points were clicked. */
export function extendedEnds(a: DrawPoint, b: DrawPoint, minTime: number, maxTime: number): [DrawPoint, DrawPoint] {
    if (b.time === a.time) return [a, b];
    return [
        { time: minTime, price: priceAt(a, b, minTime) },
        { time: maxTime, price: priceAt(a, b, maxTime) },
    ];
}

/** The angle of the line a→b as the trader reads it: screen pixels above horizontal, signed.
 *  The scale is the chart's own (pixels per second and pixels per price unit), so the number
 *  matches the slope the eye sees rather than the raw time/price delta. The line is always
 *  measured left to right, so the same line clicked backwards reads the same. */
export function trendAngleDeg(a: DrawPoint, b: DrawPoint, scale: { pxPerTime: number; pxPerPrice: number }): number {
    let dx = (b.time - a.time) * scale.pxPerTime;
    let dy = (b.price - a.price) * scale.pxPerPrice;
    if (dx < 0) {
        dx = -dx;
        dy = -dy;
    }
    return (Math.atan2(dy, dx) * 180) / Math.PI;
}

// --- forecasts: positions, ranges and projection ----------------------------
// A position is three points (entry, target, stop) and what a trader needs from it is a ratio;
// a range is two points and what is needed is the move between them; a projection is that same
// move repeated. All of it is arithmetic on prices and times, so it lives here.

export type PositionZones = {
    /** The profitable box, entry → target. */
    profit: [DrawPoint, DrawPoint];
    /** The losing box, entry → stop, forced to the same width as the profit box. */
    loss: [DrawPoint, DrawPoint];
    /** Both legs as positive price amounts, with the reward-to-risk ratio they make. */
    reward: number;
    risk: number;
    /** reward / risk; `Infinity` when the stop sits exactly on the entry. */
    ratio: number;
    /** What the risk is worth as a percentage of the entry price. */
    riskPercent: number;
};

/** Size a trade from the three points the position tools place. A long and a short read the same
 *  way round — a short is simply a position whose target sits below its entry and whose stop sits
 *  above. Both boxes share the target's time width, because TradingView's position is one box: a
 *  stop dragged sideways must not skew it. */
export function positionZones(entry: DrawPoint, target: DrawPoint, stop: DrawPoint): PositionZones {
    const width = target.time - entry.time;
    const reward = Math.abs(target.price - entry.price);
    const risk = Math.abs(entry.price - stop.price);
    return {
        profit: [entry, target],
        loss: [entry, { time: entry.time + width, price: stop.price }],
        reward,
        risk,
        ratio: risk === 0 ? Infinity : reward / risk,
        riskPercent: entry.price === 0 ? 0 : (risk / Math.abs(entry.price)) * 100,
    };
}

export type RangeReadout = { price: number; percent: number; seconds: number; bars: number };

/** What a range measures: the price move (signed), that move as a percentage of where it started,
 *  the time it spans, and how many bars of the interval on screen that is. `barSeconds` is 0 when
 *  the interval is unknown, which counts no bars rather than guessing one. */
export function rangeReadout(a: DrawPoint, b: DrawPoint, barSeconds: number): RangeReadout {
    const { price, seconds } = measureSpan(a, b);
    return {
        price,
        percent: a.price === 0 ? 0 : (price / a.price) * 100,
        seconds,
        bars: barSeconds > 0 ? Math.round(Math.abs(seconds) / barSeconds) : 0,
    };
}


// --- Gann, pitchforks and the measured channels ------------------------------
// Gann's angles measure one trend against itself, a pitchfork measures a trend against the
// retracement that followed it, and the measured channels fit the candles the trader selected.
// Each helper returns the lines; the painter draws them.

/** The Gann angles, as multiples of the trend the trader clicked (1x1 is the trend itself). */
export const GANN_RATIOS = [0.125, 0.25, 0.3333, 0.5, 1, 2, 3, 4, 8] as const;

/** Every Gann angle from `a` through `b`, continued to the edge of the visible range. */
export function gannFanEnds(a: DrawPoint, b: DrawPoint, edgeTime: number, ratios: readonly number[] = GANN_RATIOS): { ratio: number; end: DrawPoint }[] {
    if (b.time === a.time || edgeTime === a.time) return [];
    const slope = (b.price - a.price) / (b.time - a.time);
    return ratios.map((ratio) => ({ ratio, end: { time: edgeTime, price: a.price + slope * ratio * (edgeTime - a.time) } }));
}

/** The Gann box: the trader's rectangle, its two diagonals, and the fan of angles inside it. */
export function gannBoxGuides(a: DrawPoint, b: DrawPoint): {
    corners: [DrawPoint, DrawPoint];
    diagonals: [[DrawPoint, DrawPoint], [DrawPoint, DrawPoint]];
    fan: { ratio: number; end: DrawPoint }[];
} {
    const topLeft = { time: Math.min(a.time, b.time), price: Math.max(a.price, b.price) };
    const bottomRight = { time: Math.max(a.time, b.time), price: Math.min(a.price, b.price) };
    return {
        corners: [topLeft, bottomRight],
        diagonals: [
            [a, b],
            [{ time: topLeft.time, price: topLeft.price }, { time: bottomRight.time, price: bottomRight.price }],
        ],
        fan: gannFanEnds(a, b, b.time),
    };
}

/** The Gann square: a square in pixels, its diagonals and the midlines. Drawn by the painter, which
 *  is the only place that knows the scale, so only the rule for the corner lives here. */
export function gannSquareCorner(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
    const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    const signX = b.x >= a.x ? 1 : -1;
    const signY = b.y >= a.y ? 1 : -1;
    return { x: a.x + side * signX, y: a.y + side * signY };
}

export type PitchforkVariant = 'andrews' | 'schiff' | 'modified' | 'inside';

/** The three lines of a pitchfork: the median, and its two parallels through the outer points. */
export function pitchforkLines(a: DrawPoint, b: DrawPoint, c: DrawPoint, variant: PitchforkVariant = 'andrews'): {
    pivot: DrawPoint;
    median: [DrawPoint, DrawPoint];
    upper: [DrawPoint, DrawPoint];
    lower: [DrawPoint, DrawPoint];
} {
    const mid = (p: DrawPoint, q: DrawPoint): DrawPoint => ({ time: (p.time + q.time) / 2, price: (p.price + q.price) / 2 });
    // The pivot is where the median starts: Andrews at the first point, Schiff half of the price leg
    // earlier, the modified and inside variants at the midpoint of the first two points.
    const pivot =
        variant === 'andrews'
            ? a
            : variant === 'schiff'
              ? { time: a.time, price: (a.price + b.price) / 2 }
              : mid(a, b);
    const target = variant === 'inside' ? c : mid(b, c);
    const slope = { time: target.time - pivot.time, price: target.price - pivot.price };
    const through = (point: DrawPoint): [DrawPoint, DrawPoint] => [point, { time: point.time + slope.time, price: point.price + slope.price }];
    return {
        pivot,
        median: through(pivot),
        upper: through(b),
        lower: through(c),
    };
}

/** A least-squares channel through the candles between the two points, with ±2σ bands. Falls back to
 *  the plain move when there are too few candles to fit anything. */
export function regressionChannel(
    a: DrawPoint,
    b: DrawPoint,
    candles: readonly { time: number; close: number }[],
): { line: [DrawPoint, DrawPoint]; upper: [DrawPoint, DrawPoint]; lower: [DrawPoint, DrawPoint]; sigma: number; slope: number } {
    const from = Math.min(a.time, b.time);
    const to = Math.max(a.time, b.time);
    const inside = candles.filter((candle) => candle.time >= from && candle.time <= to);
    const plain = { line: [a, b] as [DrawPoint, DrawPoint], sigma: 0, slope: (b.price - a.price) / Math.max(1, b.time - a.time) };
    if (inside.length < 3) return { ...plain, upper: [a, b], lower: [a, b] };

    // Time is rebased to seconds from the first candle so the sums stay small.
    const t0 = inside[0].time;
    const xs = inside.map((candle) => candle.time - t0);
    const ys = inside.map((candle) => candle.close);
    const n = xs.length;
    const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
    const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
    const sxx = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
    const sxY = xs.reduce((sum, x, i) => sum + (x - meanX) * (ys[i] - meanY), 0);
    const slope = sxx === 0 ? 0 : sxY / sxx;
    const intercept = meanY - slope * meanX;
    const priceAt = (time: number): number => intercept + slope * (time - t0);
    const sigma = Math.sqrt(xs.reduce((sum, x, i) => sum + (ys[i] - priceAt(inside[i].time)) ** 2, 0) / n);

    const ends: [DrawPoint, DrawPoint] = [
        { time: from, price: priceAt(from) },
        { time: to, price: priceAt(to) },
    ];
    return {
        line: ends,
        upper: [{ time: from, price: priceAt(from) + sigma * 2 }, { time: to, price: priceAt(to) + sigma * 2 }],
        lower: [{ time: from, price: priceAt(from) - sigma * 2 }, { time: to, price: priceAt(to) - sigma * 2 }],
        sigma,
        slope,
    };
}

/** A flat channel: the two prices the trader marked, held across the span they marked. */
export function flattenLines(a: DrawPoint, b: DrawPoint): { top: [DrawPoint, DrawPoint]; bottom: [DrawPoint, DrawPoint] } {
    const from = Math.min(a.time, b.time);
    const to = Math.max(a.time, b.time);
    const high = Math.max(a.price, b.price);
    const low = Math.min(a.price, b.price);
    return {
        top: [{ time: from, price: high }, { time: to, price: high }],
        bottom: [{ time: from, price: low }, { time: to, price: low }],
    };
}

/** A channel whose second rail is the first one carried to the third point: the two rails need not
 *  cover the same stretch of time, which is what makes it disjoint. */
export function disjointChannel(a: DrawPoint, b: DrawPoint, c: DrawPoint): { base: [DrawPoint, DrawPoint]; parallel: [DrawPoint, DrawPoint] } {
    const move = { time: b.time - a.time, price: b.price - a.price };
    return { base: [a, b], parallel: [c, { time: c.time + move.time, price: c.price + move.price }] };
}

// --- the volume-based tools --------------------------------------------------
// These read the candles themselves, not just the two points the trader clicked: a VWAP averages the
// typical price by volume from its anchor forward, and a volume profile counts the volume of a range
// into price rows. The window is the series on screen — the same one the chart is drawing.

/** The candle fields the volume tools need; the chart's own candle set already has them. */
export type DrawCandle = { time: number; open: number; high: number; low: number; close: number; volume: number };

/** The candles inside a time range, in order — what a profile or a copied pattern is built from. */
export function candlesBetween(candles: readonly DrawCandle[], fromTime: number, toTime: number): DrawCandle[] {
    const from = Math.min(fromTime, toTime);
    const to = Math.max(fromTime, toTime);
    return candles.filter((candle) => candle.time >= from && candle.time <= to);
}

/**
 * Anchored VWAP: from the anchor bar forward, the volume-weighted average of each bar's typical price
 * (high + low + close over three, the usual reading). A bar with no volume counts as one unit, so the
 * line keeps moving on a symbol the feed reports no volume for instead of freezing at its anchor.
 */
export function anchoredVwap(candles: readonly DrawCandle[], anchorTime: number): { time: number; value: number }[] {
    const start = candles.findIndex((candle) => candle.time >= anchorTime);
    if (start === -1) return [];
    let weighted = 0;
    let volume = 0;
    const line: { time: number; value: number }[] = [];
    for (let i = start; i < candles.length; i += 1) {
        const candle = candles[i];
        const typical = (candle.high + candle.low + candle.close) / 3;
        const weight = candle.volume > 0 ? candle.volume : 1;
        weighted += typical * weight;
        volume += weight;
        line.push({ time: candle.time, value: weighted / volume });
    }
    return line;
}

/** A VWAP point with its standard-deviation bands. */
export type VwapBandPoint = {
    time: number;
    value: number;
    upper1: number;
    lower1: number;
    upper2: number;
    lower2: number;
};

/**
 * Anchored VWAP with ±1σ and ±2σ bands. The deviation is volume-weighted around the running VWAP,
 * so a bar that traded heavily pulls the band tighter than a quiet one. Bands are what turn a VWAP
 * from a line into a channel: price at the second band is stretched, price at the line is fair.
 */
export function anchoredVwapBands(candles: readonly DrawCandle[], anchorTime: number): VwapBandPoint[] {
    const start = candles.findIndex((candle) => candle.time >= anchorTime);
    if (start === -1) return [];
    let weighted = 0;
    let weightedSq = 0;
    let volume = 0;
    const line: VwapBandPoint[] = [];
    for (let i = start; i < candles.length; i += 1) {
        const candle = candles[i];
        const typical = (candle.high + candle.low + candle.close) / 3;
        const weight = candle.volume > 0 ? candle.volume : 1;
        weighted += typical * weight;
        weightedSq += typical * typical * weight;
        volume += weight;
        const mean = weighted / volume;
        // Clamp the variance at zero: floating-point noise can make it a hair negative.
        const variance = Math.max(0, weightedSq / volume - mean * mean);
        const sd = Math.sqrt(variance);
        line.push({
            time: candle.time,
            value: mean,
            upper1: mean + sd,
            lower1: mean - sd,
            upper2: mean + 2 * sd,
            lower2: mean - 2 * sd,
        });
    }
    return line;
}

/** One price row of a volume profile: the volume traded in the band around `price`. */
export type ProfileRow = { price: number; volume: number };

/** The band that holds the bulk of the volume, and the row that traded most. */
export type ProfileValueArea = { high: number; low: number; percent: number };

/**
 * The value area: the contiguous run of rows around the point of control that holds `percent` of
 * the range's volume (70% is the convention). Rows are added one at a time, always the larger of the
 * two neighbours, which is how the profile is read on a trading floor.
 */
export function valueArea(rows: ProfileRow[], step: number, percent = 0.7): ProfileValueArea | null {
    if (rows.length === 0) return null;
    const total = rows.reduce((sum, row) => sum + row.volume, 0);
    if (total <= 0) return null;

    let poc = 0;
    for (let i = 1; i < rows.length; i += 1) if (rows[i].volume > rows[poc].volume) poc = i;

    let top = poc;
    let bottom = poc;
    let held = rows[poc].volume;
    const target = total * percent;

    while (held < target && (top > 0 || bottom < rows.length - 1)) {
        const above = top > 0 ? rows[top - 1].volume : -1;
        const below = bottom < rows.length - 1 ? rows[bottom + 1].volume : -1;
        if (above < 0 && below < 0) break;
        if (above >= below) {
            top -= 1;
            held += rows[top].volume;
        } else {
            bottom += 1;
            held += rows[bottom].volume;
        }
    }

    return {
        high: rows[top].price + step / 2,
        low: rows[bottom].price - step / 2,
        percent: Math.round((held / total) * 1000) / 10,
    };
}

/**
 * Volume by price over a range. Each candle's volume is spread evenly across the rows its high–low
 * spans, which is how a profile reads a long bar as covering its whole range rather than one price.
 * Rows come back from the highest price down, the way the histogram is drawn.
 */
export function volumeProfile(
    candles: readonly DrawCandle[],
    fromTime: number,
    toTime: number,
    rowCount = 24,
): {
    rows: ProfileRow[];
    max: number;
    step: number;
    from: number;
    to: number;
    /** The price of the row that traded most, or null for an empty profile. */
    poc: number | null;
    /** The band holding 70% of the volume, or null for an empty profile. */
    valueArea: ProfileValueArea | null;
} {
    const inside = candlesBetween(candles, fromTime, toTime);
    if (inside.length === 0 || rowCount < 1) {
        return { rows: [], max: 0, step: 0, from: 0, to: 0, poc: null, valueArea: null };
    }
    const high = Math.max(...inside.map((candle) => candle.high));
    const low = Math.min(...inside.map((candle) => candle.low));
    const step = (high - low) / rowCount || 1;
    const buckets = new Array(rowCount).fill(0);
    for (const candle of inside) {
        // The rows this candle covers. A candle that spans one row puts everything in it.
        const first = Math.min(rowCount - 1, Math.max(0, Math.floor((candle.low - low) / step)));
        const last = Math.min(rowCount - 1, Math.max(0, Math.floor((candle.high - low) / step)));
        const share = candle.volume / (last - first + 1);
        for (let row = first; row <= last; row += 1) buckets[row] += share;
    }
    // Row 0 is the bottom band; the histogram is drawn top-down.
    const rows = buckets
        .map((volume, index) => ({ price: low + step * (index + 0.5), volume }))
        .reverse();
    const max = Math.max(...buckets);
    const poc = rows.find((row) => row.volume === max)?.price ?? null;
    return {
        rows,
        max,
        step,
        from: Math.min(fromTime, toTime),
        to: Math.max(fromTime, toTime),
        poc,
        valueArea: valueArea(rows, step),
    };
}

/** The glyphs the sticker tool cycles through — the small set a trader marks a chart with. */
export const ICON_GLYPHS = ['★', '⚑', '✔', '✖', '↑', '↓', '⚡', '!' ] as const;

/**
 * An image is drawn from a plain web address, or from a picture the trader picked off their own
 * machine (a `data:image/...;base64,` payload). A local path is never accepted: the browser cannot
 * read it, and a stored path would break on every other device. The data payload is capped so one
 * picture cannot fill the browser's storage.
 */
export const IMAGE_DATA_MAX = 400_000;

export const isImageUrl = (value: string): boolean => {
    const text = value.trim();
    if (/^https?:\/\/[^\s]+$/i.test(text)) return true;
    return text.length <= IMAGE_DATA_MAX && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(text);
};

/** The far end of a projection: the a→b move repeated `steps` times forward from b, drawn as the
 *  dotted continuation a trader reads as "if this move runs again". */
export function projectionEnds(a: DrawPoint, b: DrawPoint, steps: number): [DrawPoint, DrawPoint] {
    if (steps <= 0) return [a, b];
    return [b, { time: b.time + (b.time - a.time) * steps, price: b.price + (b.price - a.price) * steps }];
}

// --- the rest of the Fibonacci family ---------------------------------------
// The retracement (levels between two points) shipped first. Extensions measure past the second
// point, a fan spreads the same ratios from one point, a channel carries the base line through a
// third point, time zones walk the sequence forward, arcs size themselves from the base move, and
// the speed fan draws the slope at thirds. Each is one pure function; the painter only draws.

/** Ratios an extension reads past 100%, plus the retracement levels it starts from. */
export const FIB_EXT_RATIOS = [0, 0.618, 1, 1.272, 1.618, 2, 2.618, 3.618] as const;

/** The trend-based extension starts at the retracement, as TradingView's does. */
export const FIB_TREND_EXT_RATIOS = [0.618, 1, 1.618, 2.618] as const;

/** Extension levels: the a→b move measured from the third point, one line per ratio. */
export function fibExtension(a: DrawPoint, b: DrawPoint, c: DrawPoint, ratios: readonly number[] = FIB_EXT_RATIOS): FibLevel[] {
    const move = b.price - a.price;
    return ratios.map((ratio) => ({ ratio, price: c.price + move * ratio }));
}

/** The fan's line ends: the ratios are read on the vertical through `b`, every line starting at `a`. */
export function fibFanEnds(a: DrawPoint, b: DrawPoint, ratios: readonly number[] = FIB_RATIOS): { ratio: number; end: DrawPoint }[] {
    const range = b.price - a.price;
    return ratios.map((ratio) => ({ ratio, end: { time: b.time, price: a.price + range * ratio } }));
}

/** Channel lines: for each ratio, the segment between the points that sit that far from the base
 *  line towards the third point. Ratio 0 is the base itself, ratio 1 is the third point. */
export function fibChannelLevels(a: DrawPoint, b: DrawPoint, c: DrawPoint, ratios: readonly number[] = FIB_RATIOS): [DrawPoint, DrawPoint][] {
    const between = (from: DrawPoint, to: DrawPoint, ratio: number): DrawPoint => ({
        time: from.time + (to.time - from.time) * ratio,
        price: from.price + (to.price - from.price) * ratio,
    });
    return ratios.map((ratio) => [between(a, c, ratio), between(b, c, ratio)]);
}

/** The Fibonacci sequence, which is what a time zone steps forward by. */
export function fibTimeMultiples(count: number): number[] {
    const out: number[] = [];
    let previous = 1;
    let current = 2;
    for (let i = 0; i < count; i += 1) {
        out.push(previous);
        const next = previous + current;
        previous = current;
        current = next;
    }
    return out;
}

/** Arc sizes in pixels: each ratio scales the base move's own width and height. */
export function fibArcRadii(from: ScreenPoint, to: ScreenPoint, ratios: readonly number[] = FIB_RATIOS): { ratio: number; rx: number; ry: number }[] {
    const rx = Math.abs(to.x - from.x);
    const ry = Math.abs(to.y - from.y);
    return ratios.map((ratio) => ({ ratio, rx: rx * ratio, ry: ry * ratio }));
}

/** The speed fan's thirds: the a→b slope repeated at 1/3, 2/3 and 3/3 out to the edge of the range
 *  the caller is looking at. A vertical pair has no slope, so the fan is empty. */
export const SPEED_RATIOS = [1 / 3, 2 / 3, 1] as const;

export function speedFanEnds(a: DrawPoint, b: DrawPoint, edgeTime: number, ratios: readonly number[] = SPEED_RATIOS): { ratio: number; end: DrawPoint }[] {
    if (b.time === a.time || edgeTime === a.time) return [];
    const slope = (b.price - a.price) / (b.time - a.time);
    return ratios.map((ratio) => ({ ratio, end: { time: edgeTime, price: a.price + slope * ratio * (edgeTime - a.time) } }));
}

// --- geometric shapes -------------------------------------------------------
// These read better in screen pixels than in chart space: an ellipse that must stay round, a circle
// that must stay a circle, and an arc through three points are all about what the eye sees. Each
// helper returns either the numbers an SVG element takes or the path data itself.

/** The ellipse a two-corner box makes. */
export function ellipseFrom(a: ScreenPoint, b: ScreenPoint): { cx: number; cy: number; rx: number; ry: number } {
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx: Math.abs(b.x - a.x) / 2, ry: Math.abs(b.y - a.y) / 2 };
}

/** The circle through a centre and one point on it. */
export function circleFrom(centre: ScreenPoint, edge: ScreenPoint): { cx: number; cy: number; r: number } {
    return { cx: centre.x, cy: centre.y, r: distance(centre, edge) };
}

/**
 * A rectangle that can sit at any angle: the first two points are one edge (its direction is the
 * rectangle's), and the third lifts the height off that edge's line. The corner order is
 * clockwise from the first point, so the shape can be filled and hit-tested like an upright box.
 */
export function rotatedRectCorners(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): ScreenPoint[] {
    const len = distance(a, b);
    if (len < 1e-6) return [a, b, c];
    // The unit normal to the base edge; the third point's projection on it is the height.
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const height = (c.x - a.x) * nx + (c.y - a.y) * ny;
    const dx = nx * height;
    const dy = ny * height;
    return [a, b, { x: b.x + dx, y: b.y + dy }, { x: a.x + dx, y: a.y + dy }];
}

/** How many quarter-turns the Fibonacci spiral runs for by default. */
export const FIB_SPIRAL_TURNS = 8;

/**
 * A logarithmic spiral through the golden ratio: r grows by φ every quarter turn, so the curve
 * expands the way the ratio does. Returned as screen points, because the spiral is drawn in screen
 * space — the price and time axes have different scales, and a spiral that stretched with them would
 * not read as one.
 */
export function fibSpiralPoints(centre: ScreenPoint, edge: ScreenPoint, turns = FIB_SPIRAL_TURNS, stepsPerTurn = 12): ScreenPoint[] {
    const r0 = distance(centre, edge);
    if (r0 < 1e-6 || turns <= 0) return [];
    const start = Math.atan2(edge.y - centre.y, edge.x - centre.x);
    const phi = (1 + Math.sqrt(5)) / 2;
    const points: ScreenPoint[] = [];
    const steps = Math.round(turns * stepsPerTurn);
    for (let i = 0; i <= steps; i += 1) {
        const t = i / stepsPerTurn; // quarter-turns from the start
        const r = r0 * Math.pow(phi, t);
        const angle = start + t * (Math.PI / 2);
        points.push({ x: centre.x + Math.cos(angle) * r, y: centre.y + Math.sin(angle) * r });
    }
    return points;
}

/** The `points` attribute of a closed polygon. */
export const polygonPoints = (points: ScreenPoint[]): string => points.map((point) => `${point.x},${point.y}`).join(' ');

/** The `d` attribute of an open path through every point. */
export const polylinePath = (points: ScreenPoint[]): string =>
    points.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');

/** A quadratic curve: from `a` to `c`, pulled towards its handle `b`. */
export const quadraticPath = (a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): string => `M${a.x},${a.y} Q${b.x},${b.y} ${c.x},${c.y}`;

/** Two quadratics joined at the middle of their handles: the S-shaped double curve. */
export function doubleCurvePath(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint, d: ScreenPoint): string {
    const join = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    return `M${a.x},${a.y} Q${b.x},${b.y} ${join.x},${join.y} Q${c.x},${c.y} ${d.x},${d.y}`;
}

/**
 * The arc that runs from `a` to `c` through `b`, as the circle it sits on plus the path data.
 * Three points on one line have no circle; the caller draws the straight fallback instead.
 */
export function arcThrough(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): { cx: number; cy: number; r: number; path: string } | null {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-6) return null;
    const aa = a.x * a.x + a.y * a.y;
    const bb = b.x * b.x + b.y * b.y;
    const cc = c.x * c.x + c.y * c.y;
    const cx = (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d;
    const cy = (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d;
    const r = Math.hypot(a.x - cx, a.y - cy);    const u = { x: a.x - cx, y: a.y - cy };
    const v = { x: b.x - cx, y: b.y - cy };
    const w = { x: c.x - cx, y: c.y - cy };
    // In SVG's coordinates (y down) sweep-flag 1 draws clockwise; the arc must turn the way the
    // middle point lies, and only the long way round is a large arc.
    const sweep = u.x * v.y - u.y * v.x > 0 ? 1 : 0;
    const turn = Math.atan2(u.x * w.y - u.y * w.x, u.x * w.x + u.y * w.y);
    const delta = sweep === 1 ? turn : -turn;
    const largeArc = ((delta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) > Math.PI ? 1 : 0;
    // `+ 0` keeps a centre on an axis at +0: an SVG attribute should never print "-0".
    return { cx: cx + 0, cy: cy + 0, r, path: `M${a.x},${a.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${c.x},${c.y}` };
}

/** A pointer for an arrow tip, in SVG coordinates: the two barbs of a head that points at `to`. */
export function arrowHeadPoints(from: { x: number; y: number }, to: { x: number; y: number }, size = 10): string {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return '';
    const ux = dx / length;
    const uy = dy / length;
    // Two barbs, rotated off the shaft by 28 degrees and pulled back along it.
    const angle = (28 * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const back = size;
    const b1 = { x: to.x - back * (ux * cos - uy * sin), y: to.y - back * (uy * cos + ux * sin) };
    const b2 = { x: to.x - back * (ux * cos + uy * sin), y: to.y - back * (uy * cos - ux * sin) };
    return `${to.x},${to.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`;
}

/** The colour a shape is painted with: its own, or its tool's default. */
export const drawingColor = (drawing: Pick<Drawing, 'tool' | 'color' | 'customColor'>): string =>
    isCustomColor(drawing.customColor)
        ? drawing.customColor.toLowerCase()
        : DRAWING_COLORS[isColorKey(drawing.color) ? drawing.color : toolDef(drawing.tool).defaultColor];

/** A colour a trader picked themselves: one hex triplet, nothing else gets stored. */
export const CUSTOM_COLOR = /^#[0-9a-fA-F]{6}$/;
const isCustomColor = (value: unknown): value is string => typeof value === 'string' && CUSTOM_COLOR.test(value);

// --- Fibonacci -------------------------------------------------------------

/**
 * The full retracement and extension set. Ratios up to 1 sit between the anchors; ratios above 1
 * project past the far point in the direction the shape was drawn, which is how a trader reads an
 * extension target.
 */
export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 0.886, 1, 1.13, 1.272, 1.414, 1.618, 2, 2.618, 3] as const;

/** The tools whose levels a trader can edit, each with the set it ships with. */
const FIB_DEFAULTS: Partial<Record<ShapeTool, readonly number[]>> = {
    fib: FIB_RATIOS,
    fibext: FIB_EXT_RATIOS,
    fibtrendext: FIB_TREND_EXT_RATIOS,
};

/** Whether this tool draws levels a trader may add to or trim. */
export const hasFibLevels = (tool: ShapeTool): boolean => FIB_DEFAULTS[tool] !== undefined;

/** At most this many levels: beyond it the labels overlap and the drawing stops being readable. */
export const MAX_FIB_LEVELS = 30;

/** The ratios a drawing actually draws: its own list, or the tool's classic set. */
export function fibRatiosOf(drawing: Pick<Drawing, 'tool' | 'fibLevels'>): readonly number[] {
    const own = drawing.fibLevels;
    return own && own.length > 0 ? own : FIB_DEFAULTS[drawing.tool] ?? FIB_RATIOS;
}

export type FibLevel = { ratio: number; price: number };

export function fibLevels(a: DrawPoint, b: DrawPoint, ratios: readonly number[] = FIB_RATIOS): FibLevel[] {
    const top = Math.max(a.price, b.price);
    const bottom = Math.min(a.price, b.price);
    const span = top - bottom;
    const rising = b.price >= a.price;
    return ratios.map((ratio) => ({
        ratio,
        price:
            ratio <= 1
                ? top - span * ratio
                : rising
                  ? b.price + span * (ratio - 1)
                  : b.price - span * (ratio - 1),
    }));
}

// --- Gann -----------------------------------------------------------------

export type GannGuides = { corners: DrawPoint[]; midPrice: number };

/** The box two opposite corners describe, plus the mid price the horizontal guide sits on. */
export function gannGuides(a: DrawPoint, b: DrawPoint): GannGuides {
    return {
        corners: [
            { time: a.time, price: a.price },
            { time: b.time, price: a.price },
            { time: b.time, price: b.price },
            { time: a.time, price: b.price },
        ],
        midPrice: (a.price + b.price) / 2,
    };
}

// --- cycles ---------------------------------------------------------------

/**
 * Indices a cycle lands on: the bar distance between the two anchors is repeated before and after
 * them, which is what a time-cycle tool is for. Out-of-range indices are dropped.
 */
export function cycleIndices(length: number, a: number, b: number, back = 2, forward = 10): number[] {
    const step = b - a;
    if (!Number.isInteger(a) || !Number.isInteger(b) || step <= 0 || length <= 0) return [];
    const out: number[] = [];
    for (let k = -back; k <= forward; k += 1) {
        const index = a + k * step;
        if (index >= 0 && index < length) out.push(index);
    }
    return out;
}

/** The polyline of a sine wave that starts at `p0` and completes half a period at `p1`. */
export function sinePoints(p0: { x: number; y: number }, p1: { x: number; y: number }, rightEdge: number): { x: number; y: number }[] {
    const span = p1.x - p0.x;
    if (Math.abs(span) < 4) return [];
    const amplitude = Math.abs(p1.y - p0.y) / 2 || 8;
    const middle = (p0.y + p1.y) / 2;
    const phase = p0.y >= middle ? Math.PI / 2 : -Math.PI / 2;
    const end = Math.min(p0.x + span * 3, rightEdge);
    const points: { x: number; y: number }[] = [];
    for (let x = p0.x; x <= end; x += 4) {
        points.push({ x, y: middle + amplitude * Math.sin((Math.PI * (x - p0.x)) / span + phase) });
    }
    return points;
}

// --- manual Elliott counts -------------------------------------------------

export type CountDegree = 'major' | 'minor' | 'minute';
export type CountKind = 'impulse' | 'correction';

/** The glyph set each degree/kind pair prints, mirroring how a count is written by hand. */
export const COUNT_GLYPHS: Record<CountDegree, Record<CountKind, string[]>> = {
    major: { impulse: ['I', 'II', 'III', 'IV', 'V'], correction: ['(A)', '(B)', '(C)'] },
    minor: { impulse: ['1', '2', '3', '4', '5'], correction: ['A', 'B', 'C'] },
    minute: { impulse: ['i', 'ii', 'iii', 'iv', 'v'], correction: ['a', 'b', 'c'] },
};

export const COUNT_TOOL: Record<CountKind, ShapeTool> = { impulse: 'ew-count', correction: 'ew-count-abc' };

export type CountOptions = { degree: CountDegree; kind: CountKind };

/** Every degree/kind pair a manual count offers, ready to render as menu entries. */
export const COUNT_OPTIONS: CountOptions[] = (['major', 'minor', 'minute'] as CountDegree[]).flatMap((degree) =>
    (['impulse', 'correction'] as CountKind[]).map((kind) => ({ degree, kind })),
);

// --- screen-space geometry -------------------------------------------------

export type ScreenPoint = { x: number; y: number };

const distance = (p: ScreenPoint, q: ScreenPoint) => Math.hypot(p.x - q.x, p.y - q.y);

/** Perpendicular distance from `p` to the segment `a`–`b`, clamped to the segment's ends. */
export function distanceToSegment(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return distance(p, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
    return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Whether the pointer is close enough to `p` to count as grabbing it. */
export const isNearPoint = (cursor: ScreenPoint, p: ScreenPoint, tolerance: number): boolean =>
    distance(cursor, p) <= tolerance;

/**
 * The drawing the pointer is over, newest first so a line drawn on top of another wins.
 * A box or a retracement is grabbed by any of its edges, not by its whole surface, so the
 * pointer stays free for panning inside it.
 */
export function hitTest(
    drawings: Drawing[],
    screenPoints: ScreenPoint[][],
    cursor: ScreenPoint,
    tolerance: number,
    kindOf: (drawing: Drawing) => ShapeKind = (drawing) => toolDef(drawing.tool).kind,
): Drawing | null {
    for (let i = drawings.length - 1; i >= 0; i -= 1) {
        const points = screenPoints[i];
        if (!points || points.length === 0) continue;
        const drawing = drawings[i];
        const kind = kindOf(drawing);

        // One-point tools: the anchor is the whole drawing, so the pointer only has to be near it.
        // hray, vline and cross belong here too — they are placed with a single click and the
        // renderer derives the missing direction from the panel.
        if (
            kind === 'text' ||
            kind === 'horizontal' ||
            kind === 'signpost' ||
            kind === 'flag' ||
            kind === 'pricenote' ||
            kind === 'avwap' ||
            kind === 'icon' ||
            kind === 'hray' ||
            kind === 'cross'
        ) {
            if (isNearPoint(cursor, points[0], tolerance)) return drawing;
            continue;
        }
        if (kind === 'vlines' || kind === 'vline') {
            // A vertical line belongs to a whole column, so only the x matters.
            if (points.some((p) => Math.abs(p.x - cursor.x) <= tolerance)) return drawing;
            continue;
        }
        if (kind === 'sine') {
            // The curve is an approximation on screen; its two anchors are what you grab.
            if (points.some((p) => isNearPoint(cursor, p, tolerance))) return drawing;
            continue;
        }
        if (kind === 'poly' || kind === 'hs' || kind === 'triangle' || kind === 'polyline' || kind === 'tri' || kind === 'brush' || kind === 'highlighter') {
            for (let s = 0; s + 1 < points.length; s += 1) {
                if (distanceToSegment(cursor, points[s], points[s + 1]) <= tolerance) return drawing;
            }
            // A polyline of two points is a segment; a triangle closes back to its first point.
            if (kind === 'tri' && points.length >= 3 && distanceToSegment(cursor, points[points.length - 1], points[0]) <= tolerance) return drawing;
            continue;
        }
        if (kind === 'arc' || kind === 'curve' || kind === 'dcurve' || kind === 'callout' || kind === 'balloon' || kind === 'image') {
            // These are drawn as curves between their anchors, so the anchors are what you grab.
            if (points.some((point) => isNearPoint(cursor, point, tolerance))) return drawing;
            continue;
        }
        if (kind === 'trend') {
            if (points.length >= 2 && distanceToSegment(cursor, points[0], points[1]) <= tolerance) return drawing;
            continue;
        }
        if (kind === 'rotrect') {
            if (points.length < 3) continue;
            const corners = rotatedRectCorners(points[0], points[1], points[2]);
            for (let c = 0; c < corners.length; c += 1) {
                if (distanceToSegment(cursor, corners[c], corners[(c + 1) % corners.length]) <= tolerance) return drawing;
            }
            continue;
        }
        if (kind === 'fibspiral') {
            // The curve itself is dense; the two anchors are what a trader grabs.
            if (points.some((point) => isNearPoint(cursor, point, tolerance))) return drawing;
            continue;
        }

        // Boxes are grabbed by their four sides, not by their surface, so the pointer stays free for
        // panning inside them. A volume profile and a bars pattern are boxes too.
        if (BOX_KINDS.has(kind)) {
            if (points.length < 2) continue;
            const [a, b] = points;
            const corners: ScreenPoint[] = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
            for (let c = 0; c < corners.length; c += 1) {
                if (distanceToSegment(cursor, corners[c], corners[(c + 1) % corners.length]) <= tolerance) return drawing;
            }
            continue;
        }

        // Everything else — channels, pitchforks, Gann fans, projections, ranges, fib extensions —
        // is tested against the segments it is actually painted from. The constructions are affine
        // in (time, price), so they can be rebuilt in screen space from the projected anchors.
        const segments = drawingSegments(kind, points);
        for (const [a, b] of segments) {
            if (distanceToSegment(cursor, a, b) <= tolerance) return drawing;
        }
    }
    return null;
}

type Seg = [ScreenPoint, ScreenPoint];

const midPoint = (a: ScreenPoint, b: ScreenPoint): ScreenPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The segments a drawing is painted from, rebuilt in screen space. */
function drawingSegments(kind: ShapeKind, points: ScreenPoint[]): Seg[] {
    const segs: Seg[] = [];
    const add = (a: ScreenPoint, b: ScreenPoint) => segs.push([a, b]);
    const chain = (list: ScreenPoint[], close = false) => {
        for (let i = 0; i + 1 < list.length; i += 1) add(list[i], list[i + 1]);
        if (close && list.length >= 3) add(list[list.length - 1], list[0]);
    };
    const [a, b, c] = points;

    switch (kind) {
        case 'pitchfork':
        case 'schiffpitchfork':
        case 'modpitchfork':
        case 'insidepitchfork': {
            if (!a || !b || !c) return segs;
            const variant = kind === 'schiffpitchfork' ? 'schiff' : kind === 'modpitchfork' ? 'modified' : kind === 'insidepitchfork' ? 'inside' : 'andrews';
            const pivot = variant === 'andrews' ? a : variant === 'schiff' ? midPoint(a, b) : midPoint(a, b);
            const target = variant === 'inside' ? c : midPoint(b, c);
            const slope = { x: target.x - pivot.x, y: target.y - pivot.y };
            const through = (point: ScreenPoint): Seg => [point, { x: point.x + slope.x, y: point.y + slope.y }];
            add(...through(pivot));
            add(...through(b));
            add(...through(c));
            return segs;
        }
        case 'channel': {
            if (!a || !b || !c) return segs;
            const offset = { x: c.x - b.x, y: c.y - b.y };
            add(a, b);
            add({ x: a.x + offset.x, y: a.y + offset.y }, { x: b.x + offset.x, y: b.y + offset.y });
            return segs;
        }
        case 'disjoint': {
            if (!a || !b || !c) return segs;
            add(a, b);
            add(c, { x: c.x + (b.x - a.x), y: c.y + (b.y - a.y) });
            return segs;
        }
        case 'fibchannel': {
            if (!a || !b || !c) return segs;
            for (const ratio of FIB_RATIOS) {
                add(
                    { x: a.x + (c.x - a.x) * ratio, y: a.y + (c.y - a.y) * ratio },
                    { x: b.x + (c.x - b.x) * ratio, y: b.y + (c.y - b.y) * ratio }
                );
            }
            return segs;
        }
        case 'gannfan': {
            if (!a || !b) return segs;
            const edgeX = Math.max(a.x, b.x) + 2000;
            const slope = b.x === a.x ? 0 : (b.y - a.y) / (b.x - a.x);
            for (const ratio of GANN_RATIOS) add(a, { x: edgeX, y: a.y + slope * ratio * (edgeX - a.x) });
            return segs;
        }
        case 'fibfan': {
            if (!a || !b) return segs;
            for (const ratio of FIB_RATIOS) add(a, { x: b.x, y: a.y + (b.y - a.y) * ratio });
            return segs;
        }
        case 'flattop': {
            if (!a || !b) return segs;
            const top = Math.min(a.y, b.y);
            const bottom = Math.max(a.y, b.y);
            add({ x: a.x, y: top }, { x: b.x, y: top });
            add({ x: a.x, y: bottom }, { x: b.x, y: bottom });
            return segs;
        }
        case 'projection': {
            if (!a || !b) return segs;
            add(b, { x: b.x + (b.x - a.x), y: b.y + (b.y - a.y) });
            return segs;
        }
        case 'longpos':
        case 'shortpos': {
            if (!a || !b || !c) return segs;
            const width = b.x - a.x;
            add(a, b);
            add(a, { x: a.x + width, y: c.y });
            add({ x: a.x + width, y: c.y }, b);
            return segs;
        }
        case 'pricerange':
        case 'daterange':
        case 'dprange':
        case 'xrect':
        case 'gannbox':
        case 'gannsquare': {
            if (!a || !b) return segs;
            const corners: ScreenPoint[] = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
            chain(corners, true);
            if (kind === 'gannbox' || kind === 'gannsquare') {
                add(a, b);
                add(corners[1], corners[3]);
            }
            return segs;
        }
        case 'fibext':
        case 'fibtrendext': {
            if (!a || !b || !c) return segs;
            const left = Math.min(a.x, b.x, c.x);
            const right = Math.max(a.x, b.x, c.x);
            for (const ratio of FIB_EXT_RATIOS) {
                const y = c.y + (b.y - a.y) * ratio;
                add({ x: left, y }, { x: right, y });
            }
            return segs;
        }
        case 'fibtime': {
            if (!a || !b) return segs;
            const top = Math.min(a.y, b.y) - 2000;
            const bottom = Math.max(a.y, b.y) + 2000;
            for (const multiple of fibTimeMultiples(8)) {
                const x = a.x + (b.x - a.x) * multiple;
                add({ x, y: top }, { x, y: bottom });
            }
            return segs;
        }
        case 'rotrect': {
            if (!a || !b || !c) return segs;
            chain(rotatedRectCorners(a, b, c), true);
            return segs;
        }
        case 'fibspiral': {
            if (!a || !b) return segs;
            chain(fibSpiralPoints(a, b));
            return segs;
        }
        case 'fibarc':
        case 'fibspeed':
        case 'regression':
        case 'arrow':
        case 'ray':
        case 'extended':
        case 'trendangle':
        case 'info':
        case 'trend':
        case 'pricetime':
        default:
            chain(points, CLOSED_KINDS.has(kind));
            return segs;
    }
}

/** Kinds painted as a rectangle between two opposite corners. */
const BOX_KINDS = new Set<ShapeKind>([
    'rectangle',
    'xrect',
    'gannbox',
    'gannsquare',
    'ellipse',
    'circle',
    'vprofile',
    'bars',
]);

/** Kinds whose outline closes back to the first anchor. */
const CLOSED_KINDS = new Set<ShapeKind>([
    'tri',
    'triangle',
    'hs',
    'poly',
    'fibchannel',
    'gannbox',
    'gannsquare',
    'rectangle',
    'xrect',
    'ellipse',
    'circle',
    'vprofile',
    'bars',
]);

/** Which of a drawing's handles the pointer grabbed, or null when it grabbed none. */
export function handleIndex(screenPoints: ScreenPoint[], cursor: ScreenPoint, tolerance: number): number | null {
    for (let i = 0; i < screenPoints.length; i += 1) {
        if (isNearPoint(cursor, screenPoints[i], tolerance)) return i;
    }
    return null;
}

// --- notes -----------------------------------------------------------------

export const TEXT_MAX = 80;

/** An image is addressed by a URL, which is longer than a note's words. */
export const IMAGE_URL_MAX = 300;

/** How long a tool's own wording may be. An uploaded picture is a data payload, so it gets its own cap. */
export const textLimit = (tool: ShapeTool): number => (tool === 'image' ? IMAGE_DATA_MAX : TEXT_MAX);

/** Trimmed and collapsed, or null when there is nothing worth printing. */
export function cleanText(text: unknown, max = TEXT_MAX): string | null {
    if (typeof text !== 'string') return null;
    const clean = text.trim().replace(/\s+/g, ' ');
    return clean.length === 0 || clean.length > max ? null : clean;
}

/** The same text on a new anchor: the note is dragged, so its point moves, not its wording. */
export const withPoint = (drawing: Drawing, index: number, point: DrawPoint): Drawing => ({
    ...drawing,
    points: drawing.points.map((p, i) => (i === index ? point : p)),
});

/** A note's new wording. Bad text leaves the drawing untouched, so a stray save cannot blank it. */
export function withText(drawing: Drawing, text: unknown): Drawing {
    const clean = cleanText(text, textLimit(drawing.tool));
    return clean == null ? drawing : { ...drawing, text: clean };
}

/** The stroke weight a drawing is painted with; the tools' own default is a hairline. */
export const strokeWidthOf = (drawing: Drawing): number => drawing.width ?? 1.6;

/** The dash pattern, or undefined for the tool's own (solid, except a level's dashed guide). */
export const dashOf = (drawing: Drawing): string | undefined => {
    if (!drawing.dash || drawing.dash === 'solid') return undefined;
    return drawing.dash === 'dotted' ? '2 3' : '7 4';
};

/**
 * A copy that can be pasted or duplicated: a fresh id, no lock (a pasted object should be usable),
 * and an optional offset so it does not hide exactly under the original.
 */
export function cloneDrawing(drawing: Drawing, id: string, offset: { time?: number; price?: number } = {}): Drawing {
    const { time = 0, price = 0 } = offset;
    // `locked` is deliberately dropped: a pasted object should be usable straight away.
    const { locked, labels, ...rest } = drawing;
    void locked;
    return {
        ...rest,
        id,
        points: drawing.points.map((point) => ({ time: point.time + time, price: point.price + price })),
        ...(labels ? { labels: [...labels] } : {}),
    };
}

/** The labels a shape prints: its own when it has them, otherwise the tool's. */
export const labelsFor = (drawing: Drawing): string[] => drawing.labels ?? toolDef(drawing.tool).pointLabels ?? [];

// --- snapping --------------------------------------------------------------

/**
 * The candle time closest to `time`. A drawing keeps the timestamp of the bar it was drawn on, and
 * changing interval changes the set of bars, so a point is snapped to the nearest bar of whatever
 * interval is on screen instead of vanishing from the chart.
 */
export function nearestTime(times: number[], time: number): number | null {
    if (times.length === 0) return null;
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < time) lo = mid + 1;
        else hi = mid;
    }
    const upper = times[lo];
    const lower = lo > 0 ? times[lo - 1] : upper;
    return Math.abs(lower - time) <= Math.abs(upper - time) ? lower : upper;
}

// --- persistence -----------------------------------------------------------

/** A chart's shapes, per symbol: they follow the instrument across timeframes, not the timeframe. */
export const drawingsKey = (symbol: string) => `openstock-drawings:${symbol.toUpperCase()}`;

export const MAX_DRAWINGS = 200;

/**
 * Where the "stay in drawing mode" switch is kept: TradingView's behaviour of leaving the tool armed
 * after a shape lands, so a trader can draw five trendlines without re-picking the tool each time.
 */
export const STAY_DRAWING_KEY = 'openstock:drawing-stay';

export function readStayDrawing(storage: Pick<Storage, 'getItem'>): boolean {
    try {
        return storage.getItem(STAY_DRAWING_KEY) === '1';
    } catch {
        return false;
    }
}

export function writeStayDrawing(storage: Pick<Storage, 'setItem'>, stay: boolean): void {
    try {
        storage.setItem(STAY_DRAWING_KEY, stay ? '1' : '0');
    } catch {
        /* a blocked storage only means the switch does not outlive the visit */
    }
}

const isPoint = (v: unknown): v is DrawPoint =>
    !!v && typeof v === 'object' && Number.isFinite((v as DrawPoint).time) && Number.isFinite((v as DrawPoint).price);

const cleanDrawing = (value: unknown): Drawing | null => {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Drawing;
    if (typeof candidate.id !== 'string' || !candidate.id) return null;
    if (!isShapeTool(candidate.tool)) return null;
    // A fixed-count tool must hold exactly its own number of points; an open-ended one needs at
    // least the two a line takes, and is capped so a stroke cannot grow without bound.
    const needed = pointsNeeded(candidate.tool);
    if (!Array.isArray(candidate.points)) return null;
    if (needed === 0 ? candidate.points.length < 2 || candidate.points.length > MAX_STROKE_POINTS : candidate.points.length !== needed) return null;
    if (!candidate.points.every(isPoint)) return null;

    const labels =
        Array.isArray(candidate.labels) && candidate.labels.every((l) => typeof l === 'string')
            ? candidate.labels.slice(0, 8)
            : undefined;
    const text = carriesText(candidate.tool) ? (cleanText(candidate.text, textLimit(candidate.tool)) ?? '—') : undefined;
    const color = isColorKey(candidate.color) ? candidate.color : undefined;
    const locked = candidate.locked === true ? true : undefined;
    const hidden = candidate.hidden === true ? true : undefined;
    const width = isWidth(candidate.width) ? candidate.width : undefined;
    const dash = isDash(candidate.dash) ? candidate.dash : undefined;
    // Type styling only means something on a tool that carries words.
    const textSize = carriesText(candidate.tool) && isTextSize(candidate.textSize) ? candidate.textSize : undefined;
    const bold = carriesText(candidate.tool) && candidate.bold === true ? true : undefined;
    const italic = carriesText(candidate.tool) && candidate.italic === true ? true : undefined;
    const background = carriesText(candidate.tool) && candidate.background === true ? true : undefined;
    const textColor = carriesText(candidate.tool) && isColorKey(candidate.textColor) ? candidate.textColor : undefined;
    const customColor = isCustomColor(candidate.customColor) ? candidate.customColor.toLowerCase() : undefined;
    const customFill = hasFill(candidate.tool) && isCustomColor(candidate.customFill) ? candidate.customFill.toLowerCase() : undefined;
    const customTextColor = carriesText(candidate.tool) && isCustomColor(candidate.customTextColor) ? candidate.customTextColor.toLowerCase() : undefined;
    // Levels are kept sorted and unique: two labels on one line is not a feature.
    const fibLevels = hasFibLevels(candidate.tool) && Array.isArray(candidate.fibLevels)
        ? [...new Set(candidate.fibLevels.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= -10 && n <= 10))]
              .sort((a, b) => a - b)
              .slice(0, MAX_FIB_LEVELS)
        : undefined;
    // A fill only means something on a shape that encloses an area.
    const fill = hasFill(candidate.tool) && isColorKey(candidate.fill) ? candidate.fill : undefined;
    const fillOpacity = hasFill(candidate.tool) && isFillOpacity(candidate.fillOpacity) ? candidate.fillOpacity : undefined;
    const timeframes = Array.isArray(candidate.timeframes)
        ? [...new Set(candidate.timeframes.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length < 10))].slice(0, 20)
        : undefined;

    return {
        id: candidate.id,
        tool: candidate.tool,
        points: candidate.points,
        ...(labels ? { labels } : {}),
        ...(text ? { text } : {}),
        ...(color ? { color } : {}),
        ...(locked ? { locked } : {}),
        ...(hidden ? { hidden } : {}),
        ...(width ? { width } : {}),
        ...(dash ? { dash } : {}),
        ...(textSize ? { textSize } : {}),
        ...(bold ? { bold } : {}),
        ...(italic ? { italic } : {}),
        ...(background ? { background } : {}),
        ...(textColor ? { textColor } : {}),
        ...(customColor ? { customColor } : {}),
        ...(customFill ? { customFill } : {}),
        ...(customTextColor ? { customTextColor } : {}),
        ...(fill ? { fill } : {}),
        ...(fillOpacity !== undefined ? { fillOpacity } : {}),
        ...(timeframes && timeframes.length > 0 ? { timeframes } : {}),
        ...(fibLevels && fibLevels.length > 0 ? { fibLevels } : {}),
    };
};

/**
 * The one gate every incoming drawing passes, whatever its source: the browser's storage, an imported
 * file, or a row from the account. Anything that does not survive is dropped, never thrown.
 */
export function parseDrawingList(value: unknown): Drawing[] {
    if (!Array.isArray(value)) return [];
    return value.map(cleanDrawing).filter((d): d is Drawing => d !== null).slice(0, MAX_DRAWINGS);
}

/** Parses whatever was stored: anything that is not a well-formed drawing is dropped, never thrown. */
export function parseDrawings(raw: string | null): Drawing[] {
    if (!raw) return [];
    try {
        return parseDrawingList(JSON.parse(raw));
    } catch {
        return [];
    }
}

export const serializeDrawings = (drawings: Drawing[]): string => JSON.stringify(drawings);

/** Read the stored drawings for a symbol. Safe on the server: returns [] when there is no window. */
export function loadDrawings(symbol: string): Drawing[] {
    if (typeof window === 'undefined') return [];
    try {
        return parseDrawings(window.localStorage.getItem(drawingsKey(symbol)));
    } catch {
        return [];
    }
}

export function saveDrawings(symbol: string, drawings: Drawing[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(drawingsKey(symbol), serializeDrawings(drawings.slice(0, MAX_DRAWINGS)));
    } catch {
        // A full or blocked storage must not break the chart; the drawing simply is not kept.
    }
}

// --- transfer --------------------------------------------------------------

export const TRANSFER_VERSION = 1;

export type TransferPayload = {
    v: number;
    app: 'openstock';
    kind: 'chart-transfer';
    symbol: string;
    drawings: Drawing[];
};

/** One JSON object that carries a chart's shapes to another browser. */
export function buildTransferPayload(symbol: string, drawings: Drawing[]): TransferPayload {
    return {
        v: TRANSFER_VERSION,
        app: 'openstock',
        kind: 'chart-transfer',
        symbol,
        drawings: drawings.slice(0, MAX_DRAWINGS),
    };
}

export type TransferResult =
    | { ok: true; drawings: Drawing[]; symbol: string }
    | { ok: false; error: 'not-json' | 'not-transfer' | 'version' | 'no-source' };

/**
 * A pasted payload, validated with the same gate the loader uses, so a foreign or hand-edited
 * payload can drop entries but can never reach the renderer as something malformed.
 */
export function parseTransferPayload(raw: unknown): TransferResult {
    if (typeof raw !== 'string') return { ok: false, error: 'not-json' };
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ok: false, error: 'not-json' };
    }
    if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'not-transfer' };
    const payload = parsed as Record<string, unknown>;
    if (payload.app !== 'openstock' || payload.kind !== 'chart-transfer') return { ok: false, error: 'not-transfer' };
    if (payload.v !== TRANSFER_VERSION) return { ok: false, error: 'version' };
    if (typeof payload.symbol !== 'string' || payload.symbol.length === 0) return { ok: false, error: 'no-source' };
    const drawings = Array.isArray(payload.drawings)
        ? payload.drawings.map(cleanDrawing).filter((d): d is Drawing => d !== null)
        : [];
    return { ok: true, drawings, symbol: payload.symbol };
}

/** Merges an incoming set into the current one: same ids are replaced, everything else is kept. */
export function mergeDrawings(current: Drawing[], incoming: Drawing[]): Drawing[] {
    const byId = new Map(current.map((d) => [d.id, d]));
    for (const drawing of incoming) byId.set(drawing.id, drawing);
    return [...byId.values()].slice(0, MAX_DRAWINGS);
}

// The drawing rail's groups, in the order they appear top→bottom on the strip.
// Kept out of the component so it can be asserted without a browser: the rail is
// only as correct as this list, and every group's label must exist in both languages.

import { toolsInGroup, type ShapeTool, type ToolGroup } from '@/lib/chart-drawings';
import type { StringKey } from '@/lib/i18n';

export type RailGroup = { group: ToolGroup; label: StringKey };

/** Every group the rail knows about, in display order. */
export const RAIL_GROUPS: readonly RailGroup[] = [
    { group: 'lines', label: 'chart.group.lines' },
    { group: 'fib', label: 'chart.group.fib' },
    { group: 'gann', label: 'chart.group.gann' },
    { group: 'patterns', label: 'chart.group.patterns' },
    { group: 'elliott', label: 'chart.group.elliott' },
    { group: 'forecast', label: 'chart.group.forecast' },
    { group: 'shapes', label: 'chart.group.shapes' },
    { group: 'annotation', label: 'chart.group.annotation' },
    { group: 'brush', label: 'chart.group.brush' },
] as const;

/**
 * The groups that actually hold tools today. Later phases fill the empty ones
 * (forecast, shapes, brush), so the rail never shows a flyout with nothing in it.
 */
export const railGroupsWithTools = (): RailGroup[] => RAIL_GROUPS.filter(({ group }) => toolsInGroup(group).length > 0);

/**
 * The i18n key for each tool's label. Lives here (not in the chart component) so
 * the rail and the toolbar share one map, and a consistency test can prove every
 * tool has a label in both languages.
 */
export const TOOL_LABEL_KEYS: Record<ShapeTool, StringKey> = {
    trend: 'chart.tool.trend',
    horizontal: 'chart.tool.horizontal',
    rectangle: 'chart.tool.rectangle',
    xrect: 'chart.tool.xrect',
    channel: 'chart.tool.channel',
    arrow: 'chart.tool.arrow',
    pricetime: 'chart.tool.pricetime',
    fib: 'chart.tool.fib',
    gann: 'chart.tool.gann',
    text: 'chart.tool.text',
    xabcd: 'chart.pat.xabcd',
    cypher: 'chart.pat.cypher',
    hs: 'chart.pat.hs',
    abcd: 'chart.pat.abcd',
    triangle: 'chart.pat.triangle',
    drives3: 'chart.pat.drives3',
    'ew-impulse': 'chart.pat.ewImpulse',
    'ew-abc': 'chart.pat.ewAbc',
    'ew-triangle': 'chart.pat.ewTriangle',
    'ew-double': 'chart.pat.ewDouble',
    'ew-triple': 'chart.pat.ewTriple',
    'ew-count': 'chart.count.impulse',
    'ew-count-abc': 'chart.count.correction',
    cycles: 'chart.pat.cycles',
    sine: 'chart.pat.sine',
    ray: 'chart.tool.ray',
    extended: 'chart.tool.extended',
    hray: 'chart.tool.hray',
    vline: 'chart.tool.vline',
    cross: 'chart.tool.cross',
    trendangle: 'chart.tool.trendangle',
    info: 'chart.tool.info',
    longpos: 'chart.tool.longpos',
    shortpos: 'chart.tool.shortpos',
    pricerange: 'chart.tool.pricerange',
    daterange: 'chart.tool.daterange',
    dprange: 'chart.tool.dprange',
    projection: 'chart.tool.projection',
    fibext: 'chart.tool.fibext',
    fibtrendext: 'chart.tool.fibtrendext',
    fibfan: 'chart.tool.fibfan',
    fibchannel: 'chart.tool.fibchannel',
    fibtime: 'chart.tool.fibtime',
    fibarc: 'chart.tool.fibarc',
    fibspeed: 'chart.tool.fibspeed',
    ellipse: 'chart.tool.ellipse',
    circle: 'chart.tool.circle',
    tri: 'chart.tool.tri',
    polyline: 'chart.tool.polyline',
    arc: 'chart.tool.arc',
    curve: 'chart.tool.curve',
    dcurve: 'chart.tool.dcurve',
    brush: 'chart.tool.brush',
    callout: 'chart.tool.callout',
    balloon: 'chart.tool.balloon',
    signpost: 'chart.tool.signpost',
    flag: 'chart.tool.flag',
    pricenote: 'chart.tool.pricenote',
    gannfan: 'chart.tool.gannfan',
    gannbox: 'chart.tool.gannbox',
    gannsquare: 'chart.tool.gannsquare',
    pitchfork: 'chart.tool.pitchfork',
    schiffpitchfork: 'chart.tool.schiffpitchfork',
    modpitchfork: 'chart.tool.modpitchfork',
    insidepitchfork: 'chart.tool.insidepitchfork',
    regression: 'chart.tool.regression',
    flattop: 'chart.tool.flattop',
    disjoint: 'chart.tool.disjoint',
    icon: 'chart.tool.icon',
    image: 'chart.tool.image',
    bars: 'chart.tool.bars',
    avwap: 'chart.tool.avwap',
    vprofile: 'chart.tool.vprofile',
    highlighter: 'chart.tool.highlighter',
};

// Turning a resolved feature set into "which tools may this account see and store".
//
// The chart's own modules know a tool's group; this file is the one place that maps a group to a
// feature, so the rail, the palette, the studies menu, the chart-type menu and the server-side setup
// filter all answer the same way. Client-safe: it only reads the catalogues.

import { toolDef, type ShapeTool, type ToolGroup } from '@/lib/chart/drawings';
import { STUDIES, type StudyId } from '@/lib/chart/studies';
import { CHART_TYPES, type ChartType } from '@/lib/chart/view';
import type { ToolEntry } from '@/lib/tools/catalog';
import type { Feature } from '@/lib/plans';

const DRAWING_FEATURE: Record<ToolGroup, Feature> = {
    cursor: 'tool.drawing.cursor',
    lines: 'tool.drawing.lines',
    fib: 'tool.drawing.fib',
    gann: 'tool.drawing.gann',
    patterns: 'tool.drawing.patterns',
    elliott: 'tool.drawing.elliott',
    forecast: 'tool.drawing.forecast',
    shapes: 'tool.drawing.shapes',
    annotation: 'tool.drawing.annotation',
    brush: 'tool.drawing.brush',
};

export const featureOfDrawing = (tool: ShapeTool): Feature => DRAWING_FEATURE[toolDef(tool).group];

export const featureOfStudy = (id: StudyId): Feature =>
    id === 'formula'
        ? 'tool.formula'
        : STUDIES[id].group === 'oscillator'
            ? 'tool.study.oscillator'
            : 'tool.study.overlay';

/** Every chart type shares one switch today; the map is the place a per-type override would go. */
const CHART_TYPE_FEATURE: Partial<Record<ChartType, Feature>> = {};

export const featureOfChartType = (type: ChartType): Feature =>
    CHART_TYPE_FEATURE[type] ?? 'tool.chartType';

/** The feature a catalog entry needs — the rail, the palette and the deep links all pass through here. */
export const featureOfTool = (entry: ToolEntry): Feature => {
    switch (entry.family) {
        case 'drawing':
            return featureOfDrawing(entry.key as ShapeTool);
        case 'study':
            return featureOfStudy(entry.key as StudyId);
        case 'chartType':
            return featureOfChartType(entry.key as ChartType);
        case 'formula':
            return 'tool.formula';
    }
};

export const canUseTool = (features: readonly Feature[] | undefined, entry: ToolEntry): boolean =>
    features === undefined || features.includes(featureOfTool(entry));

export const canUseDrawing = (features: readonly Feature[] | undefined, tool: ShapeTool): boolean =>
    features === undefined || features.includes(featureOfDrawing(tool));

export const canUseStudy = (features: readonly Feature[] | undefined, id: StudyId): boolean =>
    features === undefined || features.includes(featureOfStudy(id));

export const canUseChartType = (features: readonly Feature[] | undefined, type: ChartType): boolean =>
    features === undefined || features.includes(featureOfChartType(type));

export const allowedStudies = (features: readonly Feature[] | undefined): StudyId[] =>
    (Object.keys(STUDIES) as StudyId[]).filter((id) => canUseStudy(features, id));

export const allowedChartTypes = (features: readonly Feature[] | undefined): ChartType[] =>
    CHART_TYPES.filter((type) => canUseChartType(features, type));

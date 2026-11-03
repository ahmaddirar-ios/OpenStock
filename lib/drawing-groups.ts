// The drawing rail's groups, in the order they appear top→bottom on the strip.
// Kept out of the component so it can be asserted without a browser: the rail is
// only as correct as this list, and every group's label must exist in both languages.

import { toolsInGroup, type ToolGroup } from '@/lib/chart-drawings';
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

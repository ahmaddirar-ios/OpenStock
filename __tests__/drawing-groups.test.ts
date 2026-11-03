import { describe, expect, it } from 'vitest';
import { TOOL_DEFS, toolsInGroup, type ToolGroup } from '@/lib/chart-drawings';
import { RAIL_GROUPS, railGroupsWithTools } from '@/lib/drawing-groups';
import { tx } from '@/lib/i18n';

const TEN_GROUPS: ToolGroup[] = [
    'cursor',
    'lines',
    'fib',
    'gann',
    'patterns',
    'elliott',
    'forecast',
    'shapes',
    'annotation',
    'brush',
];

describe('drawing rail groups', () => {
    it('every tool belongs to one of the ten rail groups', () => {
        expect(TOOL_DEFS.filter((d) => !TEN_GROUPS.includes(d.group))).toEqual([]);
    });

    it('remaps the existing tools onto the rail groups', () => {
        expect(toolsInGroup('fib').map((d) => d.tool)).toContain('fib');
        expect(toolsInGroup('annotation').map((d) => d.tool)).toContain('text');
        expect(toolsInGroup('gann').map((d) => d.tool)).toEqual(expect.arrayContaining(['gann', 'cycles', 'sine']));
        expect(toolsInGroup('elliott').map((d) => d.tool)).toEqual(expect.arrayContaining(['ew-impulse', 'ew-count']));
    });

    it('every rail group has a label in both languages and at least one tool', () => {
        for (const { group, label } of railGroupsWithTools()) {
            expect(toolsInGroup(group).length).toBeGreaterThan(0);
            expect(tx('en', label).length).toBeGreaterThan(0);
            expect(tx('ar', label).length).toBeGreaterThan(0);
        }
    });

    it('keeps the rail order', () => {
        expect(RAIL_GROUPS.map((g) => g.group)).toEqual([
            'lines',
            'fib',
            'gann',
            'patterns',
            'elliott',
            'forecast',
            'shapes',
            'annotation',
            'brush',
        ]);
    });
});

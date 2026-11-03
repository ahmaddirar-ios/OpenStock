import { describe, expect, it } from 'vitest';
import { TOOL_DEFS, toolsInGroup, type ToolGroup } from '@/lib/chart-drawings';
import { RAIL_GROUPS, TOOL_LABEL_KEYS, railGroupsWithTools } from '@/lib/drawing-groups';
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

    it('offers the forecast group once it holds tools', () => {
        // The group exists on the rail already; it must stay hidden while empty and appear with the
        // position and range tools in it.
        expect(toolsInGroup('forecast').map((d) => d.tool)).toEqual([
            'longpos',
            'shortpos',
            'pricerange',
            'daterange',
            'dprange',
            'projection',
        ]);
        expect(railGroupsWithTools().map((g) => g.group)).toContain('forecast');
    });

    it('offers the whole Fibonacci family on its own group', () => {
        // The base retracement landed in phase 1; these are the rest of the family TradingView draws.
        expect(toolsInGroup('fib').map((d) => d.tool)).toEqual([
            'fib',
            'fibext',
            'fibtrendext',
            'fibfan',
            'fibchannel',
            'fibtime',
            'fibarc',
            'fibspeed',
        ]);
    });

    it('offers the geometric shapes on the shapes group', () => {
        expect(toolsInGroup('shapes').map((d) => d.tool)).toEqual([
            'ellipse',
            'circle',
            'tri',
            'polyline',
            'arc',
            'curve',
            'dcurve',
        ]);
    });

    it('labels every tool in both languages', () => {
        // The rail prints TOOL_LABEL_KEYS, so a tool without a key would render an empty row.
        expect(Object.keys(TOOL_LABEL_KEYS).sort()).toEqual(TOOL_DEFS.map((d) => d.tool).sort());
        for (const def of TOOL_DEFS) {
            const key = TOOL_LABEL_KEYS[def.tool];
            expect(tx('en', key).length, `en:${def.tool}`).toBeGreaterThan(0);
            expect(tx('ar', key).length, `ar:${def.tool}`).toBeGreaterThan(0);
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

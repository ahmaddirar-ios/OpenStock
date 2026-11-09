import { describe, expect, it } from 'vitest';
import {
    MAX_CHART_TEMPLATES,
    addChartTemplate,
    chartTemplateCounts,
    cleanChartTemplateName,
    instantiateChartTemplate,
    parseChartTemplates,
    removeChartTemplate,
} from '@/lib/chart/templates';
import type { Drawing } from '@/lib/chart/drawings';
import type { StudyConfig } from '@/lib/chart/studies';

const trend = (id: string): Drawing => ({
    id,
    tool: 'trend',
    points: [
        { time: 1_700_000_000, price: 30 },
        { time: 1_700_100_000, price: 34 },
    ],
});

const sma: StudyConfig = { id: 'sma', params: { length: 20 } };

describe('chart templates', () => {
    it('stores a named setup and reads it back', () => {
        const list = addChartTemplate([], '  Swing   setup ', [trend('a')], [sma], 'ct1');
        expect(list).toHaveLength(1);
        expect(list[0].name).toBe('Swing setup');
        expect(list[0].drawings).toHaveLength(1);
        expect(list[0].studies).toEqual([sma]);
        expect(chartTemplateCounts(list[0])).toEqual({ drawings: 1, studies: 1 });
    });

    it('replaces a template that answers to the same name, ignoring case', () => {
        const first = addChartTemplate([], 'Swing', [trend('a')], [], 'ct1');
        const second = addChartTemplate(first, 'swing', [trend('b'), trend('c')], [sma], 'ct2');
        expect(second).toHaveLength(1);
        expect(second[0].id).toBe('ct2');
        expect(second[0].drawings).toHaveLength(2);
    });

    it('refuses an empty name, an empty setup, and a full shelf', () => {
        expect(addChartTemplate([], '   ', [trend('a')], [])).toEqual([]);
        expect(addChartTemplate([], 'empty', [], [])).toEqual([]);
        const full = Array.from({ length: MAX_CHART_TEMPLATES }, (_, i) => ({
            id: `ct${i}`,
            name: `t${i}`,
            drawings: [trend(`d${i}`)],
            studies: [],
        }));
        expect(addChartTemplate(full, 'one more', [trend('x')], [])).toHaveLength(MAX_CHART_TEMPLATES);
    });

    it('drops malformed drawings and unknown studies instead of keeping them', () => {
        const raw = JSON.stringify([
            {
                id: 'ct1',
                name: 'mixed',
                drawings: [trend('ok'), { id: 'bad', tool: 'nope', points: [] }],
                studies: [sma, { id: 'not-a-study', params: {} }],
            },
        ]);
        const [template] = parseChartTemplates(raw);
        expect(template.drawings.map((drawing) => drawing.id)).toEqual(['ok']);
        expect(template.studies.map((study) => study.id)).toEqual(['sma']);
    });

    it('drops a template that carries nothing', () => {
        const raw = JSON.stringify([{ id: 'ct1', name: 'empty', drawings: [], studies: [] }]);
        expect(parseChartTemplates(raw)).toEqual([]);
    });

    it('survives junk without throwing', () => {
        expect(parseChartTemplates(null)).toEqual([]);
        expect(parseChartTemplates('not json')).toEqual([]);
        expect(parseChartTemplates('{"not":"an array"}')).toEqual([]);
    });

    it('stamps fresh ids so applying twice adds twice', () => {
        const [template] = addChartTemplate([], 'Swing', [trend('a')], [sma], 'ct1');
        let n = 0;
        const first = instantiateChartTemplate(template, () => `new${n++}`);
        const second = instantiateChartTemplate(template, () => `new${n++}`);
        expect(first.drawings[0].id).toBe('new0');
        expect(second.drawings[0].id).toBe('new1');
        expect(first.drawings[0].points).not.toBe(template.drawings[0].points);
    });

    it('copies the studies so editing the template cannot mutate an applied setup', () => {
        const [template] = addChartTemplate([], 'Swing', [], [sma], 'ct1');
        const applied = instantiateChartTemplate(template);
        applied.studies[0].params.length = 50;
        expect(template.studies[0].params.length).toBe(20);
    });

    it('removes by id and leaves the rest alone', () => {
        const list = addChartTemplate(addChartTemplate([], 'a', [trend('a')], [], 'ct1'), 'b', [trend('b')], [], 'ct2');
        expect(removeChartTemplate(list, 'ct1').map((template) => template.id)).toEqual(['ct2']);
    });

    it('cleans a name to the cap', () => {
        expect(cleanChartTemplateName('  a   b  ')).toBe('a b');
        expect(cleanChartTemplateName('x'.repeat(80))).toHaveLength(40);
        expect(cleanChartTemplateName(42)).toBe('');
    });
});

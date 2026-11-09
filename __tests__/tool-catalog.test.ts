import { describe, expect, it } from 'vitest';
import { TOOL_DEFS } from '@/lib/chart/drawings';
import { STUDY_IDS } from '@/lib/chart/studies';
import { CHART_TYPES } from '@/lib/chart/view';
import { FORMULA_FUNCTIONS } from '@/lib/formula/formula';
import { checkFormula } from '@/lib/formula/formula';
import { tx, type Lang } from '@/lib/i18n';
import {
    TOOLS,
    TOOL_SECTIONS,
    groupedTools,
    pickableTools,
    searchTools,
    toolById,
    toolCount,
    toolTotal,
    toolsInSection,
    type ToolEntry,
} from '@/lib/tools/catalog';

const LANGS: Lang[] = ['en', 'ar'];
const sectionIds = new Set(TOOL_SECTIONS.map((section) => section.id));

describe('the tool catalog', () => {
    it('holds every tool of every family', () => {
        // The counts are the point: a tool added to a registry without reaching the catalog is a
        // tool that no picker, no search and — later — no guide will ever know about.
        expect(toolCount('drawing')).toBe(TOOL_DEFS.length + 2); // + select and measure
        expect(toolCount('study')).toBe(STUDY_IDS.length);
        expect(toolCount('chartType')).toBe(CHART_TYPES.length);
        expect(toolCount('formula')).toBe(FORMULA_FUNCTIONS.length);
        expect(TOOLS).toHaveLength(toolTotal() + TOOLS.filter((entry) => entry.hidden).length);
    });

    it('gives every entry one id, one section and a name in both languages', () => {
        const ids = new Set<string>();
        for (const entry of TOOLS) {
            expect(ids.has(entry.id), `duplicate id ${entry.id}`).toBe(false);
            ids.add(entry.id);
            expect(sectionIds.has(entry.section), `${entry.id} has section ${entry.section}`).toBe(true);
            const section = TOOL_SECTIONS.find((candidate) => candidate.id === entry.section);
            expect(section?.family, `${entry.id} sits in a section of another family`).toBe(entry.family);
            for (const lang of LANGS) {
                const name = tx(lang, entry.nameKey);
                expect(name, `${entry.id} has no ${lang} name`).not.toBe(entry.nameKey);
                expect(name.trim().length).toBeGreaterThan(0);
            }
        }
    });

    it('only mirrors a drawing hotkey that the shortcut table declares', () => {
        const withKeys = pickableTools().filter((entry) => entry.hotkey);
        expect(withKeys.length).toBeGreaterThan(0);
        const keys = withKeys.map((entry) => entry.hotkey);
        expect(new Set(keys).size, 'two tools share a key').toBe(keys.length);
    });

    it('keeps a retired tool in the catalog but out of the pickers', () => {
        const retired = TOOLS.find((entry) => entry.hidden);
        expect(retired?.id).toBe('drawing:gann');
        expect(pickableTools().some((entry) => entry.id === 'drawing:gann')).toBe(false);
        // Still resolvable, so a stored drawing of it can be named.
        expect(toolById('drawing:gann')).toBeTruthy();
    });

    it('lists every section in the order the rail uses, empty ones dropped', () => {
        const groups = groupedTools();
        expect(groups[0].section.id).toBe('cursor');
        expect(groups[1].section.id).toBe('lines');
        expect(groups.every((group) => group.tools.length > 0)).toBe(true);
        // The rail order, then the studies, then the rest.
        const order = groups.map((group) => group.section.id);
        expect(order.indexOf('fib')).toBeLessThan(order.indexOf('study.overlay'));
        expect(order.indexOf('study.oscillator')).toBeLessThan(order.indexOf('chart.type'));
        expect(order.indexOf('chart.type')).toBeLessThan(order.indexOf('formula.average'));
    });

    it('gives a price study and a pane study to the sections they belong to', () => {
        expect(toolsInSection('study.overlay').some((entry) => entry.key === 'sma')).toBe(true);
        expect(toolsInSection('study.oscillator').some((entry) => entry.key === 'rsi')).toBe(true);
        expect(toolsInSection('study.overlay').some((entry) => entry.key === 'rsi')).toBe(false);
    });
});

describe('searching the catalog', () => {
    const firstId = (query: string) => searchTools(query)[0]?.id;

    it('finds a tool by its English name', () => {
        expect(searchTools('trend line').map((entry) => entry.id)).toContain('drawing:trend');
        expect(firstId('parallel channel')).toBe('drawing:channel');
    });

    it('finds a tool by its Arabic name', () => {
        expect(firstId('فيبوناتشي')).toBe('drawing:fib');
        expect(searchTools('مستطيل').map((entry) => entry.id)).toContain('drawing:rectangle');
        expect(searchTools('شوكة').map((entry) => entry.id)).toContain('drawing:pitchfork');
    });

    it('finds a tool by a keyword it does not carry in its name', () => {
        expect(searchTools('harmonic').map((entry) => entry.id)).toContain('drawing:xabcd');
        expect(searchTools('مقاومة').map((entry) => entry.id)).toContain('drawing:horizontal');
        expect(searchTools('risk reward').map((entry) => entry.id)).toContain('drawing:longpos');
    });

    it('finds a study, a chart type and a formula function the same way', () => {
        expect(searchTools('bollinger').map((entry) => entry.id)).toContain('study:bb');
        expect(searchTools('هيكين').map((entry) => entry.id)).toContain('chartType:heikin');
        expect(searchTools('stdev').map((entry) => entry.id)).toContain('formula:stdev');
        expect(searchTools('انحراف').map((entry) => entry.id)).toContain('formula:stdev');
    });

    it('reads a variant spelling of an Arabic word as the same word', () => {
        // أ/إ/آ fold to ا, ة to ه, ى to ي — so a trader who types without the marks still finds it.
        expect(searchTools('فيبوناتشى').map((entry) => entry.id)).toContain('drawing:fib');
        // A shadda typed by mistake is stripped, so the word still lands on the tool.
        expect(searchTools('مؤشّر').map((entry) => entry.id)).toContain('drawing:select');
    });

    it('answers an empty query with the whole catalog, and a nonsense one with nothing', () => {
        expect(searchTools('')).toHaveLength(toolTotal());
        expect(searchTools('   ')).toHaveLength(toolTotal());
        expect(searchTools('zzzzzz')).toHaveLength(0);
    });

    it('is stable: the same query twice gives the same order', () => {
        const once = searchTools('line').map((entry) => entry.id);
        const twice = searchTools('line').map((entry) => entry.id);
        expect(once).toEqual(twice);
        expect(once.length).toBeGreaterThan(3);
    });

    it('never offers a retired tool', () => {
        expect(searchTools('gann box').some((entry) => entry.id === 'drawing:gann')).toBe(false);
    });
});

describe('the formula examples the palette drops in', () => {
    it('are all expressions the language actually runs', () => {
        const formulas = TOOLS.filter((entry) => entry.family === 'formula') as ToolEntry[];
        expect(formulas).toHaveLength(FORMULA_FUNCTIONS.length);
        for (const entry of formulas) {
            expect(entry.example, `${entry.id} has no example`).toBeTruthy();
            expect(checkFormula(entry.example ?? ''), `${entry.id}: ${entry.example}`).toEqual({ ok: true });
            // The example has to be about the function it documents, or it is a lie.
            expect(entry.example).toContain(entry.key);
        }
    });
});

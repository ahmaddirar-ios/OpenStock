// Whole-chart templates. lib/chart/drawing-templates.ts answers "what does my analysis stroke look like",
// per tool; this answers "what does my whole setup look like" — every drawing *and* every study on the
// chart, saved under a name and stamped onto any symbol. It is the difference between re-copying a
// colour and re-building a layout: a swing template is the trendlines, the Gann fan, the moving
// averages and the RSI, all in one pick.
//
// Kept in the browser, next to the stroke templates and the per-tool styles: it is a preference, not
// part of one chart, so it never travels to the account and never belongs to a symbol.

import { MAX_DRAWINGS, cloneDrawing, newDrawingId, parseDrawingList, type Drawing } from '@/lib/chart/drawings';
import { MAX_STUDIES, parseStudies, type StudyConfig } from '@/lib/chart/studies';

export const CHART_TEMPLATES_KEY = 'openstock:chart-templates';

/** Enough for a real shelf of setups, few enough to stay readable in a menu. */
export const MAX_CHART_TEMPLATES = 20;
export const MAX_CHART_TEMPLATE_NAME = 40;

export type ChartTemplate = {
    id: string;
    name: string;
    /** The shapes, exactly as the chart stores them; instantiated with fresh ids when applied. */
    drawings: Drawing[];
    /** The studies, replaced by id when applied, the same way an imported setup merges them. */
    studies: StudyConfig[];
};

/** Trim and collapse whitespace; an empty result means "no name, no template". */
export const cleanChartTemplateName = (raw: unknown): string =>
    typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_CHART_TEMPLATE_NAME) : '';

/**
 * Parses whatever was stored. The drawings go through the one validator the loader and the importer
 * use and the studies through the registry's own parser, so a stale or hand-edited row can only lose
 * entries, never reach the chart as something malformed.
 */
export function parseChartTemplates(raw: string | null): ChartTemplate[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const templates: ChartTemplate[] = [];
        for (const entry of parsed) {
            if (typeof entry !== 'object' || entry === null) continue;
            const candidate = entry as Record<string, unknown>;
            const name = cleanChartTemplateName(candidate.name);
            const id = typeof candidate.id === 'string' && candidate.id ? candidate.id : '';
            if (!name || !id) continue;
            if (templates.some((template) => template.name.toLowerCase() === name.toLowerCase())) continue;
            const drawings = parseDrawingList(candidate.drawings);
            const studies = parseStudies({ v: 1, studies: candidate.studies });
            // An empty template is not a template: there is nothing to stamp onto a chart.
            if (drawings.length === 0 && studies.length === 0) continue;
            templates.push({ id, name, drawings, studies });
            if (templates.length >= MAX_CHART_TEMPLATES) break;
        }
        return templates;
    } catch {
        return [];
    }
}

export const serializeChartTemplates = (templates: ChartTemplate[]): string => JSON.stringify(templates);

export function loadChartTemplates(): ChartTemplate[] {
    if (typeof window === 'undefined') return [];
    try {
        return parseChartTemplates(window.localStorage.getItem(CHART_TEMPLATES_KEY));
    } catch {
        return [];
    }
}

export function saveChartTemplates(templates: ChartTemplate[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(CHART_TEMPLATES_KEY, serializeChartTemplates(templates));
    } catch {
        // A full or blocked store must not break the chart; the template simply is not kept.
    }
}

/**
 * Adds a template, replacing one that already answers to the same name (case-insensitive) so
 * "swing" saved twice is one entry, not two. Returns the list unchanged when the name is empty or the
 * template carries nothing, or when the shelf is full.
 */
export function addChartTemplate(
    templates: ChartTemplate[],
    name: string,
    drawings: readonly Drawing[],
    studies: readonly StudyConfig[],
    id = `ct${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
): ChartTemplate[] {
    const cleanedName = cleanChartTemplateName(name);
    if (!cleanedName || (drawings.length === 0 && studies.length === 0)) return templates;
    const without = templates.filter((template) => template.name.toLowerCase() !== cleanedName.toLowerCase());
    if (without.length >= MAX_CHART_TEMPLATES) return templates;
    return [
        ...without,
        {
            id,
            name: cleanedName,
            drawings: drawings.slice(0, MAX_DRAWINGS).map((drawing) => cloneDrawing(drawing, newDrawingId())),
            studies: studies.slice(0, MAX_STUDIES).map((study) => ({ ...study, params: { ...study.params } })),
        },
    ];
}

export function removeChartTemplate(templates: ChartTemplate[], id: string): ChartTemplate[] {
    return templates.filter((template) => template.id !== id);
}

/** What a template carries, for the one-line summary on its row. */
export function chartTemplateCounts(template: ChartTemplate): { drawings: number; studies: number } {
    return { drawings: template.drawings.length, studies: template.studies.length };
}

/**
 * A template made ready for a chart: every drawing gets a fresh id, so stamping a setup onto a symbol
 * that already holds shapes adds them instead of quietly overwriting the ones that share an id. The
 * studies are copied so a later edit to the template cannot mutate what was already applied.
 */
export function instantiateChartTemplate(
    template: ChartTemplate,
    idFactory: () => string = newDrawingId,
): { drawings: Drawing[]; studies: StudyConfig[] } {
    return {
        drawings: template.drawings.map((drawing) => cloneDrawing(drawing, idFactory())),
        studies: template.studies.map((study) => ({ ...study, params: { ...study.params } })),
    };
}

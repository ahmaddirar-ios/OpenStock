// Named drawing templates: a stroke a trader gives a name to once, then applies to any drawing or
// arms for the next one. The per-tool memory in lib/drawing-styles answers "what did I use last time
// for a trend line"; this answers "what does my *analysis* stroke look like", across tools.
//
// Stored once for the whole app, in the browser, next to the per-tool styles: it is a preference,
// not part of a chart, so it never travels to the account.

import type { DrawingStyle } from '@/lib/chart/drawing-styles';
import { DRAWING_DASHES, DRAWING_WIDTHS, isColorKey, type ColorKey, type Drawing, type DrawingDash, type DrawingWidth } from '@/lib/chart/drawings';

export const DRAWING_TEMPLATES_KEY = 'openstock-drawing-templates';

/** Enough for a real set of habits, few enough to stay readable in a menu. */
export const MAX_TEMPLATES = 12;
export const MAX_TEMPLATE_NAME = 24;

export type DrawingTemplate = { id: string; name: string; style: DrawingStyle };

const isWidth = (value: unknown): value is DrawingWidth => typeof value === 'number' && (DRAWING_WIDTHS as readonly number[]).includes(value);
const isDash = (value: unknown): value is DrawingDash => typeof value === 'string' && (DRAWING_DASHES as readonly string[]).includes(value);

/** Trim and collapse whitespace; an empty result means "no name, no template". */
export const cleanTemplateName = (raw: unknown): string =>
    typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TEMPLATE_NAME) : '';

function cleanStyle(raw: unknown): DrawingStyle {
    if (typeof raw !== 'object' || raw === null) return {};
    const candidate = raw as Record<string, unknown>;
    return {
        ...(isColorKey(candidate.color) ? { color: candidate.color } : {}),
        ...(isWidth(candidate.width) ? { width: candidate.width } : {}),
        ...(isDash(candidate.dash) ? { dash: candidate.dash } : {}),
    };
}

const isEmptyStyle = (style: DrawingStyle): boolean =>
    style.color === undefined && style.width === undefined && style.dash === undefined;

/** The stroke a drawing is actually wearing, which is what "save this style" captures. */
export function styleOfDrawing(drawing: Pick<Drawing, 'color' | 'width' | 'dash' | 'italic' | 'fill' | 'fillOpacity'>): DrawingStyle {
    return cleanStyle({
        color: drawing.color,
        width: drawing.width,
        dash: drawing.dash,
        italic: drawing.italic,
        fill: drawing.fill,
        fillOpacity: drawing.fillOpacity,
    });
}

/** Parses whatever was stored. Anything malformed is dropped, never thrown. */
export function parseTemplates(raw: string | null): DrawingTemplate[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const templates: DrawingTemplate[] = [];
        for (const entry of parsed) {
            if (typeof entry !== 'object' || entry === null) continue;
            const candidate = entry as Record<string, unknown>;
            const name = cleanTemplateName(candidate.name);
            const id = typeof candidate.id === 'string' && candidate.id ? candidate.id : '';
            if (!name || !id) continue;
            const style = cleanStyle(candidate.style);
            if (isEmptyStyle(style)) continue;
            if (templates.some((t) => t.name.toLowerCase() === name.toLowerCase())) continue;
            templates.push({ id, name, style });
            if (templates.length >= MAX_TEMPLATES) break;
        }
        return templates;
    } catch {
        return [];
    }
}

export const serializeTemplates = (templates: DrawingTemplate[]): string => JSON.stringify(templates);

export function loadTemplates(): DrawingTemplate[] {
    if (typeof window === 'undefined') return [];
    try {
        return parseTemplates(window.localStorage.getItem(DRAWING_TEMPLATES_KEY));
    } catch {
        return [];
    }
}

export function saveTemplates(templates: DrawingTemplate[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(DRAWING_TEMPLATES_KEY, serializeTemplates(templates));
    } catch {
        // A full or blocked store must not break the chart; the template simply is not kept.
    }
}

/**
 * Adds a template, replacing one that already answers to the same name (case-insensitive) so
 * "analysis" updated twice is one entry, not two. Returns the list unchanged when the name or the
 * style is empty, or when the list is full.
 */
export function addTemplate(templates: DrawingTemplate[], name: string, style: DrawingStyle, id = `t${Date.now().toString(36)}`): DrawingTemplate[] {
    const cleanedName = cleanTemplateName(name);
    const cleanedStyle = cleanStyle(style);
    if (!cleanedName || isEmptyStyle(cleanedStyle)) return templates;
    const without = templates.filter((template) => template.name.toLowerCase() !== cleanedName.toLowerCase());
    if (without.length >= MAX_TEMPLATES) return templates;
    return [...without, { id, name: cleanedName, style: cleanedStyle }];
}

export function removeTemplate(templates: DrawingTemplate[], id: string): DrawingTemplate[] {
    return templates.filter((template) => template.id !== id);
}

/** The stroke a template stands for, or null when the id is unknown. */
export function templateStyle(templates: DrawingTemplate[], id: string): DrawingStyle | null {
    return templates.find((template) => template.id === id)?.style ?? null;
}

/** A template's style as drawing fields, ready to spread over a drawing. */
export const stylePatch = (style: DrawingStyle): Pick<Drawing, 'color' | 'width' | 'dash' | 'italic' | 'fill' | 'fillOpacity'> => ({
    ...(style.color ? { color: style.color as ColorKey } : {}),
    ...(style.width ? { width: style.width } : {}),
    ...(style.dash ? { dash: style.dash } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.fill ? { fill: style.fill as ColorKey } : {}),
    ...(style.fillOpacity !== undefined ? { fillOpacity: style.fillOpacity } : {}),
});

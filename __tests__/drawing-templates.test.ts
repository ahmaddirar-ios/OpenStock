import { describe, expect, it } from 'vitest';
import {
    MAX_TEMPLATES,
    addTemplate,
    cleanTemplateName,
    parseTemplates,
    removeTemplate,
    styleOfDrawing,
    stylePatch,
    templateStyle,
} from '@/lib/chart/drawing-templates';

const style = { color: 'orange' as const, width: 2 as const, dash: 'dashed' as const };

describe('drawing templates', () => {
    it('stores a named stroke and reads it back', () => {
        const list = addTemplate([], '  Analysis   stroke ', style, 'a1');
        expect(list).toEqual([{ id: 'a1', name: 'Analysis stroke', style }]);
        expect(templateStyle(list, 'a1')).toEqual(style);
        expect(templateStyle(list, 'nope')).toBeNull();
    });

    it('replaces a template that answers to the same name, ignoring case', () => {
        const first = addTemplate([], 'Level', style, 'a1');
        const second = addTemplate(first, 'level', { color: 'teal' }, 'a2');
        expect(second).toHaveLength(1);
        expect(second[0]).toMatchObject({ id: 'a2', style: { color: 'teal' } });
    });

    it('refuses an empty name, an empty style, and a full list', () => {
        expect(addTemplate([], '   ', style)).toEqual([]);
        expect(addTemplate([], 'empty', {})).toEqual([]);
        const full = Array.from({ length: MAX_TEMPLATES }, (_, i) => ({ id: `t${i}`, name: `t${i}`, style }));
        expect(addTemplate(full, 'one more', style)).toHaveLength(MAX_TEMPLATES);
    });

    it('drops off-palette values instead of keeping them', () => {
        const [template] = parseTemplates(JSON.stringify([{ id: 'x', name: 'weird', style: { color: 'neon', width: 9, dash: 'solid' } }]));
        expect(template.style).toEqual({ dash: 'solid' });
    });

    it('survives junk in storage', () => {
        expect(parseTemplates(null)).toEqual([]);
        expect(parseTemplates('not json')).toEqual([]);
        expect(parseTemplates('{"a":1}')).toEqual([]);
        expect(parseTemplates(JSON.stringify([{ name: 'no id', style }]))).toEqual([]);
    });

    it('removes by id and captures the stroke of a drawing', () => {
        const list = addTemplate([], 'one', style, 'a1');
        expect(removeTemplate(list, 'a1')).toEqual([]);
        expect(styleOfDrawing({ color: 'blue', width: 3, dash: 'dotted' })).toEqual({ color: 'blue', width: 3, dash: 'dotted' });
        expect(stylePatch(style)).toEqual(style);
    });

    it('caps the name at a length a menu can show', () => {
        expect(cleanTemplateName('x'.repeat(60))).toHaveLength(24);
    });
});

// Entitlements: the plan, the exceptions on top, and the one resolver that combines them.
//
// These tests are deliberately about the *rules*, not the storage: a plan is a bundle, deny beats
// allow, unknown names are dropped, and an unfiltered set means "everything" for registries.
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PLAN,
    FEATURES,
    FEATURE_GROUPS,
    PAGE_FEATURE,
    PLAN_FEATURES,
    PLANS,
    cleanFeatures,
    hasFeature,
    isFeature,
    isPlan,
    resolveFeatures,
} from '@/lib/plans';
import {
    allowedChartTypes,
    allowedStudies,
    canUseDrawing,
    canUseStudy,
    canUseTool,
    featureOfChartType,
    featureOfDrawing,
    featureOfStudy,
    featureOfTool,
} from '@/lib/tools/access';
import { STUDIES, STUDY_IDS } from '@/lib/chart/studies';
import { CHART_TYPES } from '@/lib/chart/view';
import { toolById } from '@/lib/tools/catalog';
import { PAGES, visiblePages, visiblePagesInSection } from '@/lib/shell/pages';
import { commandPages, commandTools } from '@/lib/shell/command';
import { groupByResource } from '@/lib/authz';

describe('the plan catalogue', () => {
    it('has a default plan that is a real plan', () => {
        expect(PLANS).toContain(DEFAULT_PLAN);
    });

    it('lists plans from smallest to largest, each a superset of the one before', () => {
        for (let index = 1; index < PLANS.length; index += 1) {
            const later = new Set(PLAN_FEATURES[PLANS[index]]);
            for (const feature of PLAN_FEATURES[PLANS[index - 1]]) expect(later.has(feature)).toBe(true);
        }
    });

    it('gives the top plan every feature, so a new feature is never silently sold twice', () => {
        expect(new Set(PLAN_FEATURES.premium)).toEqual(new Set(FEATURES));
    });

    it('names every feature in an admin group, exactly once', () => {
        const grouped = FEATURE_GROUPS.flatMap((group) => group.features);
        expect(new Set(grouped)).toEqual(new Set(FEATURES));
        expect(grouped).toHaveLength(FEATURES.length);
    });

    it('recognises plans and features, and refuses the rest', () => {
        expect(isPlan('pro')).toBe(true);
        expect(isPlan('enterprise')).toBe(false);
        expect(isPlan(null)).toBe(false);
        expect(isFeature('page.charts')).toBe(true);
        expect(isFeature('page.nowhere')).toBe(false);
        expect(isFeature(7)).toBe(false);
    });
});

describe('resolveFeatures', () => {
    it('returns the plan when there are no exceptions', () => {
        expect(new Set(resolveFeatures('pro'))).toEqual(new Set(PLAN_FEATURES.pro));
    });

    it('adds an allowance the plan lacks', () => {
        expect(resolveFeatures('free', ['page.screener'])).toContain('page.screener');
    });

    it('removes a denial the plan includes', () => {
        expect(resolveFeatures('premium', [], ['tool.drawing.elliott'])).not.toContain('tool.drawing.elliott');
    });

    it('lets deny win over allow for the same feature', () => {
        expect(resolveFeatures('free', ['page.screener'], ['page.screener'])).not.toContain('page.screener');
    });

    it('drops unknown names and keeps catalogue order', () => {
        const features = resolveFeatures('free', ['page.screener', 'tool.made-up'], ['nope']);
        expect(features).not.toContain('tool.made-up' as never);
        // The result is ordered by the catalogue, not by however the row was written.
        expect(features).toEqual(FEATURES.filter((feature) => features.includes(feature)));
    });

    it('never resolves a feature outside the catalogue', () => {
        const everything = resolveFeatures('premium', ['tool.made-up']);
        for (const feature of everything) expect(FEATURES).toContain(feature);
    });
});

describe('cleanFeatures', () => {
    it('keeps only known names, deduplicated and ordered', () => {
        expect(cleanFeatures(['page.charts', 'page.charts', 'x', 'page.saudi'])).toEqual([
            'page.saudi',
            'page.charts',
        ]);
    });

    it('treats a missing list as empty', () => {
        expect(cleanFeatures(undefined)).toEqual([]);
        expect(cleanFeatures(null)).toEqual([]);
    });
});

describe('hasFeature', () => {
    it('treats an undefined set as unfiltered, which is what tests and registries want', () => {
        expect(hasFeature(undefined, 'page.charts')).toBe(true);
        expect(hasFeature([], 'page.charts')).toBe(false);
        expect(hasFeature(['page.charts'], 'page.charts')).toBe(true);
    });
});

describe('a page is guarded where its feature says it is', () => {
    it('maps only addresses the shell actually knows', () => {
        const hrefs = new Set(PAGES.map((page) => page.href));
        for (const href of Object.keys(PAGE_FEATURE)) expect(hrefs.has(href)).toBe(true);
    });

    it('uses a feature that exists for every gated page', () => {
        for (const feature of Object.values(PAGE_FEATURE)) expect(FEATURES).toContain(feature);
    });

    it('hides pages the plan lacks, from the rail and from the command bar alike', () => {
        const free = resolveFeatures('free');
        expect(visiblePages('user', free).map((page) => page.href)).not.toContain('/screener');
        expect(commandPages('screener', 'user', free)).toEqual([]);

        const pro = resolveFeatures('pro');
        expect(visiblePages('user', pro).map((page) => page.href)).toContain('/screener');
        expect(commandPages('screener', 'user', pro).map((page) => page.href)).toEqual(['/screener']);
    });

    it('hides a whole section when its pages are locked', () => {
        const noAnalysis = resolveFeatures('free', [], ['page.screener', 'page.scanner', 'page.charts', 'page.strategies']);
        expect(visiblePagesInSection('analysis', 'user', noAnalysis)).toEqual([]);
    });

    it('leaves the open pages alone whatever the plan', () => {
        const nothing = resolveFeatures('free', [], [...FEATURES]);
        expect(visiblePages('user', nothing).map((page) => page.href)).toContain('/tools');
        expect(visiblePages('user', nothing).map((page) => page.href)).toContain('/dashboard');
    });
});

describe('tools map onto the same feature names', () => {
    it('files every drawing under the feature of its group', () => {
        expect(featureOfDrawing('trend')).toBe('tool.drawing.lines');
        expect(featureOfDrawing('fib')).toBe('tool.drawing.fib');
        expect(featureOfDrawing('xabcd')).toBe('tool.drawing.patterns');
        // The cursor group is rail furniture, not a drawable tool, so it maps to nothing here.
        expect(featureOfDrawing('text')).toBe('tool.drawing.annotation');
    });

    it('splits studies into overlays and oscillators by their own group', () => {
        for (const id of STUDY_IDS) {
            const expected = id === 'formula'
                ? 'tool.formula'
                : STUDIES[id].group === 'oscillator'
                    ? 'tool.study.oscillator'
                    : 'tool.study.overlay';
            expect(featureOfStudy(id)).toBe(expected);
        }
        // The formula editor is sold on its own, even though its study sits on the price.
        expect(featureOfStudy('formula')).toBe('tool.formula');
    });

    it('puts every chart type and formula behind its single family switch', () => {
        for (const type of CHART_TYPES) expect(featureOfChartType(type)).toBe('tool.chartType');
    });

    it('answers for a catalogue entry by its family', () => {
        expect(featureOfTool(toolById('drawing:fib')!)).toBe('tool.drawing.fib');
        expect(featureOfTool(toolById('study:rsi')!)).toBe('tool.study.oscillator');
        expect(featureOfTool(toolById('chartType:candles')!)).toBe('tool.chartType');
        expect(featureOfTool(toolById('formula:sma')!)).toBe('tool.formula');
    });

    it('filters the studies and chart types the menus offer', () => {
        const free = resolveFeatures('free');
        expect(allowedStudies(free).every((id) => STUDIES[id].group === 'overlay')).toBe(true);
        expect(allowedChartTypes(free).length).toBeGreaterThan(0);

        const pro = resolveFeatures('pro');
        expect(allowedStudies(pro).length).toBeGreaterThan(allowedStudies(free).length);
    });

    it('never lets a locked family through a synonym search', () => {
        const free = resolveFeatures('free');
        const found = commandTools('فيبوناتشي', 12, free);
        expect(found.every((entry) => canUseTool(free, entry))).toBe(true);
        expect(canUseDrawing(free, 'fib')).toBe(false);
        expect(canUseStudy(free, 'rsi')).toBe(false);
    });
});

describe('staff hold the entitlements capability', () => {
    it('lets a moderator change a customer plan, and refuses a plain user', () => {
        expect(groupByResource('moderator').user).toContain('entitlements');
        expect(groupByResource('admin').user).toContain('entitlements');
        expect(groupByResource('support').user).not.toContain('entitlements');
        expect(groupByResource('user').user).toBeUndefined();
    });
});

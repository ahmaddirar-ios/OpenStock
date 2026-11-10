// A gated page has to be refused *before* the shell streams.
//
// `requireFeaturePage` inside a page runs after Next has flushed the workspace shell (the route's
// `loading.tsx` is the Suspense boundary), so `redirect()` there becomes a client meta redirect
// instead of a 307. That pending full-page navigation races the shell's alert poll — a Server
// Action — and the router dies with React error #310.
//
// The real gate therefore lives in `app/(root)/layout.tsx`, above the boundary, using the pathname
// the proxy puts on the request. These tests keep the two in step: a new gated page that is not in
// `PAGE_FEATURE` would fall back to the page-level redirect and bring the crash back.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURES, PAGE_FEATURE, type Feature } from '@/lib/plans';

const ROOT = 'app/(root)';

/** Every `page.tsx` under the workspace, with its route and its source. */
const workspacePages = (): { route: string; source: string }[] => {
    const walk = (dir: string, route: string): { route: string; source: string }[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            if (entry.isDirectory()) return walk(join(dir, entry.name), `${route}/${entry.name}`);
            if (entry.name !== 'page.tsx') return [];
            return [{ route: route === '' ? '/' : route, source: readFileSync(join(dir, entry.name), 'utf8') }];
        });
    return walk(ROOT, '');
};

/** The feature a page guards with, if it guards at all. */
const guardOf = (source: string): Feature | null => {
    const match = source.match(/requireFeaturePage\(\s*'([^']+)'/);
    return match ? (match[1] as Feature) : null;
};

describe('a page feature is enforced above the loading boundary', () => {
    const pages = workspacePages();
    const gated = pages
        .map((page) => ({ route: page.route, feature: guardOf(page.source) }))
        .filter((page): page is { route: string; feature: Feature } => page.feature !== null);

    it('finds the gated pages, so the scan itself is not silently empty', () => {
        expect(gated.length).toBeGreaterThanOrEqual(9);
        expect(gated.map((page) => page.route)).toContain('/screener');
    });

    it('names a real feature everywhere a page guards itself', () => {
        for (const page of gated) expect(FEATURES, page.route).toContain(page.feature);
    });

    it('lists every gated page in PAGE_FEATURE with the same feature', () => {
        for (const page of gated) expect(PAGE_FEATURE[page.route], page.route).toBe(page.feature);
    });

    it('leaves no PAGE_FEATURE entry without a page that guards itself', () => {
        const routes = new Set(gated.map((page) => page.route));
        for (const route of Object.keys(PAGE_FEATURE)) expect(routes, route).toContain(route);
    });

    it('reads the proxy pathname in the workspace layout, not in the pages', () => {
        const layout = readFileSync(join(ROOT, 'layout.tsx'), 'utf8');
        expect(layout).toContain('PAGE_FEATURE');
        expect(layout).toContain('x-pathname');
        const middleware = readFileSync('middleware.ts', 'utf8');
        expect(middleware).toContain("headers.set('x-pathname'");
    });
});

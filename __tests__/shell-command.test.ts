import { describe, expect, it } from 'vitest';
import { tx, type Lang } from '@/lib/i18n';
import { PAGES, PAGE_SECTIONS, pageByHref, pagesInSection, visiblePages, visiblePagesInSection } from '@/lib/shell/pages';
import { commandPages, commandTools, toolHref, toolFromParam, DEFAULT_SYMBOL } from '@/lib/shell/command';
import { searchTools } from '@/lib/tools/catalog';

const LANGS: Lang[] = ['en', 'ar'];

describe('the shell’s one page list', () => {
    it('gives every page a unique address under the root', () => {
        const hrefs = PAGES.map((page) => page.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
        for (const href of hrefs) expect(href.startsWith('/')).toBe(true);
    });

    it('names every page in both languages, not by its own key', () => {
        for (const page of PAGES) {
            for (const lang of LANGS) {
                const name = tx(lang, page.labelKey);
                expect(name).toBeTruthy();
                expect(name).not.toBe(page.labelKey);
            }
        }
    });

    it('gives every page a section, and every section a heading', () => {
        const sections = new Set(PAGE_SECTIONS.map((section) => section.id));
        for (const page of PAGES) expect(sections.has(page.section)).toBe(true);
        // No empty section in the sidebar, and no page that belongs to nothing.
        for (const section of PAGE_SECTIONS) expect(pagesInSection(section.id).length).toBeGreaterThan(0);
    });

    it('finds a page by its address', () => {
        expect(pageByHref('/world')?.labelKey).toBe('nav.world');
        expect(pageByHref('/nope')).toBeUndefined();
    });
});

describe('the shell offers only what a role can open', () => {
    it('hides the admin entry from a plain user and shows it to every staff role', () => {
        expect(visiblePages('user').map((page) => page.href)).not.toContain('/admin');
        for (const role of ['viewer', 'support', 'moderator', 'admin'] as const) {
            expect(visiblePages(role).map((page) => page.href)).toContain('/admin');
        }
    });

    it('keeps every open page for every role', () => {
        for (const role of ['user', 'viewer', 'support', 'moderator', 'admin'] as const) {
            const visible = new Set(visiblePages(role).map((page) => page.href));
            for (const page of PAGES) {
                if (!page.requires && !page.requiresStaff) expect(visible.has(page.href)).toBe(true);
            }
        }
    });

    it('drops the admin section for a plain user', () => {
        expect(visiblePagesInSection('admin', 'user')).toEqual([]);
        expect(visiblePagesInSection('admin', 'viewer').map((page) => page.href)).toEqual(['/admin']);
    });

    it('filters the command bar by role', () => {
        expect(commandPages('', 'user').map((page) => page.href)).not.toContain('/admin');
        expect(commandPages('admin', 'admin').map((page) => page.href)).toContain('/admin');
    });
});

describe('the command bar', () => {
    it('answers an empty query with the pages, and no tools', () => {
        expect(commandPages('')).toHaveLength(PAGES.length);
        expect(commandTools('')).toEqual([]);
    });

    it('finds a page by its Arabic name and by a synonym', () => {
        expect(commandPages('الأسواق العالمية')[0]?.href).toBe('/world');
        expect(commandPages('سلع')[0]?.href).toBe('/world');
        expect(commandPages('screener')[0]?.href).toBe('/screener');
    });

    it('finds a tool by its Arabic name, its English name and a variant spelling', () => {
        const ids = (query: string) => commandTools(query).map((entry) => entry.id);
        expect(ids('فيبوناتشي')).toContain('drawing:fib');
        expect(ids('fib')).toContain('drawing:fib');
        // The catalogue folds hamza/ya/ta-marbuta, so a trader who types it differently still lands.
        expect(ids('فيبوناتشى')).toContain('drawing:fib');
        expect(commandTools('')).toEqual([]);
    });

    it('caps the tool list so the dialog is not a wall', () => {
        expect(commandTools('a').length).toBeLessThanOrEqual(12);
        // Narrowing a query never grows the answer.
        expect(commandTools('fib').length).toBeLessThanOrEqual(commandTools('f').length);
    });

    it('is stable: the same query answers in the same order', () => {
        expect(commandTools('line').map((entry) => entry.id)).toEqual(commandTools('line').map((entry) => entry.id));
        expect(commandPages('a').map((page) => page.href)).toEqual(commandPages('a').map((page) => page.href));
    });

    it('turns a tool into a shareable address that survives the round trip', () => {
        const entry = searchTools('fibonacci')[0];
        const href = toolHref(entry);
        const url = new URL(href, 'https://rovexjo.com');
        expect(url.pathname).toBe(`/stocks/${DEFAULT_SYMBOL}`);
        expect(url.searchParams.get('tool')).toBe(entry.id);
        expect(toolFromParam(url.searchParams.get('tool'))?.id).toBe(entry.id);
    });

    it('lands on the trader’s symbol when one is known', () => {
        const entry = searchTools('trend')[0];
        expect(toolHref(entry, '2222.SR')).toBe(`/stocks/2222.SR?tool=${encodeURIComponent(entry.id)}`);
    });

    it('ignores a stale or forged tool id instead of throwing', () => {
        expect(toolFromParam(null)).toBeUndefined();
        expect(toolFromParam('drawing:not-a-tool')).toBeUndefined();
        expect(toolFromParam('')).toBeUndefined();
    });
});


describe('the menu bar is a second door, not a second list', () => {
    it('points every menu row at a page the shell already knows', async () => {
        const { MENUS } = await import('@/components/shell/MenuBar');
        const known = new Set(PAGES.map((page) => page.href));
        for (const menu of MENUS) {
            expect(tx('en', menu.labelKey)).not.toBe(menu.labelKey);
            expect(tx('ar', menu.labelKey)).not.toBe(menu.labelKey);
            for (const item of menu.items) {
                if (!item.href) continue;
                expect(known.has(item.href), `${menu.id} → ${item.href}`).toBe(true);
                // The action rows (search, theme, language, sign out) carry no href.
            }
        }
    });
});

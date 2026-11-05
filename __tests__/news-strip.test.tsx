// @vitest-environment jsdom
// The overview keeps the news on one slim row: the headline is the thing, the source and the age
// sit beside it, and the whole row scrolls sideways. An empty feed draws nothing at all — a strip
// with a title and no headlines is a wasted 40px above the status bar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import NewsStrip from '@/components/news/NewsStrip';

const article = (over: Partial<MarketNewsArticle> = {}): MarketNewsArticle => ({
    id: 1,
    headline: 'أرامكو ترفع توزيعاتها الفصلية',
    summary: '',
    source: 'الاقتصادية',
    url: 'https://example.com/a',
    datetime: Math.floor(Date.now() / 1000) - 3600,
    category: 'company',
    related: '2222',
    ...over,
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

// jsdom has no layout and no observers: the strip decides whether to roll by measuring, so the
// tests hand it the measurements and a no-op observer.
const layout = (contentWidth: number, rowWidth: number, reduceMotion = false) => {
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(contentWidth);
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(rowWidth);
    vi.stubGlobal('ResizeObserver', class {
        observe() {}
        disconnect() {}
    });
    vi.stubGlobal('matchMedia', () => ({ matches: reduceMotion, addEventListener() {}, removeEventListener() {} }));
};

beforeEach(() => {
    vi.unstubAllGlobals();
});

describe('the news strip', () => {
    it('prints one row per headline, linked to its story', () => {
        render(<NewsStrip news={[article(), article({ id: 2, headline: 'تاسي يغلق مرتفعاً', url: 'https://example.com/b' })]} lang="ar" />);

        const links = screen.getAllByRole('link');
        expect(links).toHaveLength(2);
        expect(links[0].getAttribute('href')).toBe('https://example.com/a');
        expect(links[0].textContent).toContain('أرامكو ترفع توزيعاتها الفصلية');
        expect(links[0].textContent).toContain('الاقتصادية');
        expect(links[1].textContent).toContain('تاسي يغلق مرتفعاً');
    });

    it('opens a story in a new tab, without handing it the opener', () => {
        render(<NewsStrip news={[article()]} lang="en" />);
        const link = screen.getByRole('link');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('marks a story with no ticker as market-wide', () => {
        render(<NewsStrip news={[article({ related: '' })]} lang="en" />);
        expect(screen.getByRole('link').textContent).toContain('MKT');
    });

    it('names itself in the page language', () => {
        const { rerender } = render(<NewsStrip news={[article()]} lang="en" />);
        expect(screen.getByRole('region').getAttribute('aria-label')).toBe('Market news');
        rerender(<NewsStrip news={[article()]} lang="ar" />);
        expect(screen.getByRole('region').getAttribute('aria-label')).toBe('أخبار السوق');
    });

    it('draws nothing when the feed is empty', () => {
        const { container } = render(<NewsStrip news={[]} lang="en" />);
        expect(container.innerHTML).toBe('');
    });
});

// The strip is a ticker now: the stories travel past the row instead of waiting to be dragged.
describe('the rolling strip', () => {
    const two = [article(), article({ id: 2, headline: 'تاسي يغلق مرتفعاً', url: 'https://example.com/b' })];

    it('rolls wider stories past the row, one copy silent', () => {
        layout(2400, 900);
        render(<NewsStrip news={two} lang="ar" />);

        // Two copies in the DOM so the loop has no seam; only one of them is read out or tabbed to.
        expect(document.querySelectorAll('.news-strip-item')).toHaveLength(4);
        expect(screen.getAllByRole('link')).toHaveLength(2);
        expect(document.querySelectorAll('[aria-hidden="true"] .news-strip-item')).toHaveLength(2);
        expect(document.querySelector('.news-strip-track')?.getAttribute('style')).toContain('animation-duration');
    });

    it('offers a pause, because a moving strip must be stoppable', () => {
        layout(2400, 900);
        render(<NewsStrip news={[article()]} lang="en" />);

        const button = screen.getByRole('button', { name: 'Pause the news strip' });
        expect(button.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(button);
        expect(screen.getByRole('button', { name: 'Play the news strip' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('stays a still list when the stories already fit', () => {
        layout(600, 900);
        render(<NewsStrip news={[article()]} lang="en" />);

        expect(document.querySelectorAll('.news-strip-item')).toHaveLength(1);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('does not move for a reader who asked for less motion', () => {
        layout(2400, 900, true);
        render(<NewsStrip news={[article()]} lang="en" />);

        expect(document.querySelectorAll('.news-strip-item')).toHaveLength(1);
        expect(screen.queryByRole('button')).toBeNull();
    });
});

// @vitest-environment jsdom
// The overview keeps the news on one slim row: the headline is the thing, the source and the age
// sit beside it, and the whole row scrolls sideways. An empty feed draws nothing at all — a strip
// with a title and no headlines is a wasted 40px above the status bar.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

afterEach(cleanup);

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

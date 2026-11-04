import { describe, expect, it } from 'vitest';
import { decodeChartShare, encodeChartShare, sharePath, type ChartShare } from '@/lib/chart-share';

const share: ChartShare = {
    symbol: '2222.SR',
    interval: '1d',
    chartType: 'heikin',
    studies: [],
};

describe('chart share links', () => {
    it('round-trips a view', () => {
        const token = encodeChartShare(share);
        expect(decodeChartShare(token)).toEqual(share);
    });

    it('makes a relative link that carries the token', () => {
        expect(sharePath(share)).toMatch(/^\/stocks\/2222\.SR\?c=[A-Za-z0-9_-]+$/);
    });

    it('refuses a token it cannot draw', () => {
        expect(decodeChartShare(null)).toBeNull();
        expect(decodeChartShare('')).toBeNull();
        expect(decodeChartShare('not-base64-$$$')).toBeNull();
        expect(decodeChartShare(btoa('{"v":9}'))).toBeNull();
        // A symbol the chart has no page for, an interval that does not exist, a chart type that does not.
        expect(decodeChartShare(encodeChartShare({ ...share, symbol: 'BAD SYMBOL!' }))).toBeNull();
        expect(decodeChartShare(encodeChartShare({ ...share, interval: '7x' as never }))).toBeNull();
        expect(decodeChartShare(encodeChartShare({ ...share, chartType: 'candles2' as never }))).toBeNull();
    });

    it('survives a token with studies', () => {
        const withStudies = encodeChartShare({ ...share, studies: [{ id: 'rsi', params: {} } as never] });
        const decoded = decodeChartShare(withStudies);
        expect(decoded?.symbol).toBe('2222.SR');
        expect(Array.isArray(decoded?.studies)).toBe(true);
    });
});

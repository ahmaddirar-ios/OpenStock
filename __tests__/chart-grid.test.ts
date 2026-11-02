import { describe, expect, it } from 'vitest';
import {
    CHART_LAYOUTS,
    DEFAULT_LAYOUT,
    LAYOUT_IDS,
    MAX_PANES,
    clipToCursor,
    normalizeGridSymbols,
    paneOwning,
    paneSymbols,
    parseGridLayout,
    parseGridState,
    randomReplayTime,
    replayAnchor,
    replayEndTime,
    replayStartTime,
    searchUniverse,
    serializeGridState,
    serializeGridSymbols,
    sessionChange,
    stepReplayTime,
    universeName,
} from '@/lib/chart-grid';
import { MIN_WARMUP_BARS } from '@/lib/replay';
import type { Candle } from '@/lib/yahoo-candles';

const candle = (time: number, close: number): Candle => ({ time, open: close, high: close, low: close, close, volume: 1 });

describe('layouts', () => {
    it('offers four shapes, from one pane to four', () => {
        expect(LAYOUT_IDS).toEqual([1, 2, 3, 4]);
        expect(LAYOUT_IDS.map((id) => CHART_LAYOUTS[id].panes)).toEqual([1, 2, 3, 4]);
    });

    it('stacks on a phone whatever the shape', () => {
        for (const id of LAYOUT_IDS) expect(CHART_LAYOUTS[id].className).toContain('grid-cols-1');
    });

    it('gives layout 3 a tall first pane and the others none', () => {
        expect(CHART_LAYOUTS[3].firstClassName).toBe('lg:row-span-2');
        expect(CHART_LAYOUTS[4].firstClassName).toBe('');
    });

    it('parses a layout from the URL and rejects nonsense', () => {
        expect(parseGridLayout('2')).toBe(2);
        expect(parseGridLayout(3)).toBe(3);
        expect(parseGridLayout('5')).toBeNull();
        expect(parseGridLayout('two')).toBeNull();
        expect(parseGridLayout(undefined)).toBeNull();
        expect(DEFAULT_LAYOUT).toBe(4);
    });
});

describe('normalizeGridSymbols', () => {
    it('resolves Tadawul, Hong Kong and plain US tickers', () => {
        expect(normalizeGridSymbols(['2222.SR', '0700.HK', 'aapl'])).toEqual(['2222.SR', '0700.HK', 'AAPL']);
    });

    it('drops junk and blanks', () => {
        expect(normalizeGridSymbols(['', '  ', 'not a symbol!', null, 42, '1120.SR'])).toEqual(['1120.SR']);
    });

    it('never repeats a symbol', () => {
        expect(normalizeGridSymbols(['AAPL', 'aapl', 'AAPL', 'MSFT'])).toEqual(['AAPL', 'MSFT']);
    });

    it('caps at four panes and lets the fallback fill the rest', () => {
        const symbols = normalizeGridSymbols(['AAPL', 'MSFT'], ['2222.SR', '1120.SR', 'NVDA', 'AMD']);
        expect(symbols).toHaveLength(MAX_PANES);
        expect(symbols).toEqual(['AAPL', 'MSFT', '2222.SR', '1120.SR']);
    });
});

describe('pane bookkeeping', () => {
    it('pads the panes that are still empty', () => {
        expect(paneSymbols(['AAPL'], 4)).toEqual(['AAPL', '', '', '']);
        expect(paneSymbols(['AAPL', 'MSFT', 'NVDA'], 2)).toEqual(['AAPL', 'MSFT']);
    });

    it('finds the pane already charting a symbol', () => {
        expect(paneOwning(['AAPL', 'MSFT'], 'msft')).toBe(1);
        expect(paneOwning(['AAPL', 'MSFT'], 'NVDA')).toBe(-1);
        expect(paneOwning(['AAPL', 'MSFT'], 'AAPL', 0)).toBe(-1);
    });
});

describe('parseGridState', () => {
    it('reads the layout, symbols and interval from the query string', () => {
        const state = parseGridState({ l: '3', s: '2222.SR,aapl', i: '60m' });
        expect(state).toEqual({ layout: 3, symbols: ['2222.SR', 'AAPL'], intervalId: '60m' });
    });

    it('takes the first value when a parameter is repeated', () => {
        expect(parseGridState({ l: ['2', '4'], s: ['AAPL,MSFT', 'NVDA'] }).layout).toBe(2);
        expect(parseGridState({ s: ['AAPL,MSFT', 'NVDA'] }).symbols).toEqual(['AAPL', 'MSFT']);
    });

    it('falls back to the remembered workspace, then to the defaults', () => {
        expect(parseGridState({}, { symbols: ['1120.SR'], intervalId: '1wk' })).toEqual({
            layout: 4,
            symbols: ['1120.SR'],
            intervalId: '1wk',
        });
        expect(parseGridState({})).toEqual({ layout: 4, symbols: [], intervalId: '1d' });
    });

    it('ignores an interval Yahoo cannot price and an unreadable layout', () => {
        const state = parseGridState({ l: '9', i: '3d' }, { intervalId: '1mo' });
        expect(state.layout).toBe(4);
        expect(state.intervalId).toBe('1mo');
    });

    it('lets a shared link win over the remembered workspace', () => {
        const state = parseGridState({ s: 'AAPL' }, { symbols: ['MSFT', '2222.SR'] });
        expect(state.symbols).toEqual(['AAPL']);
    });

    it('keeps a cleared pane in place and drops trailing padding', () => {
        expect(parseGridState({ s: '2222.SR,,AAPL' }).symbols).toEqual(['2222.SR', '', 'AAPL']);
        expect(parseGridState({ s: 'AAPL,,' }).symbols).toEqual(['AAPL']);
    });
});

describe('serializeGridState', () => {
    it('round trips through the query string', () => {
        const state = { layout: 2 as const, symbols: ['2222.SR', 'AAPL'], intervalId: '4h' };
        const query = serializeGridState(state);
        expect(query).toBe('l=2&s=2222.SR%2CAAPL&i=4h');
        const parsed = new URLSearchParams(query);
        expect(parseGridState({ l: parsed.get('l')!, s: parsed.get('s')!, i: parsed.get('i')! })).toEqual(state);
    });

    it('keeps an empty workspace readable', () => {
        expect(serializeGridState({ layout: 4, symbols: [], intervalId: '1d' })).toBe('l=4&s=&i=1d');
    });

    it('drops empty panes at the end but keeps a cleared one in the middle', () => {
        expect(serializeGridState({ layout: 4, symbols: ['2222.SR', '', '', ''], intervalId: '1d' })).toBe(
            'l=4&s=2222.SR&i=1d',
        );
        expect(serializeGridSymbols(['2222.SR', '', 'AAPL'])).toBe('2222.SR,,AAPL');
        const query = serializeGridState({ layout: 3, symbols: ['2222.SR', '', 'AAPL'], intervalId: '1wk' });
        expect(parseGridState({ l: '3', s: new URLSearchParams(query).get('s')!, i: '1wk' }).symbols).toEqual([
            '2222.SR',
            '',
            'AAPL',
        ]);
    });
});

describe('sessionChange', () => {
    it('measures the last close against the previous one', () => {
        const change = sessionChange([candle(1, 100), candle(2, 110)]);
        expect(change).toEqual({ price: 110, change: 10, percent: 10 });
    });

    it('reports no move for a single bar and nothing for no bars', () => {
        expect(sessionChange([candle(1, 50)])).toEqual({ price: 50, change: 0, percent: 0 });
        expect(sessionChange([])).toBeNull();
    });

    it('refuses a price that is not usable', () => {
        expect(sessionChange([candle(1, 0), candle(2, 0)])).toBeNull();
        expect(sessionChange([candle(1, 100), candle(2, Number.NaN)])).toBeNull();
    });

    it('falls back to no change when the previous close is broken', () => {
        expect(sessionChange([candle(1, 0), candle(2, 40)])).toEqual({ price: 40, change: 0, percent: 0 });
    });
});

describe('searchUniverse', () => {
    it('finds a Tadawul listing by its number', () => {
        expect(searchUniverse('2222')[0].symbol).toBe('2222.SR');
        expect(searchUniverse('2222.SR')[0].symbol).toBe('2222.SR');
    });

    it('finds it by its Arabic name, whichever spelling is typed', () => {
        expect(searchUniverse('أرامكو').some((row) => row.symbol === '2222.SR')).toBe(true);
        expect(searchUniverse('ارامكو').some((row) => row.symbol === '2222.SR')).toBe(true);
    });

    it('finds a US listing by ticker and by name', () => {
        expect(searchUniverse('AAPL')[0].symbol).toBe('AAPL');
        expect(searchUniverse('apple').some((row) => row.symbol === 'AAPL')).toBe(true);
    });

    it('returns nothing for a blank query and respects the limit', () => {
        expect(searchUniverse('   ')).toEqual([]);
        expect(searchUniverse('a', 3)).toHaveLength(3);
    });
});

describe('universeName', () => {
    it('prefers the Arabic trading name in Arabic mode', () => {
        expect(universeName('2222.SR', 'ar')).toBe('أرامكو السعودية');
        expect(universeName('2222.SR', 'en')).toBe('Saudi Arabian Oil Co.');
    });

    it('returns null for a symbol outside the universe', () => {
        expect(universeName('9999.ZZ', 'en')).toBeNull();
    });
});

// --- replay across the panes ----------------------------------------------------------------

const bars = (times: number[]): Candle[] =>
    times.map((time) => ({ time, open: 10, high: 11, low: 9, close: 10, volume: 100 }));

const day = (i: number) => 1_600_000_000 + i * 86_400;

describe('grid replay', () => {
    const short = bars([day(0), day(1), day(2)]);
    const long = bars(Array.from({ length: 200 }, (_, i) => day(i)));

    it('anchors on the longest series, so a shared step means the same thing everywhere', () => {
        expect(replayAnchor([short, long])).toBe(long);
        expect(replayAnchor([long, short])).toBe(long);
        expect(replayAnchor([[], []])).toBeNull();
        expect(replayAnchor([short])).toBe(short);
    });

    it('starts a shared replay at the latest warm-up bar, so no pane starts blind', () => {
        // The long series has 200 bars, so its warm-up bar is far later than the short one's.
        const start = replayStartTime([short, long]);
        expect(start).toBe(long[MIN_WARMUP_BARS].time);
        expect(replayStartTime([[], []])).toBeNull();
    });

    it('ends at the anchor’s last bar', () => {
        expect(replayEndTime([short, long])).toBe(long[long.length - 1].time);
        expect(replayEndTime([])).toBeNull();
    });

    it('clips a pane to the shared cursor, never below its own warm-up window', () => {
        expect(clipToCursor(short, day(2))).toHaveLength(3);
        expect(clipToCursor(short, day(1))).toHaveLength(2);
        // A cursor older than this pane's data is not a one-bar chart: it is the warm-up window.
        expect(clipToCursor(long, day(0))).toHaveLength(MIN_WARMUP_BARS + 1);
        expect(clipToCursor(short, null)).toHaveLength(3);
        expect(clipToCursor([], day(1))).toEqual([]);
    });

    it('steps the shared cursor by whole bars on the anchor and clamps at both ends', () => {
        const series = [short, long];
        const start = replayStartTime(series)!;
        expect(stepReplayTime(series, null, 1)).toBe(long[MIN_WARMUP_BARS + 1].time);
        expect(stepReplayTime(series, start, 1)).toBe(long[MIN_WARMUP_BARS + 1].time);
        expect(stepReplayTime(series, start, -99)).toBe(long[0].time);
        expect(stepReplayTime(series, null, 999)).toBe(long[long.length - 1].time);
        expect(stepReplayTime([], null, 1)).toBeNull();
    });

    it('offers a random start that is never in the warm-up nor on the last bar', () => {
        const at = randomReplayTime([short, long], () => 0);
        expect(at).toBe(long[MIN_WARMUP_BARS].time);
        const last = randomReplayTime([short, long], () => 0.999999);
        expect(last).toBe(long[long.length - 1].time);
        expect(randomReplayTime([], () => 0)).toBeNull();
    });
});

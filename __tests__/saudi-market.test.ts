import { describe, expect, it } from 'vitest';
import { buildSaudiBoard, isNomuSymbol, valueTraded } from '@/lib/market/saudi-market';
import type { SaudiQuote } from '@/lib/market/tradingview-scanner';

const q = (symbol: string, changePercent: number, price = 10, volume = 1000, sector = 'Finance'): SaudiQuote => ({
    symbol,
    name: symbol,
    sector,
    price,
    changePercent,
    changeAbs: changePercent,
    volume,
    marketCap: 1e9,
    peRatio: 12,
});

describe('Saudi market board', () => {
    it('knows Nomu from the main market', () => {
        expect(isNomuSymbol('9510.SR')).toBe(true);
        expect(isNomuSymbol('2222.SR')).toBe(false);
    });

    it('ranks gainers and losers from the same list', () => {
        const board = buildSaudiBoard([q('1010.SR', 1.2), q('2222.SR', -2.4), q('7010.SR', 3.1)]);
        expect(board.gainers.map((r) => r.symbol)).toEqual(['7010.SR', '1010.SR', '2222.SR']);
        expect(board.losers.map((r) => r.symbol)).toEqual(['2222.SR', '1010.SR', '7010.SR']);
    });

    it('counts breadth without double counting the flat names', () => {
        const board = buildSaudiBoard([q('1', 1), q('2', -1), q('3', 0), q('4', 0.5)]);
        expect(board.breadth).toEqual({ advancers: 2, decliners: 1, unchanged: 1 });
        expect(board.total).toBe(4);
    });

    it('totals the day: rials traded and shares that changed hands', () => {
        const board = buildSaudiBoard([
            q('1111.SR', 0, 5, 10_000_000),   // 50M riyals, 10M shares
            q('2222.SR', 0, 100, 100_000),    // 10M riyals, 100k shares
        ]);
        expect(board.turnover).toBe(60_000_000);
        expect(board.volume).toBe(10_100_000);
    });

    it('ranks the most active by rial value, not share count', () => {
        const cheapAndBusy = q('1111.SR', 0, 5, 10_000_000);   // 50M riyals
        const pricey = q('2222.SR', 0, 100, 100_000);          // 10M riyals
        const board = buildSaudiBoard([cheapAndBusy, pricey]);
        expect(board.active.map((r) => r.quote.symbol)).toEqual(['1111.SR', '2222.SR']);
        expect(board.active[0].value).toBe(valueTraded(cheapAndBusy));
    });

    it('averages each sector and puts the busiest first', () => {
        const board = buildSaudiBoard([
            q('1', 1, 10, 100, 'Finance'),
            q('2', 3, 10, 100, 'Finance'),
            q('3', -1, 100, 1000, 'Energy Minerals'),
        ]);
        expect(board.sectors[0].sector).toBe('Energy Minerals');
        const finance = board.sectors.find((s) => s.sector === 'Finance');
        expect(finance).toMatchObject({ count: 2, avgChange: 2 });
    });

    it('drops a listing that has no price', () => {
        const board = buildSaudiBoard([{ ...q('9999.SR', 5), price: 0 }]);
        expect(board.total).toBe(0);
        expect(board.gainers).toHaveLength(0);
    });
});

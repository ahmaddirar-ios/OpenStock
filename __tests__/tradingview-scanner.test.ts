import { describe, expect, it } from 'vitest';
import { saudiQuoteFromRow, scannerTicker } from '@/lib/tradingview-scanner';

describe('Tadawul on the TradingView scanner', () => {
    it('maps an app symbol to the scanner ticker', () => {
        expect(scannerTicker('2222.SR')).toBe('TADAWUL:2222');
        expect(scannerTicker(' 1010.sr ')).toBe('TADAWUL:1010');
        expect(scannerTicker('AAPL')).toBeNull();
        expect(scannerTicker('BINANCE:BTCUSDT')).toBeNull();
    });

    it('reads a whole row, sector and P/E included', () => {
        const row = {
            s: 'TADAWUL:2222',
            d: [26.2, 0.1529, 0.04, 4996307, 1683450164994.05, 13.376, 'Energy Minerals', 'Saudi Arabian Oil Co.'],
        };
        const quote = saudiQuoteFromRow(row);
        expect(quote).toMatchObject({
            symbol: '2222.SR',
            name: 'Saudi Arabian Oil Co.',
            sector: 'Energy Minerals',
            price: 26.2,
            volume: 4996307,
            peRatio: 13.376,
        });
        expect(quote?.changePercent).toBeCloseTo(0.1529, 4);
    });

    it('keeps a missing P/E as null rather than zero', () => {
        const quote = saudiQuoteFromRow({ s: 'TADAWUL:7010', d: [41.26, 0.19, 0.08, 1, 5.4e10, null, 'Communications', 'Saudi Telecom Co.'] });
        expect(quote?.peRatio).toBeNull();
    });

    it('drops a suspended or unpriced listing', () => {
        expect(saudiQuoteFromRow({ s: 'TADAWUL:9999', d: [null, 0, 0, 0, 0, null, '', 'X'] })).toBeNull();
        expect(saudiQuoteFromRow({ s: 'TADAWUL:9999', d: [0, 0, 0, 0, 0, null, '', 'X'] })).toBeNull();
        expect(saudiQuoteFromRow({ s: 'OTHER:1', d: [10] })).toBeNull();
    });
});

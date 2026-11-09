import { describe, expect, it } from 'vitest';
import {
    formatMeasureSpan,
    formatVolume,
    measureDetail,
    measureHeadline,
    measureReadout,
} from '@/lib/chart/measure';
import type { DrawCandle } from '@/lib/chart/drawings';

const candle = (time: number, volume: number): DrawCandle => ({
    time,
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
    volume,
});

describe('measureReadout', () => {
    it('reads a rise as a positive move and a fall as a negative one', () => {
        const up = measureReadout({ time: 0, price: 100 }, { time: 3600, price: 110 }, 3600);
        expect(up).toMatchObject({ price: 10, percent: 10, seconds: 3600, bars: 1, volume: null });

        const down = measureReadout({ time: 0, price: 100 }, { time: 7200, price: 90 }, 3600);
        expect(down.price).toBe(-10);
        expect(down.percent).toBe(-10);
        expect(down.seconds).toBe(7200);
        expect(down.bars).toBe(2);
    });

    it('counts bars from the interval on screen, and none when it is unknown', () => {
        const a = { time: 0, price: 100 };
        const b = { time: 1800, price: 100 };
        expect(measureReadout(a, b, 300).bars).toBe(6);
        expect(measureReadout(a, b, 0).bars).toBe(0);
    });

    it('counts the bars in the span, not the calendar time between them', () => {
        // Three days of weekend sit between two hourly bars, but only one bar has elapsed.
        const candles = [candle(0, 1), candle(3 * 86_400, 1)];
        const readout = measureReadout({ time: 0, price: 10 }, { time: 3 * 86_400, price: 10 }, 3600, candles);
        expect(readout.bars).toBe(1);
        expect(readout.seconds).toBe(3 * 86_400);
    });

    it('sums the volume of the bars inside the span, whichever way it was dragged', () => {
        const candles = [candle(0, 100), candle(60, 200), candle(120, 300), candle(180, 400)];
        const forward = measureReadout({ time: 0, price: 10 }, { time: 120, price: 10 }, 60, candles);
        const backward = measureReadout({ time: 120, price: 10 }, { time: 0, price: 10 }, 60, candles);
        expect(forward.volume).toBe(600);
        expect(backward.volume).toBe(600);
    });

    it('reports no volume when the chart handed in no candles', () => {
        expect(measureReadout({ time: 0, price: 10 }, { time: 60, price: 10 }, 60).volume).toBeNull();
    });

    it('does not divide by a zero starting price', () => {
        expect(measureReadout({ time: 0, price: 0 }, { time: 60, price: 5 }, 60).percent).toBe(0);
    });
});

describe('formatMeasureSpan', () => {
    it('speaks seconds, minutes, hours and days', () => {
        expect(formatMeasureSpan(30)).toBe('30s');
        expect(formatMeasureSpan(90)).toBe('2m');
        expect(formatMeasureSpan(3600)).toBe('1h');
        expect(formatMeasureSpan(5400)).toBe('1h 30m');
        expect(formatMeasureSpan(86_400)).toBe('1d');
        expect(formatMeasureSpan(2 * 86_400 + 4 * 3600)).toBe('2d 4h');
    });

    it('carries a rounded-up unit instead of writing 60 minutes or 24 hours', () => {
        expect(formatMeasureSpan(3599)).toBe('1h');
        expect(formatMeasureSpan(86_399)).toBe('1d');
    });

    it('never shows a negative span', () => {
        expect(formatMeasureSpan(-60)).toBe('0s');
    });
});

describe('formatVolume', () => {
    it('uses the quote-board shorthand', () => {
        expect(formatVolume(950)).toBe('950');
        expect(formatVolume(1_200)).toBe('1.2K');
        expect(formatVolume(3_400_000)).toBe('3.4M');
        expect(formatVolume(5_600_000_000)).toBe('5.6B');
    });
});

describe('the two lines the ruler shows', () => {
    const readout = measureReadout({ time: 0, price: 100 }, { time: 5400, price: 102.5 }, 1800, [
        candle(0, 1_000),
        candle(1800, 2_000),
        candle(3600, 3_000),
        candle(5400, 4_000),
    ]);

    it('signs the price and the percentage', () => {
        expect(measureHeadline(readout)).toBe('+2.50 (+2.50%)');
        expect(measureHeadline({ ...readout, price: -2.5, percent: -2.5 })).toBe('−2.50 (−2.50%)');
    });

    it('joins bars, span and volume', () => {
        expect(measureDetail(readout, 'bars', 'Vol')).toBe('3 bars · 1h 30m · Vol 10.0K');
    });

    it('leaves out a bar count it could not work out', () => {
        expect(measureDetail({ ...readout, bars: 0 }, 'bars', 'Vol')).toBe('1h 30m · Vol 10.0K');
    });

    it('leaves out volume when there were no candles', () => {
        expect(measureDetail({ ...readout, volume: null }, 'bars', 'Vol')).toBe('3 bars · 1h 30m');
    });
});

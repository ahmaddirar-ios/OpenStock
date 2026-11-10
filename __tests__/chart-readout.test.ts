import { describe, expect, it } from 'vitest';
import { compactVolume, readoutAt, type ReadoutSeries } from '@/lib/chart/readout';
import type { Candle } from '@/lib/market/yahoo-candles';

const bar = (time: number, open: number, high: number, low: number, close: number, volume = 100): Candle => ({
    time,
    open,
    high,
    low,
    close,
    volume,
});

const day = (i: number) => 1_600_000_000 + i * 86_400;

const candles: Candle[] = [
    bar(day(0), 10, 12, 9, 11, 500),
    bar(day(1), 11, 13, 10, 12, 800),
    bar(day(2), 12, 12.5, 11, 12.5, 1_000),
];

const series: ReadoutSeries = {
    sma: [null, 11.5, 12],
    ema: [10.5, 11.8, 12.1],
    rsi: [null, null, 63.2],
    macd: [0.1, 0.2, 0.3],
    signal: [0.05, 0.15, 0.25],
    histogram: [0.05, 0.05, 0.05],
};

describe('readoutAt', () => {
    it('answers null when there are no candles', () => {
        expect(readoutAt([], series, null)).toBeNull();
        expect(readoutAt([], series, day(1))).toBeNull();
    });

    it('reads the last bar when nothing is hovered', () => {
        const readout = readoutAt(candles, series, null)!;
        expect(readout.time).toBe(day(2));
        expect([readout.open, readout.high, readout.low, readout.close]).toEqual([12, 12.5, 11, 12.5]);
        expect(readout.volume).toBe(1_000);
        expect(readout.change).toBeCloseTo(0.5);
        expect(readout.changePercent).toBeCloseTo((0.5 / 12) * 100);
    });

    it('reads the hovered bar, and the one before it when the time falls between bars', () => {
        expect(readoutAt(candles, series, day(1))!.close).toBe(12);
        // A time between two bars is the bar that had closed by then.
        expect(readoutAt(candles, series, day(1) + 3_600)!.time).toBe(day(1));
    });

    it('clamps outside the series rather than inventing a bar', () => {
        expect(readoutAt(candles, series, day(0) - 99_999)!.time).toBe(day(0));
        expect(readoutAt(candles, series, day(9))!.time).toBe(day(2));
    });

    it('has no change on the first bar, and survives a zero previous close', () => {
        const first = readoutAt(candles, series, day(0))!;
        expect(first.change).toBeNull();
        expect(first.changePercent).toBeNull();

        const zeroed = [bar(day(0), 0, 0, 0, 0), bar(day(1), 1, 1, 1, 1)];
        const second = readoutAt(zeroed, {}, day(1))!;
        expect(second.change).toBe(1);
        expect(second.changePercent).toBeNull();
    });

    it('keeps only the indicators that have a finite value on that bar', () => {
        // The first bar has no SMA/RSI yet (a period needs history), so those keys are absent.
        expect(readoutAt(candles, series, day(0))!.indicators).toEqual({
            ema: 10.5,
            macd: 0.1,
            signal: 0.05,
            histogram: 0.05,
        });
        expect(readoutAt(candles, series, day(2))!.indicators).toEqual({
            sma: 12,
            ema: 12.1,
            rsi: 63.2,
            macd: 0.3,
            signal: 0.25,
            histogram: 0.05,
        });
        // No indicators drawn is a readout, not a failure.
        expect(readoutAt(candles, {}, null)!.indicators).toEqual({});
    });

    it('keeps two studies of the same kind apart by their list position', () => {
        const two = { '0:value': [10, null, 12], '1:value': [null, 20, 22] };
        expect(readoutAt(candles, two, day(2))!.indicators).toEqual({ '0:value': 12, '1:value': 22 });
        expect(readoutAt(candles, two, day(1))!.indicators).toEqual({ '1:value': 20 });
    });
});

describe('compactVolume', () => {
    it('reads like a volume label, not like a price', () => {
        expect(compactVolume(0)).toBe('0');
        expect(compactVolume(999)).toBe('999');
        expect(compactVolume(1_000)).toBe('1K');
        expect(compactVolume(1_530)).toBe('1.53K');
        expect(compactVolume(1_234_567)).toBe('1.23M');
        expect(compactVolume(12_500_000_000)).toBe('12.5B');
        expect(compactVolume(2_000_000_000_000)).toBe('2T');
    });
});

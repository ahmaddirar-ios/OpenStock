import { describe, expect, it } from 'vitest';
import { CANDLE_INTERVALS, candlesFromChart, intervalById } from '@/lib/yahoo-candles';

const payload = (overrides: Record<string, unknown> = {}) => ({
    chart: {
        result: [
            {
                meta: { currency: 'SAR' },
                timestamp: [100, 200, 300],
                indicators: {
                    quote: [
                        {
                            open: [1, 2, 3],
                            high: [2, 3, 4],
                            low: [0.5, 1.5, 2.5],
                            close: [1.5, 2.5, 3.5],
                            volume: [10, 20, 30],
                        },
                    ],
                },
                ...overrides,
            },
        ],
    },
});

describe('candlesFromChart', () => {
    it('maps a Yahoo chart response into candles', () => {
        const set = candlesFromChart(payload());
        expect(set?.currency).toBe('SAR');
        expect(set?.candles).toHaveLength(3);
        expect(set?.candles[0]).toEqual({ time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 });
    });

    it('drops bars Yahoo pads with nulls, which is most of an intraday series', () => {
        const set = candlesFromChart({
            chart: {
                result: [
                    {
                        meta: { currency: 'SAR' },
                        timestamp: [100, 200, 300],
                        indicators: {
                            quote: [
                                {
                                    open: [1, null, 3],
                                    high: [2, null, 4],
                                    low: [0.5, null, 2.5],
                                    close: [1.5, null, 3.5],
                                    volume: [10, null, 30],
                                },
                            ],
                        },
                    },
                ],
            },
        });
        expect(set?.candles.map((c) => c.time)).toEqual([100, 300]);
    });

    it('keeps a bar whose volume is missing, with a zero volume', () => {
        const set = candlesFromChart({
            chart: {
                result: [
                    {
                        meta: {},
                        timestamp: [100],
                        indicators: { quote: [{ open: [1], high: [2], low: [0.5], close: [1.5], volume: [null] }] },
                    },
                ],
            },
        });
        expect(set?.candles[0].volume).toBe(0);
        expect(set?.currency).toBe('');
    });

    it('drops a repeated timestamp, which would give the chart two bars at one time', () => {
        const set = candlesFromChart({
            chart: {
                result: [
                    {
                        meta: {},
                        timestamp: [100, 100, 200],
                        indicators: {
                            quote: [
                                { open: [1, 1, 2], high: [2, 2, 3], low: [0.5, 0.5, 1], close: [1.5, 1.6, 2], volume: [1, 1, 2] },
                            ],
                        },
                    },
                ],
            },
        });
        expect(set?.candles.map((c) => c.time)).toEqual([100, 200]);
    });

    it('answers null rather than an empty chart for anything unusable', () => {
        expect(candlesFromChart(null)).toBeNull();
        expect(candlesFromChart({})).toBeNull();
        expect(candlesFromChart({ chart: { result: [{ timestamp: [], indicators: { quote: [{}] } }] } })).toBeNull();
        expect(candlesFromChart({ chart: { error: { code: 'Not Found' } } })).toBeNull();
    });
});

describe('intervals', () => {
    it('pairs each interval with a range Yahoo accepts', () => {
        expect(intervalById('1m').range).toBe('5d');
        expect(intervalById('1wk').range).toBe('2y');
    });

    it('falls back to daily for an unknown interval, so a bad query string cannot break the chart', () => {
        expect(intervalById('7s').id).toBe('1d');
        expect(CANDLE_INTERVALS).toHaveLength(6);
    });
});

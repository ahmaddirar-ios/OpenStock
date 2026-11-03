import { describe, expect, it } from 'vitest';
import { CANDLE_INTERVALS, DEFAULT_CANDLE_INTERVAL, aggregateCandles, candlesFromChart, intervalById, isCandleIntervalId, openingInterval, strategyRange, type Candle } from '@/lib/yahoo-candles';

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
    it('lists the intervals in the order a trader reads them, minute to month', () => {
        expect(CANDLE_INTERVALS.map((i) => i.id)).toEqual([
            '1m',
            '5m',
            '15m',
            '30m',
            '60m',
            '2h',
            '4h',
            '1d',
            '1wk',
            '1mo',
        ]);
    });

    it('pairs each interval with a range Yahoo accepts', () => {
        expect(intervalById('1m').request).toEqual({ interval: '1m', range: '5d' });
        expect(intervalById('30m').request).toEqual({ interval: '30m', range: '1mo' });
        expect(intervalById('1wk').request).toEqual({ interval: '1wk', range: '2y' });
        expect(intervalById('1mo').request).toEqual({ interval: '1mo', range: 'max' });
    });

    it('never asks for a range Yahoo rejects for the interval it requests', () => {
        // Yahoo's own table: a minute is capped at a week, intraday at 60 days, 60m at 730 days,
        // and daily or coarser is open. A request outside it comes back empty, not clamped.
        const days: Record<string, number> = { '1m': 7, '5m': 60, '15m': 60, '30m': 60, '60m': 730, '1d': Infinity, '1wk': Infinity, '1mo': Infinity };
        const span: Record<string, number> = { '1d': 1, '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730, '5y': 1825, '10y': 3650, max: Infinity };

        for (const { id, request } of CANDLE_INTERVALS) {
            expect(span[request.range], `${id}: unknown range ${request.range}`).toBeDefined();
            expect(span[request.range], `${id} asks for ${request.range}`).toBeLessThanOrEqual(days[request.interval]);
        }
    });

    it('builds the intervals Yahoo has no bar size for out of the hour', () => {
        expect(intervalById('2h').request.interval).toBe('60m');
        expect(intervalById('2h').aggregate).toBe(2);
        expect(intervalById('4h').request.interval).toBe('60m');
        expect(intervalById('4h').aggregate).toBe(4);
    });

    it('leaves the intervals Yahoo does price alone', () => {
        for (const id of ['1m', '5m', '15m', '30m', '60m', '1d', '1wk', '1mo']) {
            expect(intervalById(id).aggregate ?? 1).toBe(1);
        }
    });

    it('accepts only the intervals the toolbar offers', () => {
        expect(isCandleIntervalId('4h')).toBe(true);
        expect(isCandleIntervalId('1mo')).toBe(true);
        expect(isCandleIntervalId('4x')).toBe(false);
        expect(isCandleIntervalId(null)).toBe(false);
        expect(isCandleIntervalId(60)).toBe(false);
    });

    it('falls back to daily for an unknown interval, so a bad query string cannot break the chart', () => {
        expect(intervalById('7s').id).toBe('1d');
        expect(intervalById('').id).toBe('1d');
        expect(DEFAULT_CANDLE_INTERVAL).toBe('1d');
    });

    it('keeps the hourly history long enough for a count on the slower intervals', () => {
        // 4h bars off a three-month hour feed would be about twenty bars: not enough to count.
        expect(intervalById('2h').request.range).toBe('6mo');
        expect(intervalById('4h').request.range).toBe('1y');
    });
});

describe('aggregateCandles', () => {
    const hour = (time: number, o: number, h: number, l: number, c: number, v = 1): Candle => ({
        time,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v,
    });
    const DAY = 86_400;
    const TEN_AM = 1_700_000_000 + 10 * 3600;

    it('folds a run of bars into one, keeping the first open and the last close', () => {
        const hourly = [
            hour(TEN_AM, 10, 12, 9, 11, 5),
            hour(TEN_AM + 3600, 11, 15, 10, 14, 6),
            hour(TEN_AM + 7200, 14, 16, 13, 15, 7),
            hour(TEN_AM + 10_800, 15, 15.5, 8, 9, 8),
        ];

        expect(aggregateCandles(hourly, 4)).toEqual([
            { time: TEN_AM, open: 10, high: 16, low: 8, close: 9, volume: 26 },
        ]);
    });

    it('starts a new bar on the exchange day, so no bar spans two sessions', () => {
        const first = [0, 1, 2, 3, 4].map((i) => hour(TEN_AM + i * 3600, 10 + i, 11 + i, 9 + i, 10.5 + i));
        const nextDay = [0, 1, 2].map((i) => hour(TEN_AM + DAY + i * 3600, 20 + i, 21 + i, 19 + i, 20.5 + i));

        const fours = aggregateCandles([...first, ...nextDay], 4);

        expect(fours).toHaveLength(3);
        expect(fours[0].time).toBe(TEN_AM);
        expect(fours[1].time).toBe(TEN_AM + 4 * 3600);
        expect(fours[2].time).toBe(TEN_AM + DAY);
        expect(fours[2]).toMatchObject({ open: 20, high: 23, low: 19, close: 22.5, volume: 3 });
    });

    it('keeps the bar that is still forming rather than dropping its data', () => {
        const seven = [0, 1, 2, 3, 4, 5, 6].map((i) => hour(TEN_AM + i * 3600, 10 + i, 12 + i, 9 + i, 11 + i, 2));

        const fours = aggregateCandles(seven, 4);

        expect(fours).toHaveLength(2);
        expect(fours[1]).toMatchObject({ open: 14, high: 18, low: 13, close: 17, volume: 6 });
    });

    it('keeps the open, high, low and close in a sane order on every bar', () => {
        const hourly = Array.from({ length: 40 }, (_, i) =>
            hour(TEN_AM + i * 3600, 10 + Math.sin(i) * 2, 12 + Math.cos(i) * 3, 8 + Math.sin(i) * 2, 11 + Math.cos(i), 1),
        );

        for (const candle of aggregateCandles(hourly, 4)) {
            expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
            expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
            expect(candle.high).toBeGreaterThanOrEqual(candle.low);
        }
    });

    it('is a no-op for a factor of one or an empty series', () => {
        const hourly = [hour(TEN_AM, 10, 11, 9, 10.5)];

        expect(aggregateCandles(hourly, 1)).toEqual(hourly);
        expect(aggregateCandles([], 4)).toEqual([]);
        expect(aggregateCandles(hourly, 0)).toEqual(hourly);
    });
});


describe('strategyRange', () => {
    it('reaches ten years for daily and weekly bars', () => {
        expect(strategyRange('1d')).toBe('10y');
        expect(strategyRange('1wk')).toBe('10y');
    });

    it('asks for the whole listing monthly', () => {
        expect(strategyRange('1mo')).toBe('max');
    });

    it('leaves an intraday interval with the history Yahoo actually has', () => {
        expect(strategyRange('5m')).toBe('1mo');
        expect(strategyRange('60m')).toBe('6mo');
    });

    it('falls back to the daily range for an unknown id', () => {
        expect(strategyRange('wat')).toBe(strategyRange('1d'));
    });
});

describe('the interval a chart opens on', () => {
    it('uses the default when the page expresses no preference', () => {
        expect(openingInterval()).toBe(DEFAULT_CANDLE_INTERVAL);
        expect(openingInterval(null)).toBe(DEFAULT_CANDLE_INTERVAL);
    });

    it('uses the page preference only when it names a real interval', () => {
        // The Saudi index has no daily series in this feed, so its page opens on the hour.
        expect(openingInterval('60m')).toBe('60m');
        // A guessed id ("1h" instead of "60m") must not become the chart's interval.
        expect(openingInterval('1h')).toBe(DEFAULT_CANDLE_INTERVAL);
        expect(openingInterval('nonsense')).toBe(DEFAULT_CANDLE_INTERVAL);
    });
});

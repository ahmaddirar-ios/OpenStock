import { describe, expect, it } from 'vitest';
import { MAGNET_PIXELS, nearestBar, snapPoint, type MagnetBar } from '@/lib/chart-magnet';

const bar = (time: number, open: number, high: number, low: number, close: number): MagnetBar => ({
    time,
    open,
    high,
    low,
    close,
});

describe('nearestBar', () => {
    const bars = [bar(10, 1, 2, 0, 1.5), bar(60, 2, 3, 1, 2.5), bar(120, 3, 4, 2, 3.5)];

    it('picks the bar closest in time, on either side', () => {
        expect(nearestBar(bars, 0)?.time).toBe(10);
        expect(nearestBar(bars, 20)?.time).toBe(10);
        expect(nearestBar(bars, 45)?.time).toBe(60);
        expect(nearestBar(bars, 200)?.time).toBe(120);
    });

    it('answers null with no bars', () => {
        expect(nearestBar([], 10)).toBeNull();
    });
});

describe('snapPoint', () => {
    const bar1 = bar(60, 10, 14, 8, 12);
    // One unit is ten pixels: the thresholds are easy to reason about.
    const priceToY = (price: number) => price * 10;

    it('pulls a point onto the closest of the four prices, and onto the bar time', () => {
        const snapped = snapPoint({ time: 55, price: 11.2 }, bar1, priceToY);
        expect(snapped).toEqual({ time: 60, price: 12 });
    });

    it('keeps an open or a low when that is what is near', () => {
        expect(snapPoint({ time: 60, price: 10.3 }, bar1, priceToY).price).toBe(10);
        expect(snapPoint({ time: 60, price: 8.2 }, bar1, priceToY).price).toBe(8);
        expect(snapPoint({ time: 60, price: 13.9 }, bar1, priceToY).price).toBe(14);
    });

    it('leaves the point alone when every price is too far away', () => {
        const point = { time: 55, price: 25 };
        expect(snapPoint(point, bar1, priceToY)).toEqual(point);
    });

    it('honours a custom threshold', () => {
        const point = { time: 55, price: 14.9 };
        // 0.9 units = 9 px below the high: inside the default, outside a 5 px one.
        expect(snapPoint(point, bar1, priceToY, 5)).toEqual(point);
        expect(snapPoint(point, bar1, priceToY, MAGNET_PIXELS).price).toBe(14);
    });

    it('gives up when the price has no pixel position', () => {
        const point = { time: 55, price: 12 };
        expect(snapPoint(point, bar1, () => null)).toEqual(point);
    });
});

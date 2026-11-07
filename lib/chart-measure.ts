// The ruler: what a drag from one point to another measures. Pure arithmetic and formatting, so the
// numbers a trader reads off the chart are pinned by tests instead of by the pointer.

import { candlesBetween, type DrawCandle, type DrawPoint } from './chart-drawings';

export type MeasureReadout = {
    /** The move in price, signed: positive when the drag ended above where it started. */
    price: number;
    /** That move as a percentage of the starting price, signed. */
    percent: number;
    /** The span in seconds, always positive. */
    seconds: number;
    /** How many bars of the interval on screen the span covers; 0 when the interval is unknown. */
    bars: number;
    /** The volume traded inside the span, or null when the chart has no candles to add up. */
    volume: number | null;
};

/**
 * What the ruler reads between two points. The bar count is the bars actually inside the span when
 * the chart handed in candles — a weekend is time, not bars — and only falls back to dividing the
 * span by the interval on screen when there is no series to count. Volume is summed the same way,
 * and a bar with no volume adds nothing rather than breaking the total.
 */
export function measureReadout(
    a: DrawPoint,
    b: DrawPoint,
    barSeconds: number,
    candles: readonly DrawCandle[] = [],
): MeasureReadout {
    const price = b.price - a.price;
    const seconds = Math.abs(b.time - a.time);
    const inside = candles.length > 0 ? candlesBetween(candles, a.time, b.time) : [];
    // Two candles bound one elapsed bar; a drag that lands on one candle counts none.
    const bars = candles.length > 0 ? Math.max(0, inside.length - 1) : barSeconds > 0 ? Math.round(seconds / barSeconds) : 0;
    const volume = candles.length > 0 ? inside.reduce((sum, candle) => sum + (Number.isFinite(candle.volume) ? candle.volume : 0), 0) : null;
    return {
        price,
        percent: a.price === 0 ? 0 : (price / a.price) * 100,
        seconds,
        bars,
        volume,
    };
}

/**
 * A span as a trader says it: seconds under a minute, minutes under an hour, then hours and minutes,
 * then days and hours. The smaller unit is dropped when it is zero, so a clean 2 days reads "2d"
 * rather than "2d 0h".
 */
export function formatMeasureSpan(seconds: number): string {
    const total = Math.max(0, Math.round(seconds));
    if (total < 60) return `${total}s`;
    // Round to the smaller unit first, then split it, so 59.6 minutes becomes 1h rather than 1h 60m.
    const minutes = Math.round(total / 60);
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) {
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
    }
    const hours = Math.round(total / 3600);
    const days = Math.floor(hours / 24);
    const rest = hours % 24;
    return rest === 0 ? `${days}d` : `${days}d ${rest}h`;
}

/** A volume total in the shorthand a quote board uses: 1.2K, 3.4M, 5.6B. */
export function formatVolume(volume: number): string {
    const value = Math.abs(volume);
    const sign = volume < 0 ? '−' : '';
    if (value >= 1e9) return `${sign}${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `${sign}${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${sign}${(value / 1e3).toFixed(1)}K`;
    return `${sign}${Math.round(value)}`;
}

/** The headline: the move in price and as a percentage, both signed. */
export function measureHeadline(readout: MeasureReadout): string {
    const sign = readout.price >= 0 ? '+' : '−';
    return `${sign}${Math.abs(readout.price).toFixed(2)} (${sign}${Math.abs(readout.percent).toFixed(2)}%)`;
}

/**
 * The second line: how many bars, how long, and how much traded. The bar count is left out when the
 * interval is unknown, and the volume when the chart had no candles, so the line never shows a zero
 * that means "I could not tell".
 */
export function measureDetail(readout: MeasureReadout, barsLabel: string, volumeLabel: string): string {
    const parts: string[] = [];
    if (readout.bars > 0) parts.push(`${readout.bars} ${barsLabel}`);
    parts.push(formatMeasureSpan(readout.seconds));
    if (readout.volume != null) parts.push(`${volumeLabel} ${formatVolume(readout.volume)}`);
    return parts.join(' · ');
}

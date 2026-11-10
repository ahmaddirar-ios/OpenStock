// Point & Figure: a chart with no time axis. Each column is a run of boxes in one direction, and a
// column only turns when the market retraces a set number of boxes. That is the whole idea, and it is
// also why this cannot be a transformed candle array like Renko: there is no bar per column — a
// column can swallow fifty bars or appear three times inside one.
//
// The transform is pure and close-based, which is the classic reading: the close decides whether the
// next box is filled, and the reversal count decides when a column flips.

export type PnfInput = { time: number; close: number };

export type PnfColumn = {
    /** The bar that opened the column; the renderer spreads columns one bar apart. */
    time: number;
    direction: 'X' | 'O';
    /** The lowest box in the column and the highest, in price. */
    from: number;
    to: number;
    /** The box size every glyph honours, carried per column so the renderer never guesses. */
    box: number;
};

/** Three-box reversal is the convention; anything smaller turns the chart into noise. */
export const DEFAULT_PNF_REVERSAL = 3;

/**
 * A box size that fits the instrument: 1% of the first close, rounded to a step that keeps the axis
 * readable (a tenth, a half, a whole, or a multiple of ten). Traders set it by hand after this.
 */
export function autoPnfBox(price: number): number {
    if (!Number.isFinite(price) || price <= 0) return 1;
    const raw = price * 0.01;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const steps = [1, 2, 5, 10];
    // The nearest nice step in ratio terms, not the next one up: rounding 0.26 to 0.5 would halve
    // the number of columns a year of data draws.
    const step = steps.reduce((best, candidate) =>
        Math.abs(Math.log(candidate) - Math.log(raw / magnitude)) < Math.abs(Math.log(best) - Math.log(raw / magnitude)) ? candidate : best,
    1);
    return Number((step * magnitude).toPrecision(3));
}

const snapDown = (price: number, box: number) => Math.floor(price / box) * box;
const snapUp = (price: number, box: number) => Math.ceil(price / box) * box;

/**
 * Turns closes into columns. `boxSize` of 0 (or anything not positive) picks `autoPnfBox` from the
 * first close; `reversal` is the number of boxes a move must retrace to flip the column.
 */
export function pointAndFigure(
    candles: readonly PnfInput[],
    boxSize = 0,
    reversal = DEFAULT_PNF_REVERSAL,
): PnfColumn[] {
    if (candles.length < 2) return [];
    const box = boxSize > 0 && Number.isFinite(boxSize) ? boxSize : autoPnfBox(candles[0].close);
    const flip = Math.max(1, Math.floor(reversal));
    const columns: PnfColumn[] = [];

    const first = candles[0].close;
    let direction: 'X' | 'O' = 'X';
    // The column's extremes in price; an X column grows upward from `low`, an O column downward from `high`.
    let low = snapDown(first, box);
    let high = low + box;
    let openedAt = candles[0].time;
    let lastBox = Math.round(first / box);

    const push = (time: number) => {
        columns.push({ time: openedAt, direction, from: low, to: high, box });
        void time;
    };

    for (let i = 1; i < candles.length; i += 1) {
        const price = candles[i].close;
        const level = Math.round(price / box);
        if (level === lastBox) continue;
        lastBox = level;

        if (direction === 'X') {
            if (level * box >= high + box) {
                // Same column, one or more boxes higher.
                high = Math.max(high, snapUp(price, box));
                continue;
            }
            if (level * box <= high - flip * box) {
                // A reversal: close the X column and start an O column from the box below its top.
                push(candles[i].time);
                direction = 'O';
                high = high - box;
                low = Math.min(high - box, snapDown(price, box));
                openedAt = candles[i].time;
            }
            continue;
        }

        if (level * box <= low - box) {
            low = Math.min(low, snapDown(price, box));
            continue;
        }
        if (level * box >= low + flip * box) {
            push(candles[i].time);
            direction = 'X';
            low = low + box;
            high = Math.max(low + box, snapUp(price, box));
            openedAt = candles[i].time;
        }
    }

    // The open column is part of the picture: it is the one the market is still writing.
    columns.push({ time: openedAt, direction, from: low, to: high, box });

    // Columns need strictly increasing times for the library's logical spacing, and two columns can
    // be opened by the same bar: one second apart keeps the order and changes nothing on screen.
    return columns.map((column, index) => ({ ...column, time: column.time + index }));
}

/** How many boxes tall a column is: one for a brand-new column, more as it extends. */
export const pnfBoxes = (column: PnfColumn): number =>
    Math.max(1, Math.round(Math.abs(column.to - column.from) / column.box));

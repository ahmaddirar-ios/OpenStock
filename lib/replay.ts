// Bar replay and the paper account behind it: pure functions only — no React, no DOM, no network.
// The rule the feature exists for lives here: the chart is only ever handed candles up to the
// cursor, so no indicator, drawing or marker can be shaped by a bar the trader has not seen yet.

import type { Candle } from '@/lib/yahoo-candles';

/** Enough bars behind the start that SMA 20 / EMA 50 / MACD have something to chew on. */
export const MIN_WARMUP_BARS = 60;

/** The account opens in the symbol's own currency; 100k is the number every simulator starts at. */
export const DEFAULT_STARTING_CASH = 100_000;

/** Same costs the strategy lab charges, so the two features tell the trader the same story. */
export type Costs = { commissionBps: number; slippageBps: number };
export const DEFAULT_COSTS: Costs = { commissionBps: 5, slippageBps: 5 };

/** Bars per second. Slow enough to read a candle, fast enough to skip a month. */
export const REPLAY_SPEEDS = [1, 2, 5, 10] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

export const isReplaySpeed = (value: unknown): value is ReplaySpeed =>
    typeof value === 'number' && (REPLAY_SPEEDS as readonly number[]).includes(value);

// -- The series ---------------------------------------------------------------

/** Never below 0, never past the last bar. An empty series has one legal cursor: 0. */
export function clampCursor(cursor: number, length: number): number {
    if (!Number.isFinite(cursor) || length <= 0) return 0;
    return Math.max(0, Math.min(Math.floor(cursor), length - 1));
}

/** The first bar a replay should offer: enough warm-up behind it, and at least one bar to play. */
export function minStartIndex(length: number): number {
    if (length <= 0) return 0;
    return Math.min(MIN_WARMUP_BARS, Math.max(0, length - 2));
}

/**
 * The candles a replay may show: everything up to and including the cursor. This is the only
 * function the chart is allowed to read from the full series, which is what keeps the future out
 * of the host, the indicators and the drawings.
 */
export function visibleCandles(candles: readonly Candle[], cursor: number): Candle[] {
    if (candles.length === 0) return [];
    return candles.slice(0, clampCursor(cursor, candles.length) + 1);
}

/** The last index whose bar is at or before `time`, or -1 when the series starts after it. */
export function cursorForTime(candles: readonly Candle[], time: number): number {
    if (!Number.isFinite(time) || candles.length === 0) return -1;
    let low = 0;
    let high = candles.length - 1;
    let found = -1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (candles[mid].time <= time) {
            found = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return found;
}

/**
 * Where a stored session continues on a freshly fetched series. A coarser interval has fewer bars,
 * so the same wall-clock time lands earlier; anything older than the series starts at the warm-up
 * bar rather than at bar 0, where every indicator would be blank.
 */
export function resumeIndex(candles: readonly Candle[], time: number): number {
    const last = Math.max(0, candles.length - 1);
    const index = cursorForTime(candles, time);
    // Older than the series allows: the earliest bar we can honestly offer is the warm-up one.
    if (index < 0) return minStartIndex(candles.length);
    // Otherwise never move the trader forward past the bar they left on — that would reveal progress.
    return Math.max(0, Math.min(index, last));
}

export function stepCursor(cursor: number, delta: number, length: number): number {
    return clampCursor(clampCursor(cursor, length) + Math.trunc(delta), length);
}

/** A start the trader cannot game: never inside the warm-up, never on the last bar. */
export function randomCursor(length: number, random: () => number = Math.random): number {
    const first = minStartIndex(length);
    const last = Math.max(first, length - 1);
    const span = last - first + 1;
    return first + Math.min(span - 1, Math.max(0, Math.floor(random() * span)));
}

// -- The paper account --------------------------------------------------------

export type Position = { quantity: number; averageCost: number };

export type Fill = {
    /** Stable enough for a React key and a CSV row. */
    id: string;
    /** The bar the fill happened on, in epoch seconds. */
    time: number;
    side: 'buy' | 'sell';
    quantity: number;
    /** The price actually paid or received, costs included. */
    price: number;
    /** Profit or loss booked by this fill; zero for a buy. */
    realized: number;
};

export type PaperAccount = {
    startingCash: number;
    cash: number;
    /** One long position at a time; null when flat. */
    position: Position | null;
    fills: Fill[];
};

export type OrderFailure = 'badQuantity' | 'badPrice' | 'insufficientFunds' | 'noPosition' | 'notEnoughShares';
export type OrderResult = { ok: true; account: PaperAccount } | { ok: false; reason: OrderFailure };

export const openAccount = (cash: number = DEFAULT_STARTING_CASH): PaperAccount => ({
    startingCash: cash,
    cash,
    position: null,
    fills: [],
});

/** The price a market order actually gets, with slippage and commission on the correct side. */
export function fillPrice(price: number, side: 'buy' | 'sell', costs: Costs = DEFAULT_COSTS): number {
    const slip = Math.max(0, costs.slippageBps) / 10_000;
    const commission = Math.max(0, costs.commissionBps) / 10_000;
    return side === 'buy' ? price * (1 + slip) * (1 + commission) : price * (1 - slip) * (1 - commission);
}

const EPSILON = 1e-9;

const roundPrice = (value: number): number => Math.round(value * 1e6) / 1e6;

/** A positive, finite quantity, rounded to six decimals so 0.1 + 0.2 cannot drift. */
export function parseQuantity(raw: unknown): number | null {
    if (raw == null) return null;
    const text = typeof raw === 'string' ? raw.replace(/[\s,٬،]/g, '') : raw;
    const value = typeof text === 'number' ? text : Number(text);
    if (!Number.isFinite(value) || value <= 0) return null;
    const rounded = Math.round(value * 1e6) / 1e6;
    return rounded > 0 && rounded <= 1e12 ? rounded : null;
}

const validPrice = (price: number): boolean => Number.isFinite(price) && price > 0;

/**
 * Buys at the given price. The cash check happens on the price the trader would really pay, so a
 * 100 %-of-balance order can never overdraw by the commission.
 */
export function buy(
    account: PaperAccount,
    order: { price: number; quantity: number; time: number; id?: string },
    costs: Costs = DEFAULT_COSTS,
): OrderResult {
    if (!validPrice(order.price)) return { ok: false, reason: 'badPrice' };
    const quantity = parseQuantity(order.quantity);
    if (quantity == null) return { ok: false, reason: 'badQuantity' };

    const price = roundPrice(fillPrice(order.price, 'buy', costs));
    const cost = price * quantity;
    if (cost > account.cash + EPSILON) return { ok: false, reason: 'insufficientFunds' };

    const previous = account.position;
    const held = previous?.quantity ?? 0;
    const averageCost = held > 0 && previous
        ? (held * previous.averageCost + quantity * price) / (held + quantity)
        : price;

    return {
        ok: true,
        account: {
            ...account,
            cash: account.cash - cost,
            position: { quantity: held + quantity, averageCost: roundPrice(averageCost) },
            fills: [
                ...account.fills,
                {
                    id: order.id ?? `b-${order.time}-${account.fills.length}`,
                    time: order.time,
                    side: 'buy',
                    quantity,
                    price,
                    realized: 0,
                },
            ],
        },
    };
}

/** Sells part or all of the position. Shorting is not a paper-trading v1 feature. */
export function sell(
    account: PaperAccount,
    order: { price: number; quantity: number; time: number; id?: string },
    costs: Costs = DEFAULT_COSTS,
): OrderResult {
    if (!validPrice(order.price)) return { ok: false, reason: 'badPrice' };
    const quantity = parseQuantity(order.quantity);
    if (quantity == null) return { ok: false, reason: 'badQuantity' };
    const position = account.position;
    if (!position) return { ok: false, reason: 'noPosition' };
    if (quantity > position.quantity + EPSILON) return { ok: false, reason: 'notEnoughShares' };

    const price = roundPrice(fillPrice(order.price, 'sell', costs));
    const proceeds = price * quantity;
    const remaining = roundPrice(position.quantity - quantity);
    const nextPosition = remaining > EPSILON ? { quantity: remaining, averageCost: position.averageCost } : null;

    return {
        ok: true,
        account: {
            ...account,
            cash: account.cash + proceeds,
            position: nextPosition,
            fills: [
                ...account.fills,
                {
                    id: order.id ?? `s-${order.time}-${account.fills.length}`,
                    time: order.time,
                    side: 'sell',
                    quantity,
                    price,
                    realized: roundPrice((price - position.averageCost) * quantity),
                },
            ],
        },
    };
}

export type AccountSummary = {
    startingCash: number;
    cash: number;
    quantity: number;
    averageCost: number | null;
    positionValue: number;
    equity: number;
    realized: number;
    unrealized: number;
    returnPct: number;
};

/** Everything the panel reads, marked at `price` — the cursor bar's close, never a live quote. */
export function summarize(account: PaperAccount, price: number | null): AccountSummary {
    const position = account.position;
    const quantity = position?.quantity ?? 0;
    const marked = position != null && price != null && validPrice(price);
    const positionValue = marked ? (price as number) * quantity : 0;
    const equity = account.cash + positionValue;
    const realized = account.fills.reduce((sum, fill) => sum + fill.realized, 0);

    return {
        startingCash: account.startingCash,
        cash: account.cash,
        quantity,
        averageCost: position?.averageCost ?? null,
        positionValue,
        equity,
        realized,
        unrealized: marked && position ? ((price as number) - position.averageCost) * quantity : 0,
        returnPct: account.startingCash > 0 ? equity / account.startingCash - 1 : 0,
    };
}

// -- The trade log ------------------------------------------------------------

const CSV_HEADERS = {
    en: ['Date', 'Side', 'Quantity', 'Price', 'Realized P&L'],
    ar: ['التاريخ', 'العملية', 'الكمية', 'السعر', 'الربح المحقق'],
};

const SIDES = {
    en: { buy: 'buy', sell: 'sell' },
    ar: { buy: 'شراء', sell: 'بيع' },
};

const cell = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const isoDate = (seconds: number): string => new Date(seconds * 1000).toISOString().slice(0, 10);

/** A CSV a spreadsheet opens with the right encoding — the BOM is what makes Arabic headers survive. */
export function toCsv(fills: readonly Fill[], lang: 'en' | 'ar'): string {
    const rows = fills.map((fill) =>
        [
            isoDate(fill.time),
            SIDES[lang][fill.side],
            String(fill.quantity),
            fill.price.toFixed(4),
            fill.realized.toFixed(2),
        ]
            .map((value) => cell(value))
            .join(','),
    );
    return `\uFEFF${[CSV_HEADERS[lang].join(','), ...rows].join('\n')}\n`;
}

// -- The remembered session ---------------------------------------------------

export type ReplaySession = { cursorTime: number; account: PaperAccount };

export const sessionKey = (symbol: string): string => `openstock:replay:${symbol.trim().toUpperCase()}`;

const MAX_REMEMBERED_FILLS = 2_000;

export function serializeSession(session: ReplaySession): string {
    return JSON.stringify({
        cursorTime: session.cursorTime,
        account: { ...session.account, fills: session.account.fills.slice(-MAX_REMEMBERED_FILLS) },
    });
}

const isFill = (value: unknown): value is Fill => {
    const fill = value as Fill;
    return (
        !!fill &&
        typeof fill.id === 'string' &&
        Number.isFinite(fill.time) &&
        (fill.side === 'buy' || fill.side === 'sell') &&
        Number.isFinite(fill.quantity) &&
        fill.quantity > 0 &&
        Number.isFinite(fill.price) &&
        fill.price > 0 &&
        Number.isFinite(fill.realized)
    );
};

const isAccount = (value: unknown): value is PaperAccount => {
    const account = value as PaperAccount;
    if (!account || !Number.isFinite(account.startingCash) || account.startingCash <= 0) return false;
    if (!Number.isFinite(account.cash) || account.cash < 0) return false;
    const position = account.position as Position | null;
    if (position !== null) {
        if (!position || !Number.isFinite(position.quantity) || position.quantity <= 0) return false;
        if (!Number.isFinite(position.averageCost) || position.averageCost <= 0) return false;
    }
    if (!Array.isArray(account.fills) || !account.fills.every(isFill)) return false;
    return true;
};

/** A stored session is untrusted input: anything malformed is a fresh start, never a crash. */
export function parseSession(raw: string | null): ReplaySession | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as ReplaySession;
        if (!parsed || !Number.isFinite(parsed.cursorTime)) return null;
        if (!isAccount(parsed.account)) return null;
        return { cursorTime: parsed.cursorTime, account: parsed.account };
    } catch {
        return null;
    }
}

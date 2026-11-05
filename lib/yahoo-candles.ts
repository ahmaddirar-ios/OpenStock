// Candles for exchanges TradingView will not license in embeds (TADAWUL, LSE, HKEX, TSE, …).
// Yahoo prices those symbols for us already, so the chart reads from the same place the quotes do.
// Pure functions, covered by tests; the network call lives in lib/actions/yahoo-candles.actions.ts.

import { normalizeYahooSymbol } from '@/lib/yahoo';

export type Candle = {
    /** Seconds since the epoch, the unit lightweight-charts wants. */
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

/** A corporate event Yahoo reports alongside the bars: a dividend paid, or a split. */
export type CandleEvent = {
    time: number;
    kind: 'dividend' | 'split';
    /** The cash amount for a dividend, in the chart's currency. */
    amount?: number;
    /** The ratio a split applied, e.g. "2:1". */
    ratio?: string;
};

export type CandleSet = {
    candles: Candle[];
    currency: string;
    /**
     * The exchange's own close for the session before this range, when the feed states one. Better
     * than the last bar of yesterday: an intraday range can arrive with yesterday truncated, and a
     * truncated day's last print is a price, not a close.
     */
    previousClose?: number;
    /** Dividends and splits inside the range, oldest first. Absent when the feed reported none. */
    events?: CandleEvent[];
};

/** What an event reads as on the chart: a dividend's cash amount, or a split's ratio. */
export function eventLabel(event: CandleEvent): string {
    if (event.kind === 'dividend') return `D ${event.amount == null ? '' : event.amount.toFixed(2)}`.trim();
    return event.ratio ?? 'Split';
}

// Yahoo uses the same exchange suffix the app's symbols already carry (2222.SR, VOD.L, 0700.HK,
// 7203.T), so a symbol needs no translation — but only a symbol that has one is worth asking for.
// The TADAWUL: form the dashboard uses is normalised through the shared helper first.
const SUFFIXED_SYMBOL = /^[A-Z0-9][A-Z0-9.&-]{0,20}\.[A-Z]{1,4}$/;

export function yahooCandleSymbol(symbol: string): string | null {
    const upper = (symbol || '').trim().toUpperCase();
    const tadawul = normalizeYahooSymbol(upper);
    if (tadawul) return tadawul;
    return SUFFIXED_SYMBOL.test(upper) ? upper : null;
}

// Yahoo only accepts certain range/interval pairs, and only prices a fixed set of bar sizes:
// 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1d, 5d, 1wk, 1mo, 3mo. There is no 2h or 4h bar, so those are
// requested as hours and folded together — the range is sized for the interval the user actually
// sees, not for the hours it is built from. Keeping the pairs here means the interface can never ask
// for a combination Yahoo rejects (a minute is capped at a week, intraday at 60 days, 60m at 730).
export type CandleInterval = {
    /** What the toolbar and the drawings storage key use. */
    id: string;
    /** The bar size and span asked of Yahoo. */
    request: { interval: string; range: string };
    /** How many requested bars make one bar on screen; absent for a bar Yahoo prices itself. */
    aggregate?: number;
};

export const CANDLE_INTERVALS: readonly CandleInterval[] = [
    { id: '1m', request: { interval: '1m', range: '5d' } },
    { id: '5m', request: { interval: '5m', range: '1mo' } },
    { id: '15m', request: { interval: '15m', range: '1mo' } },
    { id: '30m', request: { interval: '30m', range: '1mo' } },
    { id: '60m', request: { interval: '60m', range: '6mo' } },
    { id: '2h', request: { interval: '60m', range: '6mo' }, aggregate: 2 },
    { id: '4h', request: { interval: '60m', range: '1y' }, aggregate: 4 },
    { id: '1d', request: { interval: '1d', range: '6mo' } },
    { id: '1wk', request: { interval: '1wk', range: '2y' } },
    { id: '1mo', request: { interval: '1mo', range: 'max' } },
];

export const DEFAULT_CANDLE_INTERVAL = '1d';

/** The interval a chart opens on: the page's preference when it names a real interval, else the
 *  default. A page can express a preference because some symbols have no series on the default — the
 *  Saudi index has no daily bars in this feed, so its page opens on the hour. */
export const openingInterval = (preferred?: string | null): string =>
    isCandleIntervalId(preferred) ? preferred : DEFAULT_CANDLE_INTERVAL;

/** The interval a request asked for, falling back to the daily one by name rather than by position. */
export const intervalById = (id: string): CandleInterval =>
    CANDLE_INTERVALS.find((interval) => interval.id === id) ??
    CANDLE_INTERVALS.find((interval) => interval.id === DEFAULT_CANDLE_INTERVAL)!;

/**
 * How much history the strategy lab asks for. The chart deliberately keeps a light range (6 months
 * daily) so a page of charts stays small; a 200-bar average cannot be judged on that, so the lab
 * reaches deeper — and says so when an intraday interval cannot.
 */
export const STRATEGY_RANGES: Record<string, string> = {
    '1d': '10y',
    '1wk': '10y',
    '1mo': 'max',
};

/** The range for a lab run: deeper where it matters, unchanged where Yahoo has nothing more. */
export function strategyRange(intervalId: string): string {
    const interval = intervalById(intervalId);
    return STRATEGY_RANGES[interval.id] ?? interval.request.range;
}

/** True for an interval the toolbar offers, so a stored or hand-edited value can be trusted back. */
export const isCandleIntervalId = (value: unknown): value is string =>
    typeof value === 'string' && CANDLE_INTERVALS.some((interval) => interval.id === value);

const DAY_SECONDS = 86_400;

/**
 * Folds `factor` bars into one, for the bar sizes Yahoo does not price (2h, 4h).
 *
 * A bar never spans two exchange days: folding is counted from the first bar of each day, so a four
 * hour bar is the session's first four hours rather than a window sliding across the close. The bar
 * that is still forming is kept — it is the one a trader is watching — and volume adds up.
 */
export function aggregateCandles(candles: Candle[], factor: number): Candle[] {
    const size = Math.floor(factor);
    if (!Array.isArray(candles) || !(size >= 2)) return candles;

    const folded: Candle[] = [];
    let current: Candle | null = null;
    let day = -1;
    let indexInDay = 0;

    for (const candle of candles) {
        if (!candle || !Number.isFinite(candle.time)) continue;
        const candleDay = Math.floor(candle.time / DAY_SECONDS);
        const newDay = candleDay !== day;
        if (newDay) {
            day = candleDay;
            indexInDay = 0;
        }

        if (!current || newDay || indexInDay === size) {
            current = {
                time: candle.time,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume,
            };
            folded.push(current);
        } else {
            current.high = Math.max(current.high, candle.high);
            current.low = Math.min(current.low, candle.low);
            current.close = candle.close;
            current.volume += candle.volume;
        }
        indexInDay += 1;
    }

    return folded;
}

type YahooChartJson = {
    chart?: {
        result?: Array<{
            meta?: { currency?: string; previousClose?: number };
            timestamp?: number[];
            events?: {
                dividends?: Record<string, { amount?: number; date?: number }>;
                splits?: Record<string, { date?: number; numerator?: number; denominator?: number; splitRatio?: string }>;
            };
            indicators?: {
                quote?: Array<{
                    open?: (number | null)[];
                    high?: (number | null)[];
                    low?: (number | null)[];
                    close?: (number | null)[];
                    volume?: (number | null)[];
                }>;
            };
        }>;
    };
};

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * The dividends and splits Yahoo reports for the same request as the candles. They arrive keyed by
 * timestamp; a row without a usable date, amount or ratio is dropped rather than drawn as "D" with
 * nothing behind it. Oldest first, the order the chart walks.
 */
export function eventsFromChart(json: unknown): CandleEvent[] {
    const result = (json as YahooChartJson)?.chart?.result?.[0];
    const events = result?.events;
    if (!events) return [];
    const out: CandleEvent[] = [];

    for (const [key, value] of Object.entries(events.dividends ?? {})) {
        const time = finite(value?.date) ? value.date : Number(key);
        if (!finite(time) || !finite(value?.amount) || value.amount <= 0) continue;
        out.push({ time: Math.trunc(time), kind: 'dividend', amount: value.amount });
    }
    for (const [key, value] of Object.entries(events.splits ?? {})) {
        const time = finite(value?.date) ? value.date : Number(key);
        if (!finite(time)) continue;
        const ratio =
            typeof value?.splitRatio === 'string' && value.splitRatio.length > 0
                ? value.splitRatio
                : finite(value?.numerator) && finite(value?.denominator) && value.denominator > 0
                  ? `${value.numerator}:${value.denominator}`
                  : null;
        if (!ratio) continue;
        out.push({ time: Math.trunc(time), kind: 'split', ratio });
    }

    // A timestamp can appear as both a key and a date; keep one of each kind at each moment.
    const seen = new Set<string>();
    return out
        .sort((a, b) => a.time - b.time)
        .filter((event) => {
            const key = `${event.kind}:${event.time}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

/**
 * A /v8/finance/chart response as candles. Yahoo pads closed hours and holidays with nulls, and the
 * arrays are parallel, so a bar is kept only when it has a full OHLC; its volume defaults to zero.
 * Bars come back oldest first, which is the order a chart draws them in.
 */
export function candlesFromChart(json: unknown): CandleSet | null {
    const result = (json as YahooChartJson)?.chart?.result?.[0];
    const times = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    if (!result || times.length === 0 || !quote) return null;

    const candles: Candle[] = [];
    for (let i = 0; i < times.length; i += 1) {
        const { open, high, low, close, volume } = {
            open: quote.open?.[i],
            high: quote.high?.[i],
            low: quote.low?.[i],
            close: quote.close?.[i],
            volume: quote.volume?.[i],
        };
        if (!finite(times[i]) || !finite(open) || !finite(high) || !finite(low) || !finite(close)) continue;
        candles.push({ time: times[i], open, high, low, close, volume: finite(volume) ? volume : 0 });
    }
    const events = eventsFromChart(json);
    if (candles.length === 0) return null;

    // Yahoo occasionally repeats a timestamp; a chart wants each time exactly once.
    const unique = candles.filter((candle, i) => i === 0 || candle.time > candles[i - 1].time);
    const previousClose = result.meta?.previousClose;
    return {
        candles: unique,
        currency: result.meta?.currency || '',
        ...(finite(previousClose) && previousClose > 0 ? { previousClose } : {}),
        ...(events.length > 0 ? { events } : {}),
    };
}

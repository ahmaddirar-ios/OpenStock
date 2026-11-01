// The strategy lab's engine: six published rules, an execution model that fills on the next bar's
// open, and the metrics an investment committee asks for. Pure functions only — the pages compute
// in the browser from candles they already have, so nothing here touches the network or the DOM.

import { ema, macd, rsi, sma, type Series } from '@/lib/indicators';
import type { Candle } from '@/lib/yahoo-candles';

export type StrategyId =
    | 'sma-cross'
    | 'ema-cross'
    | 'rsi-reversion'
    | 'macd-cross'
    | 'donchian-breakout'
    | 'ema50-pullback';

export const STRATEGY_IDS: readonly StrategyId[] = [
    'sma-cross',
    'ema-cross',
    'rsi-reversion',
    'macd-cross',
    'donchian-breakout',
    'ema50-pullback',
];

export type Params = Record<string, number>;
export type Costs = { commissionBps: number; slippageBps: number };

export const DEFAULT_COSTS: Costs = { commissionBps: 5, slippageBps: 5 };

export type Signal = { index: number; kind: 'entry' | 'exit' };
export type TradeReason = 'signal' | 'stop' | 'target';

export type Trade = {
    entryIndex: number;
    entryTime: number;
    entryPrice: number;
    exitIndex: number;
    exitTime: number;
    exitPrice: number;
    /** Equity points won or lost, on a scale that starts at 100. */
    pnl: number;
    /** Percent change of the price actually paid and received. */
    pnlPct: number;
    bars: number;
    reason: TradeReason;
};

export type EquityPoint = { time: number; value: number; benchmark: number };
export type DrawdownPoint = { time: number; value: number };

export type Backtest = {
    trades: Trade[];
    signals: Signal[];
    equity: EquityPoint[];
    drawdown: DrawdownPoint[];
};

export type Metrics = {
    totalReturn: number | null;
    cagr: number | null;
    sharpe: number | null;
    sortino: number | null;
    maxDrawdown: number | null;
    maxDrawdownBars: number | null;
    profitFactor: number | null;
    expectancy: number | null;
    winRate: number | null;
    avgWin: number | null;
    avgLoss: number | null;
    avgBars: number | null;
    exposure: number | null;
    trades: number;
    benchmarkReturn: number | null;
};

/** Each strategy's parameters, in the order a reader would tune them. Stops are percent of price. */
const DEFAULTS: Record<StrategyId, Params> = {
    'sma-cross': { fast: 50, slow: 200, stopPct: 8 },
    'ema-cross': { fast: 9, slow: 21, stopPct: 8 },
    'rsi-reversion': { period: 14, entry: 30, exit: 70, stopPct: 5 },
    'macd-cross': { fast: 12, slow: 26, signal: 9, stopPct: 8 },
    'donchian-breakout': { entry: 20, exit: 10, stopPct: 8 },
    'ema50-pullback': { fast: 50, slow: 200, stopPct: 7, targetPct: 20 },
};

export function defaultParams(id: StrategyId): Params {
    return { ...DEFAULTS[id] };
}

const withDefaults = (id: StrategyId, params: Params = {}): Params => {
    const merged = { ...DEFAULTS[id] };
    for (const [key, value] of Object.entries(params)) {
        if (Number.isFinite(value)) merged[key] = value;
    }
    return merged;
};

const at = (series: Series, i: number): number | null => {
    const value = series[i];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

/** A true up-cross: the fast line was at or below the slow one and is now above it. */
const crossedUp = (fast: Series, slow: Series, i: number): boolean => {
    const f = at(fast, i);
    const s = at(slow, i);
    const pf = at(fast, i - 1);
    const ps = at(slow, i - 1);
    if (f == null || s == null || pf == null || ps == null) return false;
    return f > s && pf <= ps;
};

const crossedDown = (fast: Series, slow: Series, i: number): boolean => {
    const f = at(fast, i);
    const s = at(slow, i);
    const pf = at(fast, i - 1);
    const ps = at(slow, i - 1);
    if (f == null || s == null || pf == null || ps == null) return false;
    return f < s && pf >= ps;
};

const closesOf = (candles: readonly Candle[]): number[] => candles.map((candle) => candle.close);

/** Highest high and lowest low of the `length` bars strictly before `i` (the breakout reference). */
const priorHigh = (candles: readonly Candle[], i: number, length: number): number | null => {
    if (i < length) return null;
    let high = -Infinity;
    for (let j = i - length; j < i; j += 1) high = Math.max(high, candles[j].high);
    return Number.isFinite(high) ? high : null;
};

const priorLow = (candles: readonly Candle[], i: number, length: number): number | null => {
    if (i < length) return null;
    let low = Infinity;
    for (let j = i - length; j < i; j += 1) low = Math.min(low, candles[j].low);
    return Number.isFinite(low) ? low : null;
};

/**
 * The rule signals for one strategy, read on each bar's close from that bar and its history only.
 * Stops and targets are not signals — the backtest owns them, because they depend on the fill.
 */
export function signals(candles: readonly Candle[], id: StrategyId, params: Params = {}): Signal[] {
    const p = withDefaults(id, params);
    const closes = closesOf(candles);
    const out: Signal[] = [];
    const push = (index: number, kind: Signal['kind']) => out.push({ index, kind });

    if (id === 'sma-cross' || id === 'ema-cross') {
        const average = id === 'sma-cross' ? sma : ema;
        const fast = average(closes, Math.max(1, Math.round(p.fast)));
        const slow = average(closes, Math.max(2, Math.round(p.slow)));
        for (let i = 1; i < candles.length; i += 1) {
            if (crossedUp(fast, slow, i)) push(i, 'entry');
            else if (crossedDown(fast, slow, i)) push(i, 'exit');
        }
        return out;
    }

    if (id === 'rsi-reversion') {
        const line = rsi(closes, Math.max(2, Math.round(p.period)));
        for (let i = 1; i < candles.length; i += 1) {
            const now = at(line, i);
            const before = at(line, i - 1);
            if (now == null || before == null) continue;
            if (before <= p.entry && now > p.entry) push(i, 'entry');
            else if (now >= p.exit && before < p.exit) push(i, 'exit');
        }
        return out;
    }

    if (id === 'macd-cross') {
        const { macd: line, signal } = macd(
            closes,
            Math.max(2, Math.round(p.fast)),
            Math.max(3, Math.round(p.slow)),
            Math.max(2, Math.round(p.signal)),
        );
        for (let i = 1; i < candles.length; i += 1) {
            if (crossedUp(line, signal, i) && (at(line, i) ?? 0) < 0) push(i, 'entry');
            else if (crossedDown(line, signal, i)) push(i, 'exit');
        }
        return out;
    }

    if (id === 'donchian-breakout') {
        const entryLength = Math.max(1, Math.round(p.entry));
        const exitLength = Math.max(1, Math.round(p.exit));
        for (let i = 1; i < candles.length; i += 1) {
            const upper = priorHigh(candles, i, entryLength);
            const lower = priorLow(candles, i, exitLength);
            if (upper != null && candles[i].close > upper) push(i, 'entry');
            else if (lower != null && candles[i].close < lower) push(i, 'exit');
        }
        return out;
    }

    // ema50-pullback: an uptrend, a touch of the fast average, and a bar that closes green.
    const fast = ema(closes, Math.max(2, Math.round(p.fast)));
    const slow = ema(closes, Math.max(3, Math.round(p.slow)));
    for (let i = 1; i < candles.length; i += 1) {
        const trend = at(slow, i);
        const touch = at(fast, i);
        const candle = candles[i];
        if (trend == null || touch == null) continue;
        if (candle.close > trend && candle.low <= touch && candle.close >= candle.open) push(i, 'entry');
        else if (candle.close < touch) push(i, 'exit');
    }
    return out;
}

const fill = (price: number, direction: 'buy' | 'sell', costs: Costs): number => {
    const slip = Math.max(0, costs.slippageBps) / 10_000;
    const commission = Math.max(0, costs.commissionBps) / 10_000;
    return direction === 'buy' ? price * (1 + slip) * (1 + commission) : price * (1 - slip) * (1 - commission);
};

/**
 * One position at a time, filled on the next bar's open, marked to market on every close, with the
 * stop checked before the target and before the next open — the pessimistic order, so a bar that
 * touches both is never reported as a winner.
 */
export function backtest(
    candles: readonly Candle[],
    id: StrategyId,
    params: Params = {},
    costs: Costs = DEFAULT_COSTS,
): Backtest | null {
    if (candles.length < 2) return null;
    const p = withDefaults(id, params);
    const rules = signals(candles, id, p);
    const byIndex = new Map<number, Signal['kind']>();
    for (const signal of rules) {
        // An exit and an entry on the same bar cannot both be taken; the exit wins.
        if (byIndex.get(signal.index) === 'exit') continue;
        byIndex.set(signal.index, signal.kind);
    }

    const trades: Trade[] = [];
    const equity: EquityPoint[] = [];
    const drawdown: DrawdownPoint[] = [];

    const start = 100;
    const benchEntry = fill(candles[0].open, 'buy', costs);
    const benchExit = 1 - Math.max(0, costs.slippageBps) / 10_000;
    let cash = start;
    let inPosition = false;
    let entryPrice = 0;
    let entryIndex = 0;
    let entryEquity = 0;
    let pending: 'entry' | 'exit' | null = null;
    let peak = start;

    const closeTrade = (index: number, price: number, reason: TradeReason) => {
        const exitPrice = fill(price, 'sell', costs);
        const value = (entryEquity * exitPrice) / entryPrice;
        trades.push({
            entryIndex,
            entryTime: candles[entryIndex].time,
            entryPrice,
            exitIndex: index,
            exitTime: candles[index].time,
            exitPrice,
            pnl: value - entryEquity,
            pnlPct: (exitPrice / entryPrice - 1) * 100,
            bars: index - entryIndex,
            reason,
        });
        cash = value;
        inPosition = false;
    };

    for (let i = 0; i < candles.length; i += 1) {
        const candle = candles[i];

        if (pending === 'exit' && inPosition) {
            closeTrade(i, candle.open, 'signal');
            pending = null;
        } else if (pending === 'entry' && !inPosition) {
            entryPrice = fill(candle.open, 'buy', costs);
            entryIndex = i;
            entryEquity = cash;
            inPosition = true;
            pending = null;
        }

        if (inPosition) {
            const stopPrice = p.stopPct > 0 ? entryPrice * (1 - p.stopPct / 100) : null;
            const targetPrice = p.targetPct > 0 ? entryPrice * (1 + p.targetPct / 100) : null;
            if (stopPrice != null && candle.low <= stopPrice) {
                closeTrade(i, stopPrice, 'stop');
            } else if (targetPrice != null && candle.high >= targetPrice) {
                closeTrade(i, targetPrice, 'target');
            }
            if (inPosition) cash = (entryEquity * candle.close) / entryPrice;
        }

        const value = inPosition ? (entryEquity * candle.close) / entryPrice : cash;
        peak = Math.max(peak, value);
        equity.push({
            time: candle.time,
            value,
            benchmark: (start * candle.close * benchExit) / benchEntry,
        });
        drawdown.push({ time: candle.time, value: value / peak - 1 });

        const rule = byIndex.get(i);
        if (rule === 'exit' && inPosition) pending = 'exit';
        else if (rule === 'entry' && !inPosition) pending = 'entry';
    }

    // A position still open at the last close is closed there, so the numbers never hide an open risk.
    if (inPosition) {
        const last = candles[candles.length - 1];
        closeTrade(candles.length - 1, last.close, 'signal');
        const value = cash;
        peak = Math.max(peak, value);
        equity[equity.length - 1] = { ...equity[equity.length - 1], value };
        drawdown[drawdown.length - 1] = { time: last.time, value: value / peak - 1 };
    }

    return { trades, signals: rules, equity, drawdown };
}

const mean = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

const stdev = (values: number[]): number | null => {
    const m = mean(values);
    if (m == null || values.length < 2) return null;
    const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
};

/**
 * The twelve metrics, each null when the data cannot support it rather than a flattering guess.
 * `barsPerYear` is 252 daily, 52 weekly, 12 monthly; 0 means "do not annualise" (intraday).
 */
export function metrics(result: Backtest, barsPerYear: number, riskFreeRate: number): Metrics {
    const values = result.equity.map((point) => point.value);
    const bars = values.length - 1;
    const first = values[0];
    const last = values[values.length - 1];
    const totalReturn = first > 0 ? last / first - 1 : null;
    const annualise = barsPerYear > 0 && bars > 0 && totalReturn != null && totalReturn > -1;
    const cagr = annualise ? Math.pow(1 + (totalReturn as number), barsPerYear / bars) - 1 : null;

    const returns: number[] = [];
    for (let i = 1; i < values.length; i += 1) {
        if (values[i - 1] > 0) returns.push(values[i] / values[i - 1] - 1);
    }
    const rf = barsPerYear > 0 ? riskFreeRate / barsPerYear : 0;
    const excess = returns.map((value) => value - rf);
    const sd = stdev(excess);
    const sharpe = annualise && sd != null && sd > 0 ? ((mean(excess) as number) / sd) * Math.sqrt(barsPerYear) : null;
    const downside = excess.map((value) => (value < 0 ? value ** 2 : 0));
    const dd = Math.sqrt((downside.reduce((sum, value) => sum + value, 0) || 0) / Math.max(1, downside.length));
    const sortino = annualise && dd > 0 ? ((mean(excess) as number) / dd) * Math.sqrt(barsPerYear) : null;

    let peak = values[0] ?? 0;
    let maxDrawdown = 0;
    let peakIndex = 0;
    let maxDrawdownBars = 0;
    values.forEach((value, i) => {
        if (value >= peak) {
            peak = value;
            peakIndex = i;
            return;
        }
        const fall = peak > 0 ? 1 - value / peak : 0;
        if (fall > maxDrawdown) {
            maxDrawdown = fall;
            maxDrawdownBars = i - peakIndex;
        } else if (fall === maxDrawdown) {
            maxDrawdownBars = Math.max(maxDrawdownBars, i - peakIndex);
        }
    });

    const closed = result.trades;
    const wins = closed.filter((trade) => trade.pnl > 0);
    const losses = closed.filter((trade) => trade.pnl <= 0);
    const grossWin = wins.reduce((sum, trade) => sum + trade.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
    const avgWin = mean(wins.map((trade) => trade.pnl));
    const avgLoss = losses.length > 0 ? Math.abs(mean(losses.map((trade) => trade.pnl)) as number) : null;
    const winRate = closed.length > 0 ? wins.length / closed.length : null;
    const expectancy = avgWin != null && winRate != null ? winRate * avgWin - (1 - winRate) * (avgLoss ?? 0) : null;
    const barsHeld = closed.reduce((sum, trade) => sum + trade.bars, 0);

    return {
        totalReturn,
        cagr,
        sharpe,
        sortino,
        maxDrawdown,
        maxDrawdownBars,
        profitFactor: closed.length > 0 && grossLoss > 0 ? grossWin / grossLoss : null,
        expectancy,
        winRate,
        avgWin,
        avgLoss,
        avgBars: closed.length > 0 ? barsHeld / closed.length : null,
        exposure: bars > 0 ? barsHeld / bars : null,
        trades: closed.length,
        benchmarkReturn:
            result.equity.length > 0 && result.equity[0].benchmark > 0
                ? result.equity[result.equity.length - 1].benchmark / result.equity[0].benchmark - 1
                : null,
    };
}

const CSV_HEADERS = {
    en: ['Entry date', 'Entry price', 'Exit date', 'Exit price', 'P&L', 'P&L %', 'Bars', 'Exit reason'],
    ar: ['تاريخ الدخول', 'سعر الدخول', 'تاريخ الخروج', 'سعر الخروج', 'الربح', 'الربح %', 'المدة (شموع)', 'سبب الخروج'],
};

const REASONS = {
    en: { signal: 'signal', stop: 'stop', target: 'target' },
    ar: { signal: 'إشارة', stop: 'وقف', target: 'هدف' },
};

const cell = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const isoDate = (seconds: number): string => new Date(seconds * 1000).toISOString().slice(0, 10);

/** A CSV a spreadsheet opens with the right encoding — the BOM is what makes Arabic headers survive. */
export function toCsv(trades: readonly Trade[], lang: 'en' | 'ar'): string {
    const rows = trades.map((trade) =>
        [
            isoDate(trade.entryTime),
            trade.entryPrice.toFixed(2),
            isoDate(trade.exitTime),
            trade.exitPrice.toFixed(2),
            trade.pnl.toFixed(2),
            trade.pnlPct.toFixed(2),
            String(trade.bars),
            REASONS[lang][trade.reason],
        ]
            .map((value) => cell(value))
            .join(','),
    );
    return `\uFEFF${[CSV_HEADERS[lang].join(','), ...rows].join('\n')}\n`;
}

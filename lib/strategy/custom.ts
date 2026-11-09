// Custom strategies: the rules a trader writes in the formula language, run through the same
// execution model as the six published ones — fill on the next bar's open, stops before targets,
// one position at a time — plus what a real strategy needs: shorting, a trailing stop, risk-based
// sizing, a parameter grid, and a walk-forward split that never lets a fold see its own future.
//
// The strategy is a structured object and its two rules are formula text. The object owns the
// settings (direction, risk, stops); the text owns the conditions. Editing one never rewrites the
// other, which is what keeps a hand-edited rule from silently losing its sizing.

import { evaluateFormula } from '@/lib/formula/formula';
import { DEFAULT_COSTS, barsPerYear, metrics, type Backtest, type Costs, type EquityPoint, type DrawdownPoint, type Metrics, type Signal, type Trade, type TradeReason } from '@/lib/strategy/strategies';
import type { Candle } from '@/lib/market/yahoo-candles';

export type StrategyDirection = 'long' | 'short' | 'reversal';

export type CustomParam = {
    key: string;
    value: number;
    min: number;
    max: number;
    step: number;
};

export type CustomStrategy = {
    /** Stable id, so a saved strategy and its runs agree on which one they belong to. */
    id: string;
    name: string;
    entry: string;
    exit: string;
    params: CustomParam[];
    /** Percent of price. Zero means "no stop" / "no target" / "no trail". */
    stopPct: number;
    targetPct: number;
    trailingPct: number;
    /** Risk per trade as a percent of equity; 0 means "all of it", capped at one unit of equity. */
    riskPct: number;
    direction: StrategyDirection;
};

export const MAX_CUSTOM_PARAMS = 8;
export const MAX_OPTIMIZER_COMBOS = 2000;
export const MAX_NAME = 40;

export const DEFAULT_CUSTOM_STRATEGY: CustomStrategy = {
    id: 'custom',
    name: 'My strategy',
    entry: 'close > sma(close, {fast}) and rsi(close, {period}) > {level}',
    exit: 'close < sma(close, {fast})',
    params: [
        { key: 'fast', value: 50, min: 10, max: 200, step: 5 },
        { key: 'period', value: 14, min: 5, max: 30, step: 1 },
        { key: 'level', value: 50, min: 30, max: 70, step: 5 },
    ],
    stopPct: 7,
    targetPct: 0,
    trailingPct: 0,
    riskPct: 0,
    direction: 'long',
};

export const OBJECTIVES = ['sharpe', 'totalReturn', 'profitFactor', 'expectancy'] as const;
export type Objective = (typeof OBJECTIVES)[number];

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
};

export const cleanStrategyName = (raw: unknown): string =>
    typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';

const cleanParamKey = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const key = raw.trim();
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) && key.length <= 24 ? key : null;
};

/**
 * The single gate for a strategy, whether it came from the editor, localStorage or the account.
 * A null means the object is unusable; fields that are merely out of range are clamped, because a
 * saved strategy that still runs is worth more than a rejected one.
 */
export function parseCustomStrategy(raw: unknown): CustomStrategy | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const candidate = raw as Record<string, unknown>;
    const entry = typeof candidate.entry === 'string' ? candidate.entry.trim() : '';
    const exit = typeof candidate.exit === 'string' ? candidate.exit.trim() : '';
    if (!entry || !exit) return null;

    const params: CustomParam[] = [];
    if (Array.isArray(candidate.params)) {
        for (const item of candidate.params) {
            if (params.length >= MAX_CUSTOM_PARAMS) break;
            if (typeof item !== 'object' || item === null) continue;
            const field = item as Record<string, unknown>;
            const key = cleanParamKey(field.key);
            if (!key || params.some((existing) => existing.key === key)) continue;
            const min = clampNumber(field.min, 1, -1_000_000, 1_000_000);
            const max = clampNumber(field.max, Math.max(min, 100), min, 1_000_000);
            params.push({
                key,
                value: clampNumber(field.value, min, min, max),
                min,
                max,
                step: clampNumber(field.step, 1, 0.0001, 10_000),
            });
        }
    }

    const direction = candidate.direction === 'short' || candidate.direction === 'reversal' ? candidate.direction : 'long';

    return {
        id: typeof candidate.id === 'string' && candidate.id ? candidate.id.slice(0, 64) : `s${Date.now().toString(36)}`,
        name: cleanStrategyName(candidate.name) || 'Custom strategy',
        entry,
        exit,
        params,
        stopPct: clampNumber(candidate.stopPct, 0, 0, 90),
        targetPct: clampNumber(candidate.targetPct, 0, 0, 1000),
        trailingPct: clampNumber(candidate.trailingPct, 0, 0, 90),
        riskPct: clampNumber(candidate.riskPct, 0, 0, 100),
        direction,
    };
}

/** The parameter values an expression sees, in the order the table lists them. */
export const paramValues = (strategy: CustomStrategy): Record<string, number> =>
    Object.fromEntries(strategy.params.map((param) => [param.key, param.value]));

/**
 * Replaces `{fast}`-style placeholders with their numbers. A placeholder with no parameter is left
 * alone, and the formula then fails on "unknown name", which the editor already explains.
 */
export function substituteParams(text: string, values: Record<string, number>): string {
    return text.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (whole, key: string) =>
        Number.isFinite(values[key]) ? String(values[key]) : whole,
    );
}

export type RuleCheck = { ok: true } | { ok: false; error: string; position?: number };

/** One rule, with its placeholders filled, parsed exactly as the engine will parse it. */
export function checkRule(text: string, values: Record<string, number>): RuleCheck {
    const result = evaluateFormula(substituteParams(text, values), []);
    return result.ok ? { ok: true } : { ok: false, error: result.error, position: result.position };
}

/**
 * Maps an offset in the substituted rule back to the original one. A placeholder is shorter than
 * the number it becomes, so the reported position cannot be used directly: the source is walked
 * while the substituted length each character produces is counted.
 */
export function sourcePosition(text: string, values: Record<string, number>, position: number | undefined): number | null {
    if (typeof position !== 'number' || position < 0) return null;
    let cursor = 0;
    let produced = 0;
    while (cursor < text.length && produced < position) {
        const placeholder = /^\{([a-zA-Z_][a-zA-Z0-9_]*)\}/.exec(text.slice(cursor));
        if (placeholder && Number.isFinite(values[placeholder[1]])) {
            const length = String(values[placeholder[1]]).length;
            if (produced + length > position) return cursor;
            produced += length;
            cursor += placeholder[0].length;
            continue;
        }
        produced += 1;
        cursor += 1;
    }
    return cursor;
}

/** Whether both rules parse once their placeholders are filled — what the studio checks before a run. */
export function checkCustomStrategy(strategy: CustomStrategy): { ok: true } | { ok: false; error: string; rule: 'entry' | 'exit' } {
    const values = paramValues(strategy);
    const entry = checkRule(strategy.entry, values);
    if (!entry.ok) return { ok: false, error: entry.error, rule: 'entry' };
    const exit = checkRule(strategy.exit, values);
    if (!exit.ok) return { ok: false, error: exit.error, rule: 'exit' };
    return { ok: true };
}

/** One boolean per bar: true when the rule's value is non-zero and defined. A gap is not a signal. */
const ruleFlags = (text: string, candles: readonly Candle[]): boolean[] => {
    const result = evaluateFormula(text, candles);
    if (!result.ok) return candles.map(() => false);
    return result.values.map((value) => Number.isFinite(value) && value !== 0);
};

export type CustomSignals = { entries: boolean[]; exits: boolean[] };

export function customSignals(candles: readonly Candle[], strategy: CustomStrategy): CustomSignals {
    const values = paramValues(strategy);
    return {
        entries: ruleFlags(substituteParams(strategy.entry, values), candles),
        exits: ruleFlags(substituteParams(strategy.exit, values), candles),
    };
}

const fill = (price: number, direction: 'buy' | 'sell', costs: Costs): number => {
    const slip = Math.max(0, costs.slippageBps) / 10_000;
    const commission = Math.max(0, costs.commissionBps) / 10_000;
    return direction === 'buy' ? price * (1 + slip) * (1 + commission) : price * (1 - slip) * (1 - commission);
};

/** The share of equity one trade takes: risk per trade divided by the stop distance, capped at 100%. */
export function positionFraction(strategy: CustomStrategy): number {
    if (strategy.riskPct <= 0) return 1;
    if (strategy.stopPct <= 0) return Math.min(1, strategy.riskPct / 10);
    return Math.min(1, Math.max(0.01, strategy.riskPct / strategy.stopPct));
}

type Open = {
    side: 'long' | 'short';
    entryPrice: number;
    entryIndex: number;
    entryEquity: number;
    fraction: number;
    best: number;
};

/**
 * The custom engine. It mirrors `backtest` in lib/strategies so the numbers mean the same thing:
 * signals are read on a close, the fill is the next open, the stop is checked before the target and
 * before that open, and an open position is closed on the last bar rather than hidden.
 */
export function backtestCustom(
    candles: readonly Candle[],
    strategy: CustomStrategy,
    costs: Costs = DEFAULT_COSTS,
): Backtest | null {
    if (candles.length < 2) return null;
    const rules = customSignals(candles, strategy);
    const fraction = positionFraction(strategy);

    const trades: Trade[] = [];
    const signalsOut: Signal[] = [];
    const equity: EquityPoint[] = [];
    const drawdown: DrawdownPoint[] = [];

    const start = 100;
    const benchEntry = fill(candles[0].open, 'buy', costs);
    const benchExit = 1 - Math.max(0, costs.slippageBps) / 10_000;

    let cash = start;
    let open: Open | null = null;
    let pending: 'entry-long' | 'entry-short' | 'exit' | null = null;
    let peak = start;

    const openPosition = (side: 'long' | 'short', index: number, price: number) => {
        open = {
            side,
            entryPrice: fill(price, side === 'long' ? 'buy' : 'sell', costs),
            entryIndex: index,
            entryEquity: cash,
            fraction,
            best: price,
        };
        signalsOut.push({ index, kind: 'entry' });
    };

    const closePosition = (index: number, price: number, reason: TradeReason) => {
        if (!open) return;
        const exitPrice = fill(price, open.side === 'long' ? 'sell' : 'buy', costs);
        const move = open.side === 'long' ? exitPrice / open.entryPrice - 1 : 1 - exitPrice / open.entryPrice;
        const value = open.entryEquity * (1 + open.fraction * move);
        trades.push({
            entryIndex: open.entryIndex,
            entryTime: candles[open.entryIndex].time,
            entryPrice: open.entryPrice,
            exitIndex: index,
            exitTime: candles[index].time,
            exitPrice,
            pnl: value - open.entryEquity,
            pnlPct: move * 100,
            bars: index - open.entryIndex,
            reason,
        });
        signalsOut.push({ index, kind: 'exit' });
        cash = value;
        open = null;
    };

    for (let i = 0; i < candles.length; i += 1) {
        const candle = candles[i];

        // A signal set on the previous close is filled at this open.
        if (pending === 'exit' && open) closePosition(i, candle.open, 'signal');
        // A reversal closes and opens opposite on the same open price, which is one round trip, not two.
        if (pending === 'entry-long') {
            if (open) closePosition(i, candle.open, 'signal');
            openPosition('long', i, candle.open);
        } else if (pending === 'entry-short') {
            if (open) closePosition(i, candle.open, 'signal');
            openPosition('short', i, candle.open);
        }
        pending = null;

        if (open) {
            const position: Open = open;
            position.best = position.side === 'long' ? Math.max(position.best, candle.high) : Math.min(position.best, candle.low);

            const stopPrice = strategy.stopPct > 0
                ? position.side === 'long'
                    ? position.entryPrice * (1 - strategy.stopPct / 100)
                    : position.entryPrice * (1 + strategy.stopPct / 100)
                : null;
            const trailPrice = strategy.trailingPct > 0
                ? position.side === 'long'
                    ? position.best * (1 - strategy.trailingPct / 100)
                    : position.best * (1 + strategy.trailingPct / 100)
                : null;
            const targetPrice = strategy.targetPct > 0
                ? position.side === 'long'
                    ? position.entryPrice * (1 + strategy.targetPct / 100)
                    : position.entryPrice * (1 - strategy.targetPct / 100)
                : null;

            // The trail only ever tightens: the tighter of the two is the stop that actually holds.
            let stop = stopPrice;
            let stopReason: TradeReason = 'stop';
            if (trailPrice != null && (stop == null || (position.side === 'long' ? trailPrice > stop : trailPrice < stop))) {
                stop = trailPrice;
                stopReason = 'trail';
            }
            const hitStop = stop != null && (position.side === 'long' ? candle.low <= stop : candle.high >= stop);
            const hitTarget = targetPrice != null && (position.side === 'long' ? candle.high >= targetPrice : candle.low <= targetPrice);

            // Pessimistic order: the stop is taken before the target when a bar touched both.
            if (hitStop) closePosition(i, stop as number, stopReason);
            else if (hitTarget) closePosition(i, targetPrice as number, 'target');

            if (open) {
                const current: Open = open;
                const move = current.side === 'long' ? candle.close / current.entryPrice - 1 : 1 - candle.close / current.entryPrice;
                cash = current.entryEquity * (1 + current.fraction * move);
            }
        }

        const value = cash;
        peak = Math.max(peak, value);
        equity.push({
            time: candle.time,
            value,
            benchmark: (start * candle.close * benchExit) / benchEntry,
        });
        drawdown.push({ time: candle.time, value: value / peak - 1 });

        if (i === candles.length - 1) break;

        const wantEntry = rules.entries[i];
        const wantExit = rules.exits[i];
        // A snapshot, because the closure above is what actually clears `open` and the compiler
        // cannot see through it.
        const held = open as Open | null;
        if (strategy.direction === 'reversal') {
            // Always in the market: the entry rule goes long, the exit rule goes short.
            if (held?.side === 'long' && wantExit) pending = 'entry-short';
            else if (held?.side === 'short' && wantEntry) pending = 'entry-long';
            else if (!held && wantEntry) pending = 'entry-long';
            else if (!held && wantExit) pending = 'entry-short';
        } else {
            if (held && wantExit) pending = 'exit';
            else if (!held && wantEntry) pending = strategy.direction === 'short' ? 'entry-short' : 'entry-long';
        }
    }

    if (open) {
        const last = candles[candles.length - 1];
        closePosition(candles.length - 1, last.close, 'signal');
        peak = Math.max(peak, cash);
        equity[equity.length - 1] = { ...equity[equity.length - 1], value: cash };
        drawdown[drawdown.length - 1] = { time: last.time, value: cash / peak - 1 };
    }

    return { trades, signals: signalsOut, equity, drawdown };
}

/** Metrics with the interval's annualisation, so a custom run is read exactly like a built-in one. */
export function customMetrics(result: Backtest, intervalId: string, riskFreeRate = 0): Metrics {
    return metrics(result, barsPerYear(intervalId), riskFreeRate);
}

// --- optimizer ---------------------------------------------------------------

export type OptimizerRow = { values: Record<string, number>; metrics: Metrics };
export type OptimizerResult = {
    /** The best rows, ranked by the objective: what the table shows. */
    rows: OptimizerRow[];
    /** Every combination that traded, ranked the same way: what the surface draws. */
    all: OptimizerRow[];
    /** How many combinations were actually run, which may be fewer than the grid asked for. */
    tried: number;
    /** True when the grid was cut to the cap, so the caller can say the search was partial. */
    truncated: boolean;
};

const gridValues = (param: CustomParam): number[] => {
    const step = param.step > 0 ? param.step : 1;
    const out: number[] = [];
    for (let value = param.min; value <= param.max + step / 1000; value += step) {
        out.push(Math.round(value * 1e6) / 1e6);
        if (out.length > 2000) break;
    }
    return out.length > 0 ? out : [param.value];
};

/**
 * Every combination of the parameters' grid, capped so a wide grid cannot lock the browser. The cap
 * thins each list evenly instead of cutting the last parameter short, so the search still covers the
 * whole range — a truncated grid that only ever tried the first few values would be a lie.
 */
export function paramCombinations(params: readonly CustomParam[]): { combos: Record<string, number>[]; truncated: boolean } {
    if (params.length === 0) return { combos: [{}], truncated: false };
    const lists = params.map(gridValues);
    const product = (values: number[][]) => values.reduce((total, list) => total * list.length, 1);
    let total = product(lists);
    const truncated = total > MAX_OPTIMIZER_COMBOS;
    while (total > MAX_OPTIMIZER_COMBOS) {
        let longest = 0;
        for (let i = 1; i < lists.length; i += 1) if (lists[i].length > lists[longest].length) longest = i;
        if (lists[longest].length <= 1) break;
        const list = lists[longest];
        const thinned: number[] = [];
        for (let i = 0; i < list.length; i += 2) thinned.push(list[i]);
        if (thinned[thinned.length - 1] !== list[list.length - 1]) thinned.push(list[list.length - 1]);
        lists[longest] = thinned;
        total = product(lists);
    }

    let combos: Record<string, number>[] = [{}];
    for (let index = 0; index < params.length; index += 1) {
        const key = params[index].key;
        const next: Record<string, number>[] = [];
        for (const combo of combos) {
            for (const value of lists[index]) next.push({ ...combo, [key]: value });
        }
        combos = next;
    }
    return { combos, truncated };
}

const objectiveValue = (row: Metrics, objective: Objective): number | null => {
    const value = row[objective];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

/**
 * Grid search. A row is kept only when the run produced trades — an untested parameter set that
 * never traded is not a better strategy, it is an empty one.
 */
export function optimize(
    candles: readonly Candle[],
    strategy: CustomStrategy,
    objective: Objective = 'sharpe',
    costs: Costs = DEFAULT_COSTS,
    intervalId = '1d',
): OptimizerResult {
    const { combos, truncated } = paramCombinations(strategy.params);
    const perYear = barsPerYear(intervalId);
    const rows: OptimizerRow[] = [];
    for (const values of combos) {
        const tuned: CustomStrategy = { ...strategy, params: strategy.params.map((param) => ({ ...param, value: values[param.key] ?? param.value })) };
        const result = backtestCustom(candles, tuned, costs);
        if (!result || result.trades.length === 0) continue;
        rows.push({ values, metrics: metrics(result, perYear, 0) });
    }
    rows.sort((a, b) => (objectiveValue(b.metrics, objective) ?? -Infinity) - (objectiveValue(a.metrics, objective) ?? -Infinity));
    return { rows: rows.slice(0, 25), all: rows, tried: combos.length, truncated };
}

// --- walk-forward -------------------------------------------------------------

export type WalkForwardFold = {
    index: number;
    trainFrom: number;
    trainTo: number;
    testFrom: number;
    testTo: number;
    params: Record<string, number>;
    train: Metrics;
    test: Metrics;
};

export type WalkForwardResult = {
    folds: WalkForwardFold[];
    /** The compounded out-of-sample return across the folds. */
    oosReturn: number | null;
    /** Mean out-of-sample Sharpe, when the folds could support one. */
    oosSharpe: number | null;
};

/**
 * Anchored walk-forward: fold one trains on the first block and tests on the next, fold two trains
 * on everything up to the second block, and so on. The test block is never part of its own training
 * window, which is the whole point of the exercise.
 */
export function walkForward(
    candles: readonly Candle[],
    strategy: CustomStrategy,
    folds = 4,
    objective: Objective = 'sharpe',
    costs: Costs = DEFAULT_COSTS,
    intervalId = '1d',
): WalkForwardResult | null {
    const count = Math.max(2, Math.min(8, Math.floor(folds)));
    if (candles.length < count * 20) return null;
    const block = Math.floor(candles.length / (count + 1));
    if (block < 10) return null;

    const out: WalkForwardFold[] = [];
    for (let index = 1; index <= count; index += 1) {
        const trainFrom = 0;
        const trainTo = block * index;
        const testFrom = trainTo;
        const testTo = Math.min(candles.length, trainTo + block);
        if (testTo - testFrom < 5) break;
        const trainCandles = candles.slice(trainFrom, trainTo);
        const testCandles = candles.slice(testFrom, testTo);
        const best = optimize(trainCandles, strategy, objective, costs, intervalId).rows[0];
        if (!best) continue;
        const tuned = strategy.params.map((param) => ({ ...param, value: best.values[param.key] ?? param.value }));
        const trainResult = backtestCustom(trainCandles, { ...strategy, params: tuned }, costs);
        const testResult = backtestCustom(testCandles, { ...strategy, params: tuned }, costs);
        if (!trainResult || !testResult) continue;
        const perYear = barsPerYear(intervalId);
        out.push({
            index: out.length + 1,
            trainFrom,
            trainTo,
            testFrom,
            testTo,
            params: best.values,
            train: metrics(trainResult, perYear, 0),
            test: metrics(testResult, perYear, 0),
        });
    }
    if (out.length === 0) return null;

    let product = 1;
    let any = false;
    for (const fold of out) {
        if (fold.test.totalReturn == null) continue;
        product *= 1 + fold.test.totalReturn;
        any = true;
    }
    const sharpes = out.map((fold) => fold.test.sharpe).filter((value): value is number => value != null);
    return {
        folds: out,
        oosReturn: any ? product - 1 : null,
        oosSharpe: sharpes.length > 0 ? sharpes.reduce((sum, value) => sum + value, 0) / sharpes.length : null,
    };
}

/** The JSON a share link or an export carries: the object as it is, with the current values. */
export const serializeStrategy = (strategy: CustomStrategy): string => JSON.stringify(strategy, null, 2);

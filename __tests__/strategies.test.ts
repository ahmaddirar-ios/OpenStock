import { describe, expect, it } from 'vitest';
import type { Candle } from '@/lib/yahoo-candles';
import { macd } from '@/lib/indicators';
import {
    STRATEGY_IDS,
    backtest,
    defaultParams,
    metrics,
    signals,
    toCsv,
    type Backtest,
    type Costs,
} from '@/lib/strategies';

const FREE: Costs = { commissionBps: 0, slippageBps: 0 };

const flat = (close: number, i: number): Candle => ({
    time: 1_700_000_000 + i * 86_400,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
});

const series = (closes: number[]): Candle[] => closes.map((close, i) => flat(close, i));

// 6 flat bars, ten rising bars, then four falling: exactly one up-cross at 6 and one down-cross at 16.
const UP_THEN_DOWN = series([10, 10, 10, 10, 10, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 9, 9, 9, 9]);

describe('the library', () => {
    it('exposes six strategies with defaults', () => {
        expect(STRATEGY_IDS).toHaveLength(6);
        for (const id of STRATEGY_IDS) expect(Object.keys(defaultParams(id)).length).toBeGreaterThan(0);
    });
});

describe('sma-cross', () => {
    it('signals on the crossing bar only', () => {
        const out = signals(UP_THEN_DOWN, 'sma-cross', { fast: 2, slow: 4, stopPct: 50 });
        expect(out).toEqual([
            { index: 6, kind: 'entry' },
            { index: 16, kind: 'exit' },
        ]);
    });

    it('never reads past the last candle', () => {
        expect(signals(UP_THEN_DOWN.slice(0, 5), 'sma-cross', { fast: 50, slow: 200, stopPct: 50 })).toEqual([]);
    });
});

describe('ema-cross', () => {
    it('re-arms after the opposite cross', () => {
        const zigzag = series([10, 10, 10, 10, 10, 10, 10, 10, 20, 20, 20, 20, 20, 5, 5, 5, 5, 5, 20, 20, 20, 20, 20, 5, 5, 5, 5, 5]);
        const out = signals(zigzag, 'ema-cross', { fast: 3, slow: 6, stopPct: 50 });
        expect(out.filter((signal) => signal.kind === 'entry').length).toBe(2);
        expect(out[0].kind).toBe('entry');
        for (let i = 1; i < out.length; i += 1) expect(out[i].kind).not.toBe(out[i - 1].kind);
    });
});

describe('rsi-reversion', () => {
    it('waits for the RSI to climb back above the entry level', () => {
        const out = signals(series([20, 18, 16, 14, 12, 10, 9, 8, 8, 9, 11, 14, 18, 22, 26, 31, 35, 40]), 'rsi-reversion', {
            period: 3,
            entry: 30,
            exit: 70,
            stopPct: 50,
        });
        expect(out[0]?.kind).toBe('entry');
        expect(out[0].index).toBeGreaterThan(5);
        for (let i = 1; i < out.length; i += 1) expect(out[i].kind).not.toBe(out[i - 1].kind);
    });
});

describe('macd-cross', () => {
    it('only enters while the MACD line is below zero', () => {
        const rising = series(Array.from({ length: 60 }, (_, i) => 100 + i * 2));
        const { macd: line } = macd(rising.map((candle) => candle.close), 3, 6, 3);
        const out = signals(rising, 'macd-cross', { fast: 3, slow: 6, signal: 3, stopPct: 50 });
        for (const signal of out.filter((item) => item.kind === 'entry')) {
            expect(line[signal.index]!).toBeLessThan(0);
        }
    });
});

describe('donchian-breakout', () => {
    it('compares against the previous bars, not the current one', () => {
        const bars = ['10', '10', '10', '20', '20', '20', '5', '5'].map((close, i) => flat(Number(close), i));
        expect(signals(bars, 'donchian-breakout', { entry: 2, exit: 2, stopPct: 50 })).toEqual([
            { index: 3, kind: 'entry' },
            { index: 6, kind: 'exit' },
        ]);
    });
});

describe('ema50-pullback', () => {
    it('needs the uptrend, the touch and a green close', () => {
        const candles: Candle[] = [];
        for (let i = 0; i < 30; i += 1) {
            const close = 100 + i * 2;
            candles.push({ time: 1_700_000_000 + i * 86_400, open: close - 1, high: close + 1, low: close - 2, close, volume: 1 });
        }
        const touch: Candle = { time: 1_700_000_000 + 30 * 86_400, open: 158, high: 163, low: 154, close: 162, volume: 1 };
        candles.push(touch);
        const out = signals(candles, 'ema50-pullback', { fast: 5, slow: 10, stopPct: 7, targetPct: 0 });
        expect(out.some((signal) => signal.kind === 'entry' && signal.index === 30)).toBe(true);
    });

    it('refuses a touch whose bar closes red', () => {
        const candles: Candle[] = [];
        for (let i = 0; i < 30; i += 1) {
            const close = 100 + i * 2;
            candles.push({ time: 1_700_000_000 + i * 86_400, open: close - 1, high: close + 1, low: close - 2, close, volume: 1 });
        }
        candles.push({ time: 1_700_000_000 + 30 * 86_400, open: 162, high: 163, low: 154, close: 157, volume: 1 });
        const out = signals(candles, 'ema50-pullback', { fast: 5, slow: 10, stopPct: 7, targetPct: 0 });
        expect(out.some((signal) => signal.index === 30)).toBe(false);
    });
});

describe('backtest', () => {
    const bars = ['10', '10', '10', '20', '20', '20', '5', '5'].map((close, i) => flat(Number(close), i));
    const result = backtest(bars, 'donchian-breakout', { entry: 2, exit: 2, stopPct: 90 }, FREE)!;

    it('fills on the next open and exits on the next open after the exit signal', () => {
        expect(result.trades).toHaveLength(1);
        const trade = result.trades[0];
        expect(trade.entryIndex).toBe(4);
        expect(trade.entryPrice).toBe(20);
        expect(trade.exitIndex).toBe(7);
        expect(trade.exitPrice).toBe(5);
        expect(trade.reason).toBe('signal');
        expect(trade.pnlPct).toBeCloseTo(-75, 5);
        expect(trade.bars).toBe(3);
    });

    it('marks equity on every bar', () => {
        expect(result.equity).toHaveLength(bars.length);
        expect(result.equity[0].value).toBe(100);
        expect(result.equity[6].value).toBeCloseTo(25, 5);
        expect(result.equity.at(-1)!.value).toBeCloseTo(25, 5);
    });

    it('charges commission and slippage on both sides', () => {
        const costs: Costs = { commissionBps: 10, slippageBps: 10 };
        const paid = backtest(bars, 'donchian-breakout', { entry: 2, exit: 2, stopPct: 90 }, costs)!;
        expect(paid.trades[0].entryPrice).toBeCloseTo(20 * 1.001 * 1.001, 6);
        expect(paid.trades[0].exitPrice).toBeCloseTo(5 * 0.999 * 0.999, 6);
    });

    it('exits at the stop and says so', () => {
        const stops = backtest(UP_THEN_DOWN, 'sma-cross', { fast: 2, slow: 4, stopPct: 5 }, FREE)!;
        expect(stops.trades[0].reason).toBe('stop');
    });

    it('prefers the stop when a bar touches both', () => {
        const both: Candle[] = [
            flat(10, 0),
            flat(10, 1),
            flat(20, 2),
            { time: 3, open: 20, high: 30, low: 5, close: 20, volume: 1 },
            { time: 4, open: 20, high: 20, low: 20, close: 20, volume: 1 },
        ];
        const res = backtest(both, 'donchian-breakout', { entry: 2, exit: 2, stopPct: 10, targetPct: 20 }, FREE)!;
        expect(res.trades[0].reason).toBe('stop');
    });
});

const equityOf = (values: number[]) =>
    values.map((value, i) => ({ time: 1_700_000_000 + i * 86_400, value, benchmark: 100 }));

const resultWith = (values: number[], trades: Backtest['trades'] = []): Backtest => ({
    trades,
    signals: [],
    equity: equityOf(values),
    drawdown: [],
});

describe('metrics', () => {
    it('reports nothing it cannot know on a flat equity', () => {
        const m = metrics(resultWith(Array.from({ length: 253 }, () => 100)), 252, 0);
        expect(m.totalReturn).toBe(0);
        expect(m.sharpe).toBeNull();
        expect(m.sortino).toBeNull();
        expect(m.maxDrawdown).toBe(0);
        expect(m.winRate).toBeNull();
        expect(m.profitFactor).toBeNull();
    });

    it('annualises a year of 10 % growth', () => {
        const values = Array.from({ length: 253 }, (_, i) => 100 * Math.pow(1.1, i / 252));
        const m = metrics(resultWith(values), 252, 0);
        expect(m.cagr).toBeCloseTo(0.1, 4);
        expect(m.totalReturn).toBeCloseTo(0.1, 6);
    });

    it('refuses to annualise an intraday series', () => {
        const values = Array.from({ length: 50 }, (_, i) => 100 + i);
        const m = metrics(resultWith(values), 0, 0);
        expect(m.cagr).toBeNull();
        expect(m.sharpe).toBeNull();
        expect(m.totalReturn).toBeCloseTo(0.49, 6);
    });

    it('measures the drawdown from the peak', () => {
        const m = metrics(resultWith([100, 120, 96, 110]), 252, 0);
        expect(m.maxDrawdown).toBeCloseTo(0.2, 6);
    });

    it('counts trades, wins and profit factor', () => {
        const trades = [
            { entryIndex: 1, entryTime: 2, entryPrice: 100, exitIndex: 2, exitTime: 3, exitPrice: 110, pnl: 10, pnlPct: 10, bars: 1, reason: 'signal' as const },
            { entryIndex: 3, entryTime: 4, entryPrice: 110, exitIndex: 4, exitTime: 5, exitPrice: 105, pnl: -5, pnlPct: -4.5, bars: 1, reason: 'stop' as const },
        ];
        const m = metrics(resultWith([100, 110, 105], trades), 252, 0);
        expect(m.trades).toBe(2);
        expect(m.winRate).toBeCloseTo(0.5, 6);
        expect(m.profitFactor).toBeCloseTo(2, 6);
        expect(m.avgWin).toBeCloseTo(10, 6);
        expect(m.avgLoss).toBeCloseTo(5, 6);
        expect(m.avgBars).toBe(1);
    });
});

describe('toCsv', () => {
    const trade = { entryIndex: 1, entryTime: 1_700_000_000, entryPrice: 10, exitIndex: 2, exitTime: 1_700_086_400, exitPrice: 11, pnl: 1, pnlPct: 10, bars: 1, reason: 'signal' as const };

    it('opens in a spreadsheet with Arabic headers', () => {
        const csv = toCsv([trade], 'ar');
        expect(csv.charCodeAt(0)).toBe(0xfeff);
        const lines = csv.slice(1).trim().split('\n');
        expect(lines).toHaveLength(2);
        expect(lines[0].split(',').length).toBe(8);
        expect(lines[0]).toContain('الدخول');
        expect(lines[1]).toContain('إشارة');
    });

    it('writes an English header, dates and a percentage', () => {
        const lines = toCsv([trade], 'en').slice(1).trim().split('\n');
        expect(lines[0].split(',')[0]).toBe('Entry date');
        expect(lines[1]).toContain('2023-11-14');
        expect(lines[1]).toContain('10.00');
    });
});

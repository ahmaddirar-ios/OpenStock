'use server';

import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/database/mongoose';
import { Position } from '@/database/models/position.model';
import { Transaction } from '@/database/models/transaction.model';
import { requireUserId } from '@/lib/better-auth/auth';
import { parseAmount } from '@/lib/portfolio';
import { buildLedger, mergePositions, parseTradesCsv, type TradeSide } from '@/lib/portfolio-ledger';
import { getStrategyCandles } from '@/lib/actions/yahoo-candles.actions';
import { getWatchlistData } from '@/lib/actions/finnhub.actions';

// Tickers as Finnhub writes them (AAPL, BRK.B, RELIANCE.NS, M&M.NS, 0700.HK, BINANCE:BTCUSDT).
// Every symbol here becomes a quote call on /portfolio, so it is validated like the watchlist's.
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.&:-]{0,24}$/;
const MAX_POSITIONS = 100;
/** A ledger is read whole on every portfolio render, so it is bounded like the other lists. */
const MAX_TRADES = 2000;
const MAX_IMPORT_ROWS = 500;

export type PositionInput = {
    symbol: string;
    company?: string;
    quantity: number | string;
    averageCost: number | string;
};

export type PositionRecord = {
    symbol: string;
    company: string;
    quantity: number;
    averageCost: number;
    createdAt: string;
    updatedAt: string;
};

const cleanSymbol = (raw: unknown): string | null => {
    const ticker = String(raw ?? '').trim().toUpperCase();
    return SYMBOL_PATTERN.test(ticker) ? ticker : null;
};

const cleanCompany = (raw: unknown, fallback: string): string => {
    const name = String(raw ?? '').trim().slice(0, 120);
    return name || fallback;
};

// -- CRUD Operations --

/** Adds a position, or replaces the held quantity and cost if the symbol is already tracked. */
export async function addPosition(input: PositionInput) {
    const userId = await requireUserId();
    const symbol = cleanSymbol(input.symbol);
    if (!symbol) return { error: 'invalidSymbol' };

    const quantity = parseAmount(input.quantity);
    if (quantity === null) return { error: 'invalidQuantity' };

    const averageCost = parseAmount(input.averageCost, { allowZero: true });
    if (averageCost === null) return { error: 'invalidCost' };

    try {
        await connectToDatabase();

        if (!(await Position.exists({ userId, symbol })) && (await Position.countDocuments({ userId })) >= MAX_POSITIONS) {
            return { error: 'full' };
        }

        const saved = await Position.findOneAndUpdate(
            { userId, symbol },
            { userId, symbol, company: cleanCompany(input.company, symbol), quantity, averageCost },
            { upsert: true, new: true }
        );

        revalidatePath('/portfolio');
        return JSON.parse(JSON.stringify(saved)) as PositionRecord;
    } catch (error) {
        console.error('Error saving position:', error);
        return { error: 'failed' };
    }
}

export async function deletePosition(symbol: string) {
    const userId = await requireUserId();
    const ticker = cleanSymbol(symbol);
    if (!ticker) return { error: 'invalidSymbol' };
    try {
        await connectToDatabase();
        await Position.findOneAndDelete({ userId, symbol: ticker });
        revalidatePath('/portfolio');
        return { success: true };
    } catch (error) {
        console.error('Error deleting position:', error);
        return { error: 'failed' };
    }
}

export async function getUserPositions(): Promise<PositionRecord[]> {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        const positions = await Position.find({ userId }).sort({ createdAt: -1 });
        return JSON.parse(JSON.stringify(positions));
    } catch (error) {
        console.error('Error fetching positions:', error);
        return [];
    }
}

// -- Trade ledger ------------------------------------------------------------------------------
//
// A position is a snapshot ("I hold 40 shares at 31.20"); a trade is the history that produced it.
// Both live side by side: the ledger is the source of truth for any symbol it touches, and a manual
// position still works for someone who only wants to type what they hold.

export type TradeRecord = {
    id: string;
    symbol: string;
    company: string;
    side: TradeSide;
    quantity: number;
    price: number;
    fee: number;
    tradedAt: string;
    note: string;
};

export type TradeInput = {
    symbol: string;
    company?: string;
    side: TradeSide;
    quantity: number | string;
    price: number | string;
    fee?: number | string;
    tradedAt?: string;
    note?: string;
};

const cleanSide = (raw: unknown): TradeSide | null => (raw === 'buy' || raw === 'sell' ? raw : null);

const cleanDate = (raw: unknown): Date | null => {
    if (typeof raw !== 'string' || raw.trim() === '') return new Date();
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) return null;
    // A trade cannot be in the future; a clock-skewed client is clamped to now.
    return new Date(Math.min(parsed, Date.now()));
};

const toRecord = (doc: {
    _id: unknown;
    symbol: string;
    company?: string;
    side: TradeSide;
    quantity: number;
    price: number;
    fee?: number;
    tradedAt: Date;
    note?: string;
}): TradeRecord => ({
    id: String(doc._id),
    symbol: doc.symbol,
    company: doc.company ?? doc.symbol,
    side: doc.side,
    quantity: doc.quantity,
    price: doc.price,
    fee: doc.fee ?? 0,
    tradedAt: new Date(doc.tradedAt).toISOString(),
    note: doc.note ?? '',
});

/** Records one buy or sell. The ledger's FIFO maths runs on read, so nothing is cached here. */
export async function recordTrade(input: TradeInput) {
    const userId = await requireUserId();
    const symbol = cleanSymbol(input.symbol);
    if (!symbol) return { error: 'invalidSymbol' };

    const side = cleanSide(input.side);
    if (!side) return { error: 'invalidSide' };

    const quantity = parseAmount(input.quantity);
    if (quantity === null) return { error: 'invalidQuantity' };

    const price = parseAmount(input.price, { allowZero: true });
    if (price === null) return { error: 'invalidPrice' };

    const fee = input.fee === undefined || input.fee === '' ? 0 : parseAmount(input.fee, { allowZero: true });
    if (fee === null) return { error: 'invalidFee' };

    const tradedAt = cleanDate(input.tradedAt);
    if (!tradedAt) return { error: 'invalidDate' };

    try {
        await connectToDatabase();
        if ((await Transaction.countDocuments({ userId })) >= MAX_TRADES) return { error: 'full' };

        const saved = await Transaction.create({
            userId,
            symbol,
            company: cleanCompany(input.company, symbol),
            side,
            quantity,
            price,
            fee,
            tradedAt,
            note: String(input.note ?? '').trim().slice(0, 200),
        });

        revalidatePath('/portfolio');
        return toRecord(saved);
    } catch (error) {
        console.error('Error recording trade:', error);
        return { error: 'failed' };
    }
}

export async function deleteTrade(id: string) {
    const userId = await requireUserId();
    const tradeId = String(id ?? '').trim();
    if (!/^[a-f0-9]{24}$/i.test(tradeId)) return { error: 'invalidTrade' };
    try {
        await connectToDatabase();
        await Transaction.findOneAndDelete({ _id: tradeId, userId });
        revalidatePath('/portfolio');
        return { success: true };
    } catch (error) {
        console.error('Error deleting trade:', error);
        return { error: 'failed' };
    }
}

/** Every trade, oldest first — the order the FIFO replay needs. */
export async function getUserTrades(): Promise<TradeRecord[]> {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        const trades = await Transaction.find({ userId }).sort({ tradedAt: 1, createdAt: 1 }).limit(MAX_TRADES);
        return trades.map(toRecord);
    } catch (error) {
        console.error('Error fetching trades:', error);
        return [];
    }
}

export type ImportResult =
    | { ok: true; imported: number; skipped: number; errors: { line: number; message: string }[] }
    | { ok: false; reason: 'empty' | 'tooMany' | 'failed' };

/**
 * Imports a CSV of trades. Rows that fail validation are reported by line and skipped; the rest are
 * written in one insert. The cap is on the file, not the account, so a huge export is refused with a
 * clear reason instead of half-importing.
 */
export async function importTradesCsv(text: string): Promise<ImportResult> {
    const userId = await requireUserId();
    const parsed = parseTradesCsv(String(text ?? ''));
    if (parsed.trades.length === 0 && parsed.errors.length === 0) return { ok: false, reason: 'empty' };
    if (parsed.trades.length > MAX_IMPORT_ROWS) return { ok: false, reason: 'tooMany' };

    const usable = parsed.trades.filter((trade) => cleanSymbol(trade.symbol));
    if (usable.length === 0) {
        return { ok: true, imported: 0, skipped: parsed.errors.length, errors: parsed.errors };
    }

    try {
        await connectToDatabase();
        const existing = await Transaction.countDocuments({ userId });
        const room = Math.max(0, MAX_TRADES - existing);
        const batch = usable.slice(0, room);
        if (batch.length > 0) {
            await Transaction.insertMany(
                batch.map((trade) => ({
                    userId,
                    symbol: cleanSymbol(trade.symbol)!,
                    company: cleanCompany(trade.company, cleanSymbol(trade.symbol)!),
                    side: trade.side,
                    quantity: trade.quantity,
                    price: trade.price,
                    fee: trade.fee ?? 0,
                    tradedAt: new Date(trade.tradedAt),
                    note: (trade.note ?? '').slice(0, 200),
                }))
            );
        }
        revalidatePath('/portfolio');
        return {
            ok: true,
            imported: batch.length,
            skipped: parsed.errors.length + (usable.length - batch.length),
            errors: parsed.errors,
        };
    } catch (error) {
        console.error('Error importing trades:', error);
        return { ok: false, reason: 'failed' };
    }
}

// -- Benchmark ---------------------------------------------------------------------------------

export type BenchmarkPoint = { time: number; value: number };

export type PortfolioBenchmark = {
    symbol: string;
    label: string;
    currency: string;
    /** Percent change of the index from the first bar at or after the window start. */
    returnPct: number;
    startDate: string;
    endDate: string;
    /** Daily percent-change series, for the comparison sparkline. */
    series: BenchmarkPoint[];
};

/**
 * The index a portfolio is measured against: TASI for riyals, the S&P 500 for dollars. The window
 * starts at the user's first trade (or first position), so the comparison covers the same period the
 * portfolio has existed rather than an arbitrary year.
 */
export async function getPortfolioBenchmark(since: string, currency: string): Promise<PortfolioBenchmark | null> {
    const isSar = (currency || '').toUpperCase() === 'SAR';
    const symbol = isSar ? 'TASI' : 'SPY';
    const label = isSar ? 'TASI' : 'S&P 500';
    const from = Date.parse(since);
    const fromSeconds = Number.isFinite(from) ? Math.floor(from / 1000) : -Infinity;

    try {
        const set = await getStrategyCandles(symbol, '1d');
        if (!set || set.candles.length === 0) return null;

        const window = set.candles.filter((candle) => candle.time >= fromSeconds && candle.close > 0);
        if (window.length < 2) return null;

        const first = window[0];
        const last = window[window.length - 1];
        const series = window.map((candle) => ({
            time: candle.time,
            value: Math.round((candle.close / first.close - 1) * 10000) / 100,
        }));

        return {
            symbol,
            label,
            currency: isSar ? 'SAR' : 'USD',
            returnPct: series[series.length - 1].value,
            startDate: new Date(first.time * 1000).toISOString(),
            endDate: new Date(last.time * 1000).toISOString(),
            series,
        };
    } catch (error) {
        console.error('Error fetching benchmark:', error);
        return null;
    }
}

// -- Dashboard summary -------------------------------------------------------------------------

export type PortfolioSummary = {
    /** Mark-to-market value of the open holdings. */
    value: number;
    /** Today's move, in percent of yesterday's value. */
    dayChangePct: number;
    /** Open profit against cost. */
    openPnl: number;
    openPnlPct: number;
    /** Profit already banked. */
    realizedPnl: number;
    currency: string;
    /** How many symbols are held. */
    count: number;
};

/**
 * The one-line portfolio the overview shows. It reads the same ledger the portfolio page does, so
 * the two can never disagree, and it returns null when there is nothing to show rather than a row of
 * zeros.
 */
export async function getPortfolioSummary(): Promise<PortfolioSummary | null> {
    const userId = await requireUserId();
    try {
        await connectToDatabase();
        const [positions, tradeDocs] = await Promise.all([
            Position.find({ userId }).lean(),
            Transaction.find({ userId }).sort({ tradedAt: 1, createdAt: 1 }).limit(MAX_TRADES).lean(),
        ]);
        const trades = tradeDocs.map((doc) => toRecord(doc as never));
        const ledger = buildLedger(trades);
        const merged = mergePositions(
            positions.map((position) => ({
                symbol: position.symbol,
                company: position.company,
                quantity: position.quantity,
                averageCost: position.averageCost,
            })),
            ledger.positions
        );
        if (merged.length === 0) return null;

        const quotes = await getWatchlistData(merged.map((position) => position.symbol));
        const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));

        let value = 0;
        let cost = 0;
        let previous = 0;
        let currency = 'USD';
        for (const position of merged) {
            const quote = bySymbol.get(position.symbol);
            const price = quote?.price ?? position.averageCost;
            const change = quote?.change ?? 0;
            value += position.quantity * price;
            cost += position.quantity * position.averageCost;
            previous += position.quantity * (price - change);
            if (quote?.currency) currency = quote.currency;
        }

        const openPnl = value - cost;
        return {
            value: Math.round(value * 100) / 100,
            dayChangePct: previous > 0 ? Math.round(((value - previous) / previous) * 10000) / 100 : 0,
            openPnl: Math.round(openPnl * 100) / 100,
            openPnlPct: cost > 0 ? Math.round((openPnl / cost) * 10000) / 100 : 0,
            realizedPnl: ledger.totalRealized,
            currency,
            count: merged.length,
        };
    } catch (error) {
        console.error('Error building portfolio summary:', error);
        return null;
    }
}

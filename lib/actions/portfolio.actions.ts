'use server';

import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/database/mongoose';
import { Position } from '@/database/models/position.model';
import { requireUserId } from '@/lib/better-auth/auth';
import { parseAmount } from '@/lib/portfolio';

// Tickers as Finnhub writes them (AAPL, BRK.B, RELIANCE.NS, M&M.NS, 0700.HK, BINANCE:BTCUSDT).
// Every symbol here becomes a quote call on /portfolio, so it is validated like the watchlist's.
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.&:-]{0,24}$/;
const MAX_POSITIONS = 100;

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

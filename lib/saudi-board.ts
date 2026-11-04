import { connectToDatabase } from '@/database/mongoose';
import { SaudiBoardSnapshotModel } from '@/database/models/saudi-board.model';
import { SAUDI_SYMBOLS } from '@/lib/saudi-symbols';
import { isNomuSymbol, buildSaudiBoard, type SaudiBoard } from '@/lib/saudi-market';
import { fetchSaudiIndex, fetchSaudiQuotes, type SaudiIndexQuote } from '@/lib/tradingview-scanner';

export type SaudiBoardPayload = SaudiBoard & {
    index: SaudiIndexQuote | null;
    /** Epoch ms the prices were read. The page prints it, because the feed is 15 minutes behind. */
    asOf: number;
    /** True when the live read failed and this is the last board we could store. */
    stale?: boolean;
};

/** The main market only: Nomu sits on its own board and would skew every ranking. */
export const MAIN_MARKET_SYMBOLS = SAUDI_SYMBOLS.filter((entry) => !isNomuSymbol(entry.symbol)).map((entry) => entry.symbol);

const SNAPSHOT_KEY = 'sa';

/** The last board we managed to store, or null when there is none (first ever visit, or no database). */
async function readSnapshot(): Promise<SaudiBoardPayload | null> {
    try {
        await connectToDatabase();
        const row = await SaudiBoardSnapshotModel.findOne({ key: SNAPSHOT_KEY }).lean();
        if (!row?.payload) return null;
        const payload = row.payload as SaudiBoardPayload;
        // A snapshot with no prices is not a board; keep looking rather than showing an empty grid.
        if (!Array.isArray(payload.gainers) || payload.total === 0) return null;
        return { ...payload, asOf: new Date(row.updatedAt).getTime(), stale: true };
    } catch (error) {
        console.error('Saudi board snapshot read failed', error);
        return null;
    }
}

async function writeSnapshot(payload: SaudiBoardPayload): Promise<void> {
    try {
        await connectToDatabase();
        const { stale: _stale, ...rest } = payload;
        await SaudiBoardSnapshotModel.updateOne(
            { key: SNAPSHOT_KEY },
            { $set: { payload: rest, updatedAt: new Date() } },
            { upsert: true },
        );
    } catch (error) {
        // A failed write must never cost the reader the board they can already see.
        console.error('Saudi board snapshot write failed', error);
    }
}

/**
 * One pass over the main market plus the index. Two scanner calls in total, cached for a minute,
 * so the page can poll through a session without becoming traffic — and if the scanner refuses,
 * the last stored board comes back marked stale instead of an empty page.
 */
export async function loadSaudiBoard(limit = 6): Promise<SaudiBoardPayload> {
    const [quotes, index] = await Promise.all([fetchSaudiQuotes(MAIN_MARKET_SYMBOLS), fetchSaudiIndex()]);
    const board = buildSaudiBoard(Object.values(quotes), limit);

    if (board.total > 0) {
        const payload: SaudiBoardPayload = { ...board, index, asOf: Date.now() };
        void writeSnapshot(payload);
        return payload;
    }

    const snapshot = await readSnapshot();
    if (snapshot) return { ...snapshot, index: index ?? snapshot.index };
    // Nothing live and nothing stored: say so with an empty board rather than pretending.
    return { ...board, index, asOf: Date.now() };
}

import { connectToDatabase } from '@/database/mongoose';
import { SaudiBoardSnapshotModel } from '@/database/models/saudi-board.model';
import {
    MARKET_SECTIONS,
    WORLD_TICKERS,
    sectionQuotes,
    worldQuoteFromRow,
    type MarketSection,
    type WorldQuote,
} from '@/lib/market-sections';
import { scanRows } from '@/lib/tradingview-scanner';

/** One section with what the feed answered for it, in the order the section declares. */
export type SectionBoard = {
    section: MarketSection;
    quotes: WorldQuote[];
};

export type WorldBoardPayload = {
    sections: SectionBoard[];
    /** Epoch ms the prices were read. The page prints it, because the feed is fifteen minutes late. */
    asOf: number;
    /** True when the live read failed and this is the last board we could store. */
    stale?: boolean;
};

/** The columns the board asks for: enough to price a row and nothing more. */
const COLUMNS = ['close', 'change', 'change_abs', 'description'];

const SNAPSHOT_KEY = 'world';

const build = (quotes: readonly WorldQuote[]): SectionBoard[] =>
    MARKET_SECTIONS.map((section) => ({ section, quotes: sectionQuotes(section, quotes) }));

/** Whether anything answered: a board of empty sections is not worth storing or showing. */
const empty = (sections: readonly SectionBoard[]): boolean =>
    sections.every((entry) => entry.quotes.length === 0);

async function readSnapshot(): Promise<WorldBoardPayload | null> {
    try {
        await connectToDatabase();
        const row = await SaudiBoardSnapshotModel.findOne({ key: SNAPSHOT_KEY }).lean();
        if (!row?.payload) return null;
        const payload = row.payload as WorldBoardPayload;
        if (empty(payload.sections ?? [])) return null;
        return { ...payload, asOf: new Date(row.updatedAt).getTime(), stale: true };
    } catch (error) {
        console.error('World board snapshot read failed', error);
        return null;
    }
}

async function writeSnapshot(payload: WorldBoardPayload): Promise<void> {
    try {
        await connectToDatabase();
        // Stored without the flag: what is written is the board itself, and every read marks it.
        const rest: WorldBoardPayload = { ...payload };
        delete rest.stale;
        await SaudiBoardSnapshotModel.updateOne(
            { key: SNAPSHOT_KEY },
            { $set: { payload: rest, updatedAt: new Date() } },
            { upsert: true },
        );
    } catch (error) {
        // A failed write must never cost the reader the board they can already see.
        console.error('World board snapshot write failed', error);
    }
}

/**
 * The whole board in one request: every ticker lives on the same endpoint, so thirty instruments
 * cost the same as one, and a minute of caching on top means a page left open polls without turning
 * into traffic. If the scanner refuses, the last stored board comes back marked stale — a market
 * page that says how old it is beats a blank one.
 */
export async function loadWorldBoard(): Promise<WorldBoardPayload> {
    const rows = await scanRows([...WORLD_TICKERS], COLUMNS, 60);
    const quotes = rows.map(worldQuoteFromRow).filter((quote): quote is WorldQuote => quote !== null);
    const sections = build(quotes);

    if (!empty(sections)) {
        const payload: WorldBoardPayload = { sections, asOf: Date.now() };
        void writeSnapshot(payload);
        return payload;
    }

    const snapshot = await readSnapshot();
    if (snapshot) return snapshot;
    // Nothing live and nothing stored: say so with the empty shell rather than pretending.
    return { sections, asOf: Date.now() };
}

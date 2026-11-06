// The trade ledger: every buy and sell, and the arithmetic that turns them into positions and
// realised profit. Pure and IO-free, like lib/portfolio.ts, so the page, the server action and the
// tests all agree on what a trade means.
//
// Cost basis is FIFO — the oldest shares are sold first. That is the convention Tadawul brokers and
// most retail portfolios report, and it is the only one that can be explained in a single sentence
// when a user asks why their realised number differs from a broker's average-cost figure.

export type TradeSide = 'buy' | 'sell';

export type Trade = {
    /** Stable id when the trade came from the database; absent for a freshly parsed CSV row. */
    id?: string;
    symbol: string;
    company?: string;
    side: TradeSide;
    quantity: number;
    /** Price per share, in the quote's own currency. */
    price: number;
    /** Commission for the whole trade, not per share. */
    fee?: number;
    /** ISO timestamp. Trades are matched oldest-first. */
    tradedAt: string;
    note?: string;
};

export type LedgerPosition = {
    symbol: string;
    company: string;
    quantity: number;
    /** Remaining FIFO cost divided by the remaining quantity. */
    averageCost: number;
    costBasis: number;
    /** Realised profit on this symbol across every closed lot. */
    realizedPnl: number;
    /** How many trades touched this symbol. */
    trades: number;
};

export type RealizedSale = {
    symbol: string;
    company: string;
    quantity: number;
    /** What the shares sold for, after the sell fee. */
    proceeds: number;
    /** What those same shares cost when bought, including their share of the buy fee. */
    cost: number;
    pnl: number;
    pnlPercent: number;
    tradedAt: string;
};

export type LedgerResult = {
    positions: LedgerPosition[];
    sales: RealizedSale[];
    totalRealized: number;
    /** Trades that could not be applied, with a human-readable reason. */
    warnings: string[];
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** A trade is usable when it has a symbol, a side, a positive quantity and a non-negative price. */
export function isUsableTrade(trade: Trade): boolean {
    return (
        typeof trade.symbol === 'string' &&
        trade.symbol.trim() !== '' &&
        (trade.side === 'buy' || trade.side === 'sell') &&
        Number.isFinite(trade.quantity) &&
        trade.quantity > 0 &&
        Number.isFinite(trade.price) &&
        trade.price >= 0 &&
        !Number.isNaN(Date.parse(trade.tradedAt))
    );
}

type Lot = { quantity: number; unitCost: number };

/**
 * Replays trades oldest-first and returns open positions plus every realised sale.
 *
 * A sell larger than the shares held is not silently turned into a short: the excess is dropped and
 * a warning names the symbol, because a negative position would poison every total on the page.
 */
export function buildLedger(trades: Trade[]): LedgerResult {
    const ordered = [...trades]
        .filter(isUsableTrade)
        .sort((a, b) => {
            const byTime = Date.parse(a.tradedAt) - Date.parse(b.tradedAt);
            if (byTime !== 0) return byTime;
            return (a.id ?? '').localeCompare(b.id ?? '');
        });

    const lots = new Map<string, Lot[]>();
    const companies = new Map<string, string>();
    const counts = new Map<string, number>();
    const realized = new Map<string, number>();
    const sales: RealizedSale[] = [];
    const warnings: string[] = [];

    for (const trade of ordered) {
        const symbol = trade.symbol.trim().toUpperCase();
        const company = (trade.company ?? '').trim() || symbol;
        companies.set(symbol, company);
        counts.set(symbol, (counts.get(symbol) ?? 0) + 1);

        const quantity = finite(trade.quantity);
        const price = finite(trade.price);
        const fee = Math.max(0, finite(trade.fee));
        const book = lots.get(symbol) ?? [];

        if (trade.side === 'buy') {
            // The fee is spread over the shares so a partial sale carries its fair share of it.
            const unitCost = price + (quantity > 0 ? fee / quantity : 0);
            book.push({ quantity, unitCost });
            lots.set(symbol, book);
            continue;
        }

        let remaining = quantity;
        let cost = 0;
        while (remaining > 0 && book.length > 0) {
            const lot = book[0];
            const take = Math.min(remaining, lot.quantity);
            cost += take * lot.unitCost;
            lot.quantity -= take;
            remaining -= take;
            if (lot.quantity <= 1e-9) book.shift();
        }

        if (remaining > 1e-9) {
            warnings.push(`${symbol}: sold ${round2(remaining)} more than held`);
        }

        const sold = quantity - remaining;
        if (sold <= 0) continue;

        const proceeds = sold * price - (quantity > 0 ? (fee * sold) / quantity : 0);
        const pnl = proceeds - cost;
        realized.set(symbol, (realized.get(symbol) ?? 0) + pnl);
        sales.push({
            symbol,
            company,
            quantity: round2(sold),
            proceeds: round2(proceeds),
            cost: round2(cost),
            pnl: round2(pnl),
            pnlPercent: cost > 0 ? round2((pnl / cost) * 100) : 0,
            tradedAt: trade.tradedAt,
        });
    }

    const positions: LedgerPosition[] = [];
    for (const [symbol, book] of lots) {
        const quantity = book.reduce((sum, lot) => sum + lot.quantity, 0);
        if (quantity <= 1e-9) continue;
        const costBasis = book.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0);
        positions.push({
            symbol,
            company: companies.get(symbol) ?? symbol,
            quantity: round2(quantity),
            averageCost: round2(costBasis / quantity),
            costBasis: round2(costBasis),
            realizedPnl: round2(realized.get(symbol) ?? 0),
            trades: counts.get(symbol) ?? 0,
        });
    }

    positions.sort((a, b) => b.costBasis - a.costBasis);
    sales.sort((a, b) => Date.parse(b.tradedAt) - Date.parse(a.tradedAt));

    return {
        positions,
        sales,
        totalRealized: round2(sales.reduce((sum, sale) => sum + sale.pnl, 0)),
        warnings,
    };
}

/** Realised profit per symbol, for the summary strip. */
export function realizedBySymbol(sales: RealizedSale[]): { symbol: string; pnl: number; count: number }[] {
    const map = new Map<string, { symbol: string; pnl: number; count: number }>();
    for (const sale of sales) {
        const entry = map.get(sale.symbol) ?? { symbol: sale.symbol, pnl: 0, count: 0 };
        entry.pnl = round2(entry.pnl + sale.pnl);
        entry.count += 1;
        map.set(sale.symbol, entry);
    }
    return [...map.values()].sort((a, b) => b.pnl - a.pnl);
}

// -- CSV ---------------------------------------------------------------------------------------
//
// The import format is deliberately boring: a header row, then one trade per line. Header names are
// matched case-insensitively and a few common aliases are accepted, because a broker export is
// never going to use our exact spelling.

const HEADER_ALIASES: Record<string, keyof Trade | 'date'> = {
    symbol: 'symbol',
    ticker: 'symbol',
    code: 'symbol',
    side: 'side',
    type: 'side',
    action: 'side',
    buy_sell: 'side',
    quantity: 'quantity',
    qty: 'quantity',
    shares: 'quantity',
    price: 'price',
    cost: 'price',
    fee: 'fee',
    commission: 'fee',
    date: 'date',
    tradedat: 'date',
    traded_at: 'date',
    time: 'date',
    company: 'company',
    name: 'company',
    note: 'note',
    notes: 'note',
};

const csvCell = (value: string | number): string => {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Splits one CSV line, honouring quoted cells and doubled quotes. */
function splitCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted) {
            if (char === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i += 1;
                } else {
                    quoted = false;
                }
            } else {
                current += char;
            }
            continue;
        }
        if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            cells.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
}

const normaliseHeader = (value: string): string => value.trim().toLowerCase().replace(/[\s-]+/g, '_');

/** Accepts ISO dates, `YYYY-MM-DD`, and `DD/MM/YYYY` (the order Tadawul statements use). */
export function parseTradeDate(raw: string): string | null {
    const text = raw.trim();
    if (!text) return null;
    const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
    if (dmy) {
        const [, day, month, year] = dmy;
        const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export type CsvParseResult = {
    trades: Trade[];
    errors: { line: number; message: string }[];
};

/**
 * Parses a trade CSV. A missing header is tolerated when the columns are in the canonical order
 * (symbol, side, quantity, price, fee, date, note), so a hand-written file still imports.
 */
export function parseTradesCsv(text: string): CsvParseResult {
    const lines = text
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '');
    const errors: { line: number; message: string }[] = [];
    if (lines.length === 0) return { trades: [], errors: [{ line: 0, message: 'empty' }] };

    const first = splitCsvLine(lines[0]).map(normaliseHeader);
    const hasHeader = first.some((cell) => cell in HEADER_ALIASES);
    // A headerless file is only assumed when its first row actually looks like a trade; otherwise
    // the file is some other CSV and saying "missing columns" is more useful than "bad side".
    const firstCells = splitCsvLine(lines[0]);
    const looksLikeTrade = ['buy', 'sell', 'b', 's', 'شراء', 'بيع'].includes((firstCells[1] ?? '').toLowerCase());
    if (!hasHeader && !looksLikeTrade) {
        return { trades: [], errors: [{ line: 1, message: 'missingColumns' }] };
    }
    const columns: (keyof Trade | 'date' | null)[] = hasHeader
        ? first.map((cell) => HEADER_ALIASES[cell] ?? null)
        : ['symbol', 'side', 'quantity', 'price', 'fee', 'date', 'note'];

    const indexOf = (key: keyof Trade | 'date'): number => columns.indexOf(key);
    const symbolAt = indexOf('symbol');
    const sideAt = indexOf('side');
    const quantityAt = indexOf('quantity');
    const priceAt = indexOf('price');
    if (symbolAt < 0 || sideAt < 0 || quantityAt < 0 || priceAt < 0) {
        return { trades: [], errors: [{ line: 1, message: 'missingColumns' }] };
    }

    const trades: Trade[] = [];
    const start = hasHeader ? 1 : 0;
    for (let i = start; i < lines.length; i += 1) {
        const cells = splitCsvLine(lines[i]);
        const lineNumber = i + 1;
        const symbol = (cells[symbolAt] ?? '').toUpperCase();
        const sideRaw = (cells[sideAt] ?? '').toLowerCase();
        const side: TradeSide | null =
            sideRaw === 'buy' || sideRaw === 'b' || sideRaw === 'شراء'
                ? 'buy'
                : sideRaw === 'sell' || sideRaw === 's' || sideRaw === 'بيع'
                  ? 'sell'
                  : null;
        const quantity = Number(cells[quantityAt]);
        const price = Number(cells[priceAt]);
        const feeAt = indexOf('fee');
        const fee = feeAt >= 0 ? Number(cells[feeAt] || 0) : 0;
        const dateAt = indexOf('date');
        const tradedAt = dateAt >= 0 ? parseTradeDate(cells[dateAt] ?? '') : new Date().toISOString();
        const companyAt = indexOf('company');
        const noteAt = indexOf('note');

        if (!symbol) {
            errors.push({ line: lineNumber, message: 'missingSymbol' });
            continue;
        }
        if (!side) {
            errors.push({ line: lineNumber, message: 'badSide' });
            continue;
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
            errors.push({ line: lineNumber, message: 'badQuantity' });
            continue;
        }
        if (!Number.isFinite(price) || price < 0) {
            errors.push({ line: lineNumber, message: 'badPrice' });
            continue;
        }
        if (!tradedAt) {
            errors.push({ line: lineNumber, message: 'badDate' });
            continue;
        }

        trades.push({
            symbol,
            side,
            quantity,
            price,
            fee: Number.isFinite(fee) && fee > 0 ? fee : 0,
            tradedAt,
            company: companyAt >= 0 ? (cells[companyAt] ?? '').slice(0, 120) : undefined,
            note: noteAt >= 0 ? (cells[noteAt] ?? '').slice(0, 200) : undefined,
        });
    }

    return { trades, errors };
}

export function tradesToCsv(trades: Trade[]): string {
    const header = ['Symbol', 'Side', 'Quantity', 'Price', 'Fee', 'Date', 'Company', 'Note'];
    const lines = trades.map((trade) =>
        [
            trade.symbol,
            trade.side,
            trade.quantity,
            trade.price,
            trade.fee ?? 0,
            trade.tradedAt.slice(0, 10),
            trade.company ?? '',
            trade.note ?? '',
        ]
            .map(csvCell)
            .join(',')
    );
    return [header.join(','), ...lines].join('\n');
}

// -- Merging with manual positions -------------------------------------------------------------

export type MergedPosition = {
    symbol: string;
    company: string;
    quantity: number;
    averageCost: number;
    /** Where the quantity came from: a replayed ledger, or a hand-entered snapshot. */
    source: 'ledger' | 'manual';
    realizedPnl: number;
};

/**
 * Combines hand-entered positions with ledger-derived ones. A symbol that appears in the ledger is
 * taken from the ledger only — otherwise a user who imported their history would see their shares
 * counted twice. Manual positions for symbols the ledger never touched are kept as they are.
 */
export function mergePositions(
    manual: { symbol: string; company: string; quantity: number; averageCost: number }[],
    ledger: LedgerPosition[]
): MergedPosition[] {
    const bySymbol = new Map<string, MergedPosition>();

    for (const position of manual) {
        const symbol = position.symbol.trim().toUpperCase();
        if (!symbol) continue;
        bySymbol.set(symbol, {
            symbol,
            company: position.company || symbol,
            quantity: position.quantity,
            averageCost: position.averageCost,
            source: 'manual',
            realizedPnl: 0,
        });
    }

    for (const position of ledger) {
        bySymbol.set(position.symbol, {
            symbol: position.symbol,
            company: position.company || position.symbol,
            quantity: position.quantity,
            averageCost: position.averageCost,
            source: 'ledger',
            realizedPnl: position.realizedPnl,
        });
    }

    return [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * Total return on capital put to work: open profit plus realised profit, over the cost of the open
 * lots plus the cost of the lots already sold. A closed trade's capital is counted once, not twice.
 */
export function totalReturnPercent(input: {
    unrealizedPnl: number;
    realizedPnl: number;
    openCostBasis: number;
    realizedCostBasis: number;
}): number {
    const invested = input.openCostBasis + input.realizedCostBasis;
    if (!Number.isFinite(invested) || invested <= 0) return 0;
    return round2(((input.unrealizedPnl + input.realizedPnl) / invested) * 100);
}

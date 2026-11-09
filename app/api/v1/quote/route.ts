import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/guard';
import { apiError, parseSymbols } from '@/lib/api/request';
import { serializeQuote } from '@/lib/api/serialize';
import { getLiveQuotes } from '@/lib/actions/finnhub.actions';
import { getYahooQuotes } from '@/lib/actions/yahoo.actions';
import { hasFinnhubQuotes } from '@/lib/market/markets';
import { isSaudiQuote } from '@/lib/market/data';

// GET /api/v1/quote?symbol=AAPL
// GET /api/v1/quote?symbols=AAPL,2222.SR,BINANCE:BTCUSDT
// One quota unit per symbol, because an unseen ticker is one upstream request.

export const dynamic = 'force-dynamic';

const MAX_SYMBOLS = 25;

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const symbols = parseSymbols(params.get('symbols') ?? params.get('symbol'), MAX_SYMBOLS);
    if (symbols.length === 0) {
        return apiError(400, 'invalid_symbol', `Pass up to ${MAX_SYMBOLS} symbols, e.g. symbol=AAPL.`);
    }

    const auth = await authenticate(request, { cost: symbols.length });
    if (auth.response) return auth.response;

    // Tadawul listings are priced from Yahoo (no key); everything else from Finnhub.
    const saudi = symbols.filter(isSaudiQuote);
    const finnhub = symbols.filter((symbol) => !isSaudiQuote(symbol) && hasFinnhubQuotes(symbol));

    const [finnhubQuotes, yahooQuotes] = await Promise.all([
        finnhub.length ? getLiveQuotes(finnhub) : Promise.resolve<Record<string, { c?: number } | null>>({}),
        saudi.length ? getYahooQuotes(saudi) : Promise.resolve({}),
    ]);

    const quotes = Object.fromEntries(
        symbols.map((symbol) => {
            const quote = (yahooQuotes as Record<string, { c?: number } | null>)[symbol]
                ?? (finnhubQuotes as Record<string, { c?: number } | null>)[symbol];
            return [symbol, quote && Number.isFinite(quote.c) ? serializeQuote(quote as never) : null];
        }),
    );

    return NextResponse.json(
        { quotes },
        { headers: { ...auth.context.headers, 'Cache-Control': 'no-store' } },
    );
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/guard';
import { apiError, parseInteger, parseInterval, parseSymbol } from '@/lib/api/request';
import { serializeCandles } from '@/lib/api/serialize';
import { getSymbolCandles } from '@/lib/actions/yahoo-candles.actions';

// GET /api/v1/candles?symbol=2222.SR&interval=1d&limit=500
// The bars the chart draws, in the same units (seconds), from the same source.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = await authenticate(request);
    if (auth.response) return auth.response;

    const params = request.nextUrl.searchParams;
    const symbol = parseSymbol(params.get('symbol'));
    if (!symbol) {
        return apiError(400, 'invalid_symbol', 'Pass one symbol, e.g. symbol=AAPL or symbol=2222.SR.', auth.context.headers);
    }

    const interval = parseInterval(params.get('interval'));
    const limit = parseInteger(params.get('limit'), 0, 0, 5000);

    const set = await getSymbolCandles(symbol, interval);
    if (!set) {
        return apiError(404, 'not_found', `No candles for ${symbol} on ${interval}.`, auth.context.headers);
    }

    return NextResponse.json(
        { symbol, interval, ...serializeCandles(set, limit) },
        { headers: { ...auth.context.headers, 'Cache-Control': 'no-store' } },
    );
}

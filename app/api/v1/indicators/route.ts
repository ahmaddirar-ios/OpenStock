import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/guard';
import { apiError, parseInteger, parseInterval, parseNumber, parseSymbol } from '@/lib/api/request';
import { computeIndicator, isApiIndicator, minimumBars, type IndicatorSpec } from '@/lib/api/indicators';
import { getSymbolCandles } from '@/lib/actions/yahoo-candles.actions';

// GET /api/v1/indicators?symbol=AAPL&interval=1d&indicator=rsi&period=14&limit=100
// One study over the same bars /candles returns. The maths is the chart's own, so the numbers match
// the pane a customer is looking at.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = await authenticate(request);
    if (auth.response) return auth.response;

    const params = request.nextUrl.searchParams;
    const symbol = parseSymbol(params.get('symbol'));
    if (!symbol) {
        return apiError(400, 'invalid_symbol', 'Pass one symbol, e.g. symbol=AAPL.', auth.context.headers);
    }

    const indicator = params.get('indicator') ?? 'rsi';
    if (!isApiIndicator(indicator)) {
        return apiError(400, 'invalid_param', 'indicator must be one of sma, ema, rsi, macd, bollinger, atr, adx, obv, vwap.', auth.context.headers);
    }

    const interval = parseInterval(params.get('interval'));
    const spec: IndicatorSpec = {
        indicator,
        period: parseInteger(params.get('period'), 14, 2, 500),
        fast: parseInteger(params.get('fast'), 12, 2, 500),
        slow: parseInteger(params.get('slow'), 26, 3, 1000),
        signal: parseInteger(params.get('signal'), 9, 2, 500),
        stdDev: parseNumber(params.get('stdDev'), 2, 0.1, 10),
    };
    const limit = parseInteger(params.get('limit'), 0, 0, 5000);

    const set = await getSymbolCandles(symbol, interval);
    if (!set || set.candles.length === 0) {
        return apiError(404, 'not_found', `No candles for ${symbol} on ${interval}.`, auth.context.headers);
    }

    const needed = minimumBars(spec);
    if (set.candles.length < needed) {
        return apiError(
            422,
            'upstream_error',
            `Not enough history for ${indicator}: need ${needed} bars, have ${set.candles.length}. Try a longer range or a smaller period.`,
            auth.context.headers,
        );
    }

    const result = computeIndicator(set.candles, spec);
    const points = limit > 0 ? result.points.slice(-limit) : result.points;

    return NextResponse.json(
        { symbol, interval, ...result, points },
        { headers: { ...auth.context.headers, 'Cache-Control': 'no-store' } },
    );
}

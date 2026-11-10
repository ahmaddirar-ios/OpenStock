import { NextResponse } from 'next/server';
import { DEFAULT_CANDLE_INTERVAL, isCandleIntervalId } from '@/lib/market/yahoo-candles';

// Parsing and the error envelope for /api/v1. Every refusal has the same shape so a customer's
// client can branch on `error.code` instead of guessing from prose.

export const SYMBOL_PATTERN = /^[A-Z0-9^][A-Z0-9.&:=-]{0,24}$/;

export type ApiErrorCode =
    | 'unauthorized'
    | 'invalid_key'
    | 'revoked_key'
    | 'expired_key'
    | 'plan_required'
    | 'rate_limited'
    | 'invalid_symbol'
    | 'invalid_interval'
    | 'invalid_param'
    | 'not_found'
    | 'upstream_error';

export const apiError = (
    status: number,
    code: ApiErrorCode,
    message: string,
    headers?: HeadersInit,
): NextResponse => NextResponse.json({ error: { code, message } }, { status, headers });

/** A symbol in the form the rest of the app speaks: upper case, no whitespace. */
export const parseSymbol = (raw: string | null | undefined): string | null => {
    const symbol = String(raw ?? '').trim().toUpperCase();
    return SYMBOL_PATTERN.test(symbol) ? symbol : null;
};

/** One or many symbols, deduplicated and capped. Accepts `symbol` or `symbols`. */
export const parseSymbols = (raw: string | null | undefined, max: number): string[] =>
    [...new Set(
        String(raw ?? '')
            .split(',')
            .map((value) => parseSymbol(value))
            .filter((value): value is string => value !== null),
    )].slice(0, max);

export const parseInterval = (raw: string | null | undefined): string =>
    raw && isCandleIntervalId(raw) ? raw : DEFAULT_CANDLE_INTERVAL;

/** An integer inside a range, or the fallback. `0` is accepted when `min` is `0`. */
export const parseInteger = (
    raw: string | null | undefined,
    fallback: number,
    min: number,
    max: number,
): number => {
    if (raw == null || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || !Number.isInteger(value)) return fallback;
    return Math.min(max, Math.max(min, value));
};

export const parseNumber = (
    raw: string | null | undefined,
    fallback: number,
    min: number,
    max: number,
): number => {
    if (raw == null || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
};

/** The shared rate-limit headers, so a route never forgets one of the three. */
export const rateLimitHeaders = (state: { limit: number; remaining: number; resetAt: Date }): Record<string, string> => ({
    'RateLimit-Limit': String(state.limit),
    'RateLimit-Remaining': String(state.remaining),
    'RateLimit-Reset': String(Math.max(0, Math.ceil((state.resetAt.getTime() - Date.now()) / 1000))),
});

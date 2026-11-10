import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/better-auth/auth";
import { getLiveQuotes } from "@/lib/actions/finnhub.actions";
import { getYahooQuotes } from "@/lib/actions/yahoo.actions";
import { isRateLimited } from "@/lib/rate-limit";
import { hasFinnhubQuotes } from "@/lib/market/markets";
import { isSaudiQuote } from "@/lib/market/data";

const MAX_SYMBOLS = 25;
const SYMBOL_PATTERN = /^[A-Z0-9.:\-]{1,20}$/;

// Polled by on-screen prices. Signed-in only and capped, so nobody can burn the shared Finnhub quota.
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const symbols = [...new Set(
        (req.nextUrl.searchParams.get("symbols") ?? "")
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter((s) => SYMBOL_PATTERN.test(s)),
    )].slice(0, MAX_SYMBOLS);

    // Tadawul listings are priced from Yahoo (no key, no quota); everything else from Finnhub.
    const saudi = symbols.filter(isSaudiQuote);
    const finnhub = symbols.filter((s) => !isSaudiQuote(s) && hasFinnhubQuotes(s));

    // Counted per symbol: unseen tickers each cost a Finnhub call. A 25-symbol watchlist polled every 15 s uses
    // about 100 a minute; the cap stops one free account from draining the shared key pool.
    if (finnhub.length > 0 && await isRateLimited(`quotes:user:${session.user.id}`, 300, 60, finnhub.length)) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const [finnhubQuotes, yahooQuotes] = await Promise.all([
        finnhub.length ? getLiveQuotes(finnhub) : Promise.resolve<Record<string, unknown>>({}),
        saudi.length ? getYahooQuotes(saudi) : Promise.resolve<Record<string, unknown>>({}),
    ]);

    return NextResponse.json(
        Object.fromEntries(symbols.map((s) => [s, (yahooQuotes as Record<string, unknown>)[s] ?? (finnhubQuotes as Record<string, unknown>)[s] ?? null])),
        { headers: { "Cache-Control": "private, max-age=5" } },
    );
}

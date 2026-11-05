// What the quote header above the chart needs to know: the last price, how today compares with the
// previous session, and whether the market it belongs to is open. Pure, so the header's numbers can
// be wrong only in one tested place.
import type { Candle } from '@/lib/yahoo-candles';

const DAY = 86_400;
/** Riyadh is UTC+3 all year: no daylight saving, so a fixed offset is correct, not lazy. */
const RIYADH_OFFSET = 3 * 3600;

export type MarketClock = 'riyadh' | 'utc';

/** Which session a bar belongs to, in the market's own clock. */
export function sessionDay(time: number, clock: MarketClock): number {
    return Math.floor((time + (clock === 'riyadh' ? RIYADH_OFFSET : 0)) / DAY);
}

/**
 * The close of the last bar from an *earlier* session — what today is measured against. Intraday
 * sets carry several sessions, so this walks back to the first day boundary; daily sets answer on
 * their second-to-last bar. Null when the set holds one session only, because there is no honest
 * change to print yet.
 */
export function previousSessionClose(candles: readonly Candle[], clock: MarketClock): number | null {
    const last = candles.at(-1);
    if (!last) return null;
    const today = sessionDay(last.time, clock);
    for (let index = candles.length - 2; index >= 0; index -= 1) {
        if (sessionDay(candles[index].time, clock) < today) return candles[index].close;
    }
    return null;
}

/** The change from the previous session's close, in percent. */
export function sessionChange(
    candles: readonly Candle[],
    clock: MarketClock,
    /** The feed's stated close for the previous session, when it sent one. */
    previousClose?: number,
): number | null {
    const last = candles.at(-1);
    // A stated close outranks a discovered one: the bars can be short of a session (yesterday's
    // intraday series often stops before its own close), and the exchange's number is the truth.
    const previous =
        Number.isFinite(previousClose) && (previousClose as number) > 0
            ? (previousClose as number)
            : previousSessionClose(candles, clock);
    if (!last || previous == null || !Number.isFinite(previous) || previous <= 0) return null;
    return ((last.close - previous) / previous) * 100;
}

export type TadawulPhase = 'pre' | 'open' | 'after' | 'closed';

/** Tadawul's clock, in Riyadh minutes: Sunday–Thursday, pre-open 09:30, session 10:00–15:00, closing auction to 15:20. */
export const TADAWUL_PRE = 9 * 60 + 30;
export const TADAWUL_OPEN = 10 * 60;
export const TADAWUL_CLOSE = 15 * 60;
export const TADAWUL_AUCTION_END = 15 * 60 + 20;

export function riyadhNow(date: Date): { weekday: number; minutes: number } {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Riyadh',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(date)
            .map((part) => [part.type, part.value]),
    );
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    return { weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Friday and Saturday are the weekend; everything else follows the session clock. */
export function tadawulPhase(weekday: number, minutes: number): TadawulPhase {
    if (weekday < 0 || weekday > 4) return 'closed';
    if (minutes >= TADAWUL_OPEN && minutes < TADAWUL_CLOSE) return 'open';
    if (minutes >= TADAWUL_CLOSE && minutes < TADAWUL_AUCTION_END) return 'after';
    if (minutes >= TADAWUL_PRE && minutes < TADAWUL_OPEN) return 'pre';
    return 'closed';
}

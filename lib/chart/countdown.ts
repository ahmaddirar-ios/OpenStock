// The clock under the newest bar: how long is left before the interval closes. Pure arithmetic, so
// the bar spans and the "closed or not trading" decision are pinned by tests instead of by a clock.

/** The intraday intervals that close on a clock, in seconds. Daily and above do not count down. */
export const BAR_SECONDS: Record<string, number> = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '60m': 3600,
    '2h': 7200,
    '4h': 14400,
};

/**
 * Seconds until the newest bar closes, or null when there is nothing honest to show: a daily or
 * weekly interval, a market that is shut (the bar's close is already in the past), or a bar whose
 * clock is more than one span behind — the feed is delayed, so a stale series must not count down
 * into a bar that has not started.
 */
export function secondsToBarClose(lastTime: number, intervalId: string, now: number): number | null {
    const span = BAR_SECONDS[intervalId];
    if (!span) return null;
    const left = lastTime + span - now;
    if (left <= 0 || left > span) return null;
    return left;
}

/** mm:ss, with the minutes allowed to run past 59 for the multi-hour intervals. */
export function formatCountdown(seconds: number): string {
    const total = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

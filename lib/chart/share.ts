// "Look at this" in one link: the symbol, the interval, the chart type and the studies on screen.
//
// The drawings are deliberately not in the link. They belong to the account and to the browser that
// drew them, and a link that pasted someone else's levels onto a chart would be a surprise, not a
// favour — the transfer box in the chart toolbar exists for exactly that hand-off.
//
// The token is base64url of a small JSON object, so a link stays a link: no server, no row in the
// database, and nothing to clean up when it gets forwarded.

import { CANDLE_INTERVALS } from '@/lib/market/yahoo-candles';
import { CHART_TYPES, type ChartType } from '@/lib/chart/view';
import { parseStudies, type StudyConfig } from '@/lib/chart/studies';

export type ChartShare = {
    symbol: string;
    interval: string;
    chartType: ChartType;
    studies: StudyConfig[];
};

const SHARE_VERSION = 1;
const MAX_TOKEN = 6000;

const SYMBOL = /^[A-Z0-9.:\-]{1,20}$/;
const INTERVAL_IDS = new Set<string>(CANDLE_INTERVALS.map((interval) => interval.id));
const CHART_TYPE_IDS = new Set<string>(CHART_TYPES);

const base64url = (text: string): string =>
    // btoa is latin1-only; every non-ASCII here is already escaped by encodeURIComponent.
    btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64url = (token: string): string =>
    decodeURIComponent(escape(atob(token.replace(/-/g, '+').replace(/_/g, '/'))));

/** The token for a link, trimmed to the studies that survive the parser (so it decodes to itself). */
export function encodeChartShare(share: ChartShare): string {
    const payload = {
        v: SHARE_VERSION,
        s: share.symbol.toUpperCase(),
        i: share.interval,
        t: share.chartType,
        st: parseStudies(share.studies),
    };
    return base64url(JSON.stringify(payload));
}

/** A token back into a share, or null when any part of it is not something the chart can draw. */
export function decodeChartShare(token: string | null | undefined): ChartShare | null {
    if (!token || token.length > MAX_TOKEN) return null;
    try {
        const parsed: unknown = JSON.parse(fromBase64url(token));
        if (typeof parsed !== 'object' || parsed === null) return null;
        const value = parsed as Record<string, unknown>;
        if (value.v !== SHARE_VERSION) return null;
        const symbol = typeof value.s === 'string' ? value.s.trim().toUpperCase() : '';
        if (!SYMBOL.test(symbol)) return null;
        const interval = typeof value.i === 'string' && INTERVAL_IDS.has(value.i) ? value.i : null;
        const chartType = typeof value.t === 'string' && CHART_TYPE_IDS.has(value.t) ? (value.t as ChartType) : null;
        if (!interval || !chartType) return null;
        return { symbol, interval, chartType, studies: parseStudies(value.st) };
    } catch {
        return null;
    }
}

/** The page a shared chart opens on. Kept relative so it works on any host. */
export const sharePath = (share: ChartShare): string =>
    `/stocks/${encodeURIComponent(share.symbol)}?c=${encodeChartShare(share)}`;

// The wording and the file name of a printed chart, kept apart from the browser so the layout a
// trader puts on paper is pinned by tests rather than by whatever the printer dialog does.
//
// Dates are UTC and unambiguous on purpose: a print is a record, and "6 Oct" in a Riyadh office and
// "6 Oct" in New York are different bars.

export type PrintMeta = {
    symbol: string;
    interval: string;
    /** First and last bar on the chart, in seconds. */
    from?: number;
    to?: number;
    printedAt: Date;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number): string => String(value).padStart(2, '0');

/** One bar's day, in UTC, as the page reads it: 6 Oct 2026. */
export function printDay(seconds: number): string {
    const at = new Date(seconds * 1000);
    const day = at.getUTCDate();
    const month = MONTHS[at.getUTCMonth()];
    return `${day} ${month} ${at.getUTCFullYear()}`;
}

/** The document title, which is what a browser offers as the PDF's file name. */
export function printDocumentTitle(meta: PrintMeta): string {
    const at = meta.printedAt;
    return `rovex-${meta.symbol.replace(/[^A-Za-z0-9]/g, '')}-${meta.interval}-${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

/**
 * The span the chart covers. A one-day chart names the day once; a longer one names both ends,
 * joined by an arrow so the direction reads without a legend.
 */
export function printRange(from?: number, to?: number): string | null {
    if (from == null || to == null) return null;
    const first = printDay(from);
    const last = printDay(to);
    return first === last ? first : `${first} → ${last}`;
}

/**
 * The session move, with the sign spelled out. The chart's own quote carries the percent rather than
 * a second absolute figure, and a print is no place to derive a number the feed never sent.
 */
export function printChange(percent?: number | null): string {
    if (percent == null || !Number.isFinite(percent)) return '—';
    const body = `${Math.abs(percent).toFixed(2)}%`;
    if (percent > 0) return `+${body}`;
    if (percent < 0) return `-${body}`;
    return body;
}

/** The list of studies under the chart, as one line: "SMA 20 · RSI 14". */
export function printStudies(names: readonly string[]): string | null {
    const clean = names.map((name) => name.trim()).filter(Boolean);
    return clean.length > 0 ? clean.join(' · ') : null;
}

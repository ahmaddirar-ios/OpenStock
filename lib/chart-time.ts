// The chart's clock. The axis and the readout label bars in the trader's chosen zone, which matters
// on an exchange whose session is in another one — and which the browser's own zone cannot be
// trusted to provide on a phone that has travelled.

import type { Lang, StringKey } from '@/lib/i18n';

export type TimeZoneId = 'local' | 'UTC' | 'Asia/Riyadh' | 'America/New_York' | 'Europe/London' | 'Asia/Tokyo';

export const TIME_ZONES: { id: TimeZoneId; label: StringKey }[] = [
    { id: 'local', label: 'tz.local' },
    { id: 'UTC', label: 'tz.utc' },
    { id: 'Asia/Riyadh', label: 'tz.riyadh' },
    { id: 'America/New_York', label: 'tz.newYork' },
    { id: 'Europe/London', label: 'tz.london' },
    { id: 'Asia/Tokyo', label: 'tz.tokyo' },
];

export const DEFAULT_TIME_ZONE: TimeZoneId = 'local';

export function parseTimeZone(value: unknown): TimeZoneId {
    return typeof value === 'string' && TIME_ZONES.some((zone) => zone.id === value)
        ? (value as TimeZoneId)
        : DEFAULT_TIME_ZONE;
}

export const TIME_ZONE_KEY = 'openstock:chart-timezone';

type Readable = Pick<Storage, 'getItem'>;
type Writable = Pick<Storage, 'setItem'>;

export function readTimeZone(storage: Readable): TimeZoneId {
    try {
        return parseTimeZone(storage.getItem(TIME_ZONE_KEY));
    } catch {
        return DEFAULT_TIME_ZONE;
    }
}

export function writeTimeZone(storage: Writable, zone: TimeZoneId): void {
    try {
        storage.setItem(TIME_ZONE_KEY, zone);
    } catch {
        /* private mode: the zone still applies for this visit */
    }
}

/** `local` is the browser's zone, i.e. the option is left out of the formatter. */
const zoneOption = (zone: TimeZoneId) => (zone === 'local' ? undefined : zone);

/** What a tick on the axis is asking for, mapped from lightweight-charts' own tick-mark kinds. */
export type TickKind = 'year' | 'month' | 'day' | 'time' | 'seconds';

const OPTIONS: Record<TickKind, Intl.DateTimeFormatOptions> = {
    year: { year: 'numeric' },
    month: { month: 'short' },
    day: { day: 'numeric', month: 'short' },
    time: { hour: '2-digit', minute: '2-digit', hour12: false },
    seconds: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
};

/**
 * The locale the canvas is formatted in. `ar-u-nu-arab` is deliberate: plain `ar` resolves to
 * Latin digits in current ICU, and the whole point is an axis that reads Arabic-Indic like the
 * rest of the interface. The canvas needs no bidi isolates; it shapes the run itself.
 */
const locale = (lang: Lang) => (lang === 'ar' ? 'ar-u-nu-arab' : 'en-GB');

/** The label for one axis tick, in the chosen zone and the interface's language. */
export function tickLabel(kind: TickKind, seconds: number, zone: TimeZoneId, lang: Lang = 'en'): string {
    try {
        return new Intl.DateTimeFormat(locale(lang), { ...OPTIONS[kind], timeZone: zoneOption(zone) }).format(seconds * 1000);
    } catch {
        return '';
    }
}

/** The full stamp for the crosshair tooltip: `12 Nov 2026, 14:30` / `١٢ نوفمبر ٢٠٢٦، ١٤:٣٠`. */
export function timeLabel(seconds: number, zone: TimeZoneId, lang: Lang = 'en'): string {
    try {
        return new Intl.DateTimeFormat(locale(lang), {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: zoneOption(zone),
        }).format(seconds * 1000);
    } catch {
        return '';
    }
}

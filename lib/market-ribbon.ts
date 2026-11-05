// The ribbon's one line of market truth. Formatting lives here, away from the markup, because the
// difference between "4.5B" and "4,484,633,653" is the difference between a terminal and a report.
import type { WorldBoardPayload } from '@/lib/world-board';

export type RibbonQuote = { short: string; price: number; changePercent: number };

/** The indices the ribbon prints, in the order a Saudi reader scans them: home first, then neighbours. */
export const RIBBON_SHORTS = ['TASI', 'DFMGI', 'FADGI', 'BKP', 'EGX30', 'SPX'] as const;

/**
 * The rows the ribbon can actually draw. An index the feed did not answer is left out rather than
 * printed as a zero: a zero is a price, and a market is never priced at nothing.
 */
export function ribbonQuotes(board: WorldBoardPayload, shorts: readonly string[] = RIBBON_SHORTS): RibbonQuote[] {
    const byShort = new Map<string, RibbonQuote>();
    for (const section of board.sections) {
        for (const quote of section.quotes) {
            if (byShort.has(quote.short)) continue;
            byShort.set(quote.short, { short: quote.short, price: quote.price, changePercent: quote.changePercent });
        }
    }
    return shorts.flatMap((short) => {
        const quote = byShort.get(short);
        return quote && Number.isFinite(quote.price) && quote.price > 0 ? [quote] : [];
    });
}

const UNITS: ReadonlyArray<{ at: number; en: string; ar: string }> = [
    { at: 1e9, en: 'B', ar: 'مليار' },
    { at: 1e6, en: 'M', ar: 'مليون' },
    { at: 1e3, en: 'K', ar: 'ألف' },
];

const ARABIC = '٠١٢٣٤٥٦٧٨٩';
const arabic = (text: string) => text.replace(/[0-9]/g, (digit) => ARABIC[Number(digit)]);

/**
 * A figure a glance can hold: 4.5B rials, 253M shares. Hundreds keep no decimal (253M, not 252.6M),
 * everything below them keeps one (9.5K), and anything small enough to read whole stays whole.
 */
export function compactFigure(value: number, lang: 'ar' | 'en'): string {
    const magnitude = Math.abs(value);
    const unit = UNITS.find((entry) => magnitude >= entry.at);
    if (!unit) {
        const whole = String(Math.round(value));
        return lang === 'ar' ? arabic(whole) : whole;
    }
    const scaled = value / unit.at;
    const decimals = Math.abs(scaled) >= 100 ? 0 : 1;
    const digits = scaled.toFixed(decimals);
    if (lang === 'ar') return `${arabic(digits).replace('.', '٫')} ${unit.ar}`;
    return `${digits}${unit.en}`;
}

/** A change, signed the way a terminal signs it: a real minus, never an ASCII hyphen. */
export function signedPercent(value: number, lang: 'ar' | 'en'): string {
    const digits = Math.abs(value).toFixed(2);
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    if (lang === 'ar') return `${sign}${arabic(digits).replace('.', '٫')}٪`;
    return `${sign}${digits}%`;
}

/** A last price: grouped every three digits, two decimals, in the reader's digits. */
export function formatPrice(value: number, lang: 'ar' | 'en'): string {
    const digits = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return lang === 'ar' ? arabic(digits).replace(/,/g, '٬').replace(/\./g, '٫') : digits;
}

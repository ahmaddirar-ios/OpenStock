import { arDigits, type Lang } from '@/lib/i18n';

/** A number as a percent, or an em dash when the data cannot support it. */
export function pct(value: number | null | undefined, lang: Lang, digits = 2): string {
    if (value == null || !Number.isFinite(value)) return '—';
    const text = `${(value * 100).toFixed(digits)}%`;
    return arDigits(text, lang);
}

/** A plain number, or an em dash. */
export function num(value: number | null | undefined, lang: Lang, digits = 2): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return arDigits(value.toFixed(digits), lang);
}

/** Bars as a whole number with its unit. */
export function bars(value: number | null | undefined, lang: Lang): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return arDigits(String(Math.round(value)), lang);
}

// What the trader is told when a rule fires, decided without a browser, a database or a clock: the
// toast copy, the cooldown key that stops a flapping quote from saying the same thing twice, and the
// switch reading. The shell's alert loop and the alert centre both read this file, so the two can
// never describe one firing differently.

import { alertConditionLabel, alertTargetLabel, measureLabel } from '@/lib/alert-labels';
import { arDigits, tx, type Lang } from '@/lib/i18n';
import type { AlertCondition } from '@/lib/alerts';

/** One rule of a fired group, as the server reports it. */
export type FiredRule = { condition: AlertCondition; targetPrice: number; value: number };

/**
 * One firing, in the shape the pages already deal in. A grouped rule set fires as one alert; its
 * rules come along so the toast can name the one that tripped instead of the group's first rule.
 */
export type FiredNotice = {
    id: string;
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
    value: number;
    /** The item's price at the moment of firing; absent for change rules. */
    price?: number | null;
    /** How many rules the alert had; the server sends a count, the rules travel in `ruleList`. */
    rules?: number;
    ruleList?: FiredRule[];
};

/** The same rule cannot repeat itself inside this window. */
export const ALERT_COOLDOWN_SECONDS = 300;

export const ALERT_NOTIFY_KEY = 'openstock:alert-notify';
export const ALERT_SOUND_KEY = 'openstock:alert-sound';

export type AlertNotifyPrefs = { toast: boolean; sound: boolean };

/** Toast and sound are on by default: an alert that asks before it alerts is not an alert. */
export const DEFAULT_NOTIFY_PREFS: AlertNotifyPrefs = { toast: true, sound: true };

/** Reads the two switches; anything unreadable falls back to the defaults. */
export function readNotifyPrefs(read: (key: string) => string | null): AlertNotifyPrefs {
    const flag = (key: string, fallback: boolean) => {
        const value = read(key);
        return value === null ? fallback : value === '1';
    };
    return { toast: flag(ALERT_NOTIFY_KEY, DEFAULT_NOTIFY_PREFS.toast), sound: flag(ALERT_SOUND_KEY, DEFAULT_NOTIFY_PREFS.sound) };
}

/** The `localStorage`-shaped write for both switches; a storage that refuses simply forgets. */
export function writeNotifyPrefs(prefs: AlertNotifyPrefs, write: (key: string, value: string) => void): void {
    write(ALERT_NOTIFY_KEY, prefs.toast ? '1' : '0');
    write(ALERT_SOUND_KEY, prefs.sound ? '1' : '0');
}

/** The message one firing shows: the symbol and what the tripped rule measured. */
export function firingMessage(hit: FiredNotice, lang: Lang): string {
    const first = firingRules(hit)[0];
    const value = measureLabel(lang, first.condition, first.value);
    return tx(lang, 'alerts.firedAt').replace('{s}', hit.symbol).replace('{p}', value);
}

/**
 * The rules a firing stands for: its own, or the first one that crossed when the group joined with
 * "or" (the other side of an "and" is already true, so naming it would be noise).
 */
export function firingRules(hit: FiredNotice): FiredRule[] {
    if (hit.ruleList && hit.ruleList.length > 0) return hit.ruleList;
    return [{ condition: hit.condition, targetPrice: hit.targetPrice, value: hit.value }];
}

/** The detail line: the rule that fired and the price it tripped at. */
export function firingDetail(hit: FiredNotice, lang: Lang): string {
    const first = firingRules(hit)[0];
    const rule = `${alertConditionLabel(lang, first.condition)} ${alertTargetLabel(lang, first.condition, first.targetPrice)}`;
    const price = hit.price == null ? '' : ` · ${arDigits(hit.price.toFixed(2), lang)}`;
    return `${rule}${price}`;
}

/** What several firings in one check say together. */
export function firingBatch(count: number, lang: Lang): string {
    return tx(lang, 'alerts.firedMany').replace('{n}', arDigits(count, lang));
}

/**
 * The firings worth announcing at `now`: each rule once per cooldown window. The map handed back
 * carries the times this call remembers, so the caller keeps it and passes it to the next check.
 */
export function freshFirings(
    hits: readonly FiredNotice[],
    seen: Readonly<Record<string, number>>,
    now: number,
): { fresh: FiredNotice[]; seen: Record<string, number> } {
    const next: Record<string, number> = {};
    const fresh: FiredNotice[] = [];
    for (const hit of hits) {
        // A grouped alert fires once, so its claim id is the whole cooldown key.
        const key = `${hit.id}:${hit.condition}`;
        const last = seen[key];
        if (last != null && now - last < ALERT_COOLDOWN_SECONDS) {
            next[key] = last;
            continue;
        }
        next[key] = now;
        fresh.push(hit);
    }
    return { fresh, seen: next };
}

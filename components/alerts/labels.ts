import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import { type AlertCondition } from '@/lib/alerts';

// One place that names a condition and formats its target. The centre and the watchlist panel
// both read an alert row, and a percent rule must never be printed as a price in either.

export const ALERT_CONDITIONS: AlertCondition[] = [
    'ABOVE',
    'BELOW',
    'CROSS_UP',
    'CROSS_DOWN',
    'CHANGE_UP',
    'CHANGE_DOWN',
];

const CONDITION_KEYS: Record<AlertCondition, StringKey> = {
    ABOVE: 'alerts.cond.above',
    BELOW: 'alerts.cond.below',
    CROSS_UP: 'alerts.cond.crossUp',
    CROSS_DOWN: 'alerts.cond.crossDown',
    CHANGE_UP: 'alerts.cond.changeUp',
    CHANGE_DOWN: 'alerts.cond.changeDown',
};

/** The change rules carry a percentage; every other rule carries a price. */
export const isPercentAlert = (condition: AlertCondition): boolean =>
    condition === 'CHANGE_UP' || condition === 'CHANGE_DOWN';

export const alertConditionLabel = (lang: Lang, condition: AlertCondition): string =>
    tx(lang, CONDITION_KEYS[condition] ?? 'alerts.cond.above');

/** The target as the trader reads it: a percent for the change rules, a plain price otherwise. */
export const alertTargetLabel = (lang: Lang, condition: AlertCondition, target: number): string =>
    isPercentAlert(condition) ? `${arDigits(target, lang)}%` : arDigits(Number(target).toFixed(2), lang);

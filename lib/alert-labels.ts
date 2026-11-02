import { arDigits, tx, type Lang, type StringKey } from '@/lib/i18n';
import { PARAM_BOUNDS, type AlertCondition } from '@/lib/alerts';

// One place that names a condition and formats its target. The centre and the watchlist panel
// both read an alert row, and a percent rule must never be printed as a price in either.

export const ALERT_CONDITIONS: AlertCondition[] = [
    'ABOVE',
    'BELOW',
    'CROSS_UP',
    'CROSS_DOWN',
    'CHANGE_UP',
    'CHANGE_DOWN',
    'RSI_BELOW',
    'RSI_ABOVE',
    'PRICE_CROSS_UP_SMA',
    'PRICE_CROSS_DOWN_SMA',
    'VOLUME_SPIKE',
];

const CONDITION_KEYS: Record<AlertCondition, StringKey> = {
    ABOVE: 'alerts.cond.above',
    BELOW: 'alerts.cond.below',
    CROSS_UP: 'alerts.cond.crossUp',
    CROSS_DOWN: 'alerts.cond.crossDown',
    CHANGE_UP: 'alerts.cond.changeUp',
    CHANGE_DOWN: 'alerts.cond.changeDown',
    RSI_BELOW: 'alerts.cond.rsiBelow',
    RSI_ABOVE: 'alerts.cond.rsiAbove',
    PRICE_CROSS_UP_SMA: 'alerts.cond.crossUpSma',
    PRICE_CROSS_DOWN_SMA: 'alerts.cond.crossDownSma',
    VOLUME_SPIKE: 'alerts.cond.volumeSpike',
};

/** The change rules carry a percentage; every other rule carries a price. */
export const isPercentAlert = (condition: AlertCondition): boolean =>
    condition === 'CHANGE_UP' || condition === 'CHANGE_DOWN';

export const alertConditionLabel = (lang: Lang, condition: AlertCondition): string =>
    tx(lang, CONDITION_KEYS[condition] ?? 'alerts.cond.above');

/**
 * The target as the trader reads it. A percent for the change rules, a plain price otherwise —
 * except the SMA crosses, whose number is the period, so it is named as one.
 */
export const alertTargetLabel = (lang: Lang, condition: AlertCondition, target: number): string => {
    if (isPercentAlert(condition)) return `${arDigits(target, lang)}%`;
    if (condition === 'PRICE_CROSS_UP_SMA' || condition === 'PRICE_CROSS_DOWN_SMA') {
        return `SMA ${arDigits(Math.round(target), lang)}`;
    }
    if (condition === 'VOLUME_SPIKE') return `${arDigits(target, lang)}×`;
    return arDigits(Number(target).toFixed(2), lang);
};

/** The second number a rule asks for, in the label the form and the row both use. */
export const alertParamsLabel = (lang: Lang, condition: AlertCondition, params?: { period?: number; window?: number }): string => {
    if (condition === 'RSI_BELOW' || condition === 'RSI_ABOVE') {
        return `${tx(lang, 'alerts.param.period')} ${arDigits(params?.period ?? PARAM_BOUNDS.rsiPeriod.default, lang)}`;
    }
    if (condition === 'VOLUME_SPIKE') {
        return `${tx(lang, 'alerts.param.window')} ${arDigits(params?.window ?? PARAM_BOUNDS.volumeWindow.default, lang)}`;
    }
    return '';
};

/** What a rule measured, unit included, for the row's "last …" and "fired …" text. */
export const measureLabel = (lang: Lang, condition: AlertCondition, value: number): string => {
    if (condition === 'VOLUME_SPIKE') return `${arDigits(value.toFixed(2), lang)}×`;
    if (condition === 'RSI_BELOW' || condition === 'RSI_ABOVE') return arDigits(Number(value).toFixed(1), lang);
    return arDigits(Number(value).toFixed(2), lang);
};

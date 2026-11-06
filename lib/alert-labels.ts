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
    'ATR_ABOVE',
    'CROSS_52W_HIGH',
    'CROSS_52W_LOW',
    'FORMULA',
    'STRATEGY',
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
    ATR_ABOVE: 'alerts.cond.atrAbove',
    CROSS_52W_HIGH: 'alerts.cond.cross52High',
    CROSS_52W_LOW: 'alerts.cond.cross52Low',
    DRAWING_CROSS_UP: 'alerts.cond.drawingCrossUp',
    DRAWING_CROSS_DOWN: 'alerts.cond.drawingCrossDown',
    DRAWING_TOUCH: 'alerts.cond.drawingTouch',
    FORMULA: 'alerts.cond.formula',
    STRATEGY: 'alerts.cond.strategy',
};

/** A rule attached to a drawing: its number is the line's own price, not something the trader types. */
export const isDrawingAlert = (condition: AlertCondition): boolean => condition.startsWith('DRAWING_');

/** The change rules carry a percentage; every other rule carries a price. */
export const isPercentAlert = (condition: AlertCondition): boolean =>
    condition === 'CHANGE_UP' || condition === 'CHANGE_DOWN';

export const alertConditionLabel = (lang: Lang, condition: AlertCondition): string =>
    tx(lang, CONDITION_KEYS[condition] ?? 'alerts.cond.above');

/** The unit the target is typed in, for the form's suffix. */
/** A rule that carries no number: the formula or the strategy is the whole condition. */
export const isTextAlert = (condition: AlertCondition): boolean => condition === 'FORMULA' || condition === 'STRATEGY';

export const alertTargetUnit = (condition: AlertCondition): string =>
    condition === 'VOLUME_SPIKE' ? '×' : isPercentAlert(condition) || condition === 'ATR_ABOVE' ? '%' : '';

/** What the target input asks for, per rule. */
export const alertTargetPlaceholder = (condition: AlertCondition): StringKey => {
    if (condition === 'CROSS_52W_HIGH' || condition === 'CROSS_52W_LOW') return 'alerts.targetLookback';
    return alertTargetUnit(condition) ? 'alerts.targetPercent' : 'alerts.targetPrice';
};

/**
 * The target as the trader reads it. A percent for the change rules, a plain price otherwise —
 * except the SMA crosses, whose number is the period, so it is named as one.
 */
export const alertTargetLabel = (lang: Lang, condition: AlertCondition, target: number): string => {
    if (isTextAlert(condition)) return '';
    if (isPercentAlert(condition) || condition === 'ATR_ABOVE') return `${arDigits(target, lang)}%`;
    if (condition === 'PRICE_CROSS_UP_SMA' || condition === 'PRICE_CROSS_DOWN_SMA') {
        return `SMA ${arDigits(Math.round(target), lang)}`;
    }
    if (condition === 'VOLUME_SPIKE') return `${arDigits(target, lang)}×`;
    // The 52-week rules carry their lookback in params, so the condition itself is the whole name.
    if (condition === 'CROSS_52W_HIGH' || condition === 'CROSS_52W_LOW') return '';
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
    if (condition === 'ATR_ABOVE') {
        return `${tx(lang, 'alerts.param.period')} ${arDigits(params?.period ?? PARAM_BOUNDS.atrPeriod.default, lang)}`;
    }
    return '';
};

/** What a rule measured, unit included, for the row's "last …" and "fired …" text. */
export const measureLabel = (lang: Lang, condition: AlertCondition, value: number): string => {
    // A formula or a strategy answers yes or no; the number behind it is not what a trader reads.
    if (isTextAlert(condition)) return tx(lang, value !== 0 ? 'alerts.measure.true' : 'alerts.measure.false');
    if (condition === 'VOLUME_SPIKE') return `${arDigits(value.toFixed(2), lang)}×`;
    if (condition === 'ATR_ABOVE') return `${arDigits(Number(value).toFixed(2), lang)}%`;
    if (condition === 'RSI_BELOW' || condition === 'RSI_ABOVE') return arDigits(Number(value).toFixed(1), lang);
    return arDigits(Number(value).toFixed(2), lang);
};

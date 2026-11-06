import { Schema, model, models, type Document, type Model } from 'mongoose';
import { ALERT_CONDITIONS, type AlertCondition } from '@/lib/alerts';

/**
 * The alert log: one row per firing, kept after the alert itself is re-armed, edited or deleted.
 *
 * An alert row answers "what am I watching now"; this answers "what happened". Without it, re-arming
 * a rule erased the only evidence it had ever fired, and a trader could not tell a quiet week from a
 * broken feed.
 */
export interface IAlertEvent extends Document {
    userId: string;
    /** The alert that fired. It may no longer exist; the log keeps the id anyway. */
    alertId: string;
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
    /** What the deciding rule measured. */
    value: number;
    price: number | null;
    changePercent: number | null;
    /** How the alert's rules were joined, so the log can say "all of" or "any of". */
    join: 'and' | 'or';
    /** How many rules the alert had. */
    rules: number;
    at: Date;
}

const AlertEventSchema = new Schema<IAlertEvent>(
    {
        userId: { type: String, required: true, index: true },
        alertId: { type: String, required: true },
        symbol: { type: String, required: true, uppercase: true, trim: true },
        condition: { type: String, enum: ALERT_CONDITIONS, required: true },
        targetPrice: { type: Number, default: 0 },
        value: { type: Number, default: 0 },
        price: { type: Number, default: null },
        changePercent: { type: Number, default: null },
        join: { type: String, enum: ['and', 'or'], default: 'and' },
        rules: { type: Number, default: 1 },
        at: { type: Date, default: Date.now },
    },
    { timestamps: true },
);

// The log is read newest-first for one user, and pruned by age.
AlertEventSchema.index({ userId: 1, at: -1 });

export const AlertEvent: Model<IAlertEvent> =
    (models?.AlertEvent as Model<IAlertEvent>) || model<IAlertEvent>('AlertEvent', AlertEventSchema);

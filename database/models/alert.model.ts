import { Schema, model, models, type Document, type Model } from 'mongoose';
import { ALERT_CONDITIONS, type AlertCondition, type AlertParams } from '@/lib/alerts';

/** One rule inside an alert. A single-rule alert is a group of one. */
export type AlertRuleSpec = {
    condition: AlertCondition;
    targetPrice: number;
    params: AlertParams;
    /** What this rule saw on the previous check: a price, or what a series rule measured. */
    lastValue?: number | null;
    /** A drawing rule's gap on the previous check. */
    lastGap?: number | null;
};

const AlertRuleSchema = new Schema<AlertRuleSpec>(
    {
        condition: { type: String, enum: ALERT_CONDITIONS, required: true },
        targetPrice: { type: Number, default: 0 },
        params: { type: Schema.Types.Mixed, default: {} },
        lastValue: { type: Number, default: null },
        lastGap: { type: Number, default: null },
    },
    { _id: false },
);

export interface IAlert extends Document {
    userId: string;
    symbol: string;
    targetPrice: number;
    condition: AlertCondition;
    /** The second number some rules carry: an RSI period or a volume window. */
    params: AlertParams;
    /**
     * Every rule the alert watches, joined by `join`. The first entry mirrors `condition` and
     * `targetPrice`, so a row written before groups existed still reads as a group of one.
     */
    rules: AlertRuleSpec[];
    /** How the rules combine: all of them, or any of them. */
    join: 'and' | 'or';
    active: boolean;
    triggered: boolean;
    /** The value seen on the previous check: a price, or what a series rule measured. */
    lastPrice: number | null;
    /** A drawing rule's line, snapshotted when the alert was made (null for every other rule). */
    anchor: unknown;
    /** Where the price sat relative to that line on the previous check. */
    lastGap: number | null;
    /** When and at what price the rule fired. */
    triggeredAt: Date | null;
    triggeredPrice: number | null;
    /** Whether the trader has seen the firing in the centre. */
    seen: boolean;
    expiresAt: Date;
    createdAt: Date;
}

const AlertSchema = new Schema<IAlert>(
    {
        userId: { type: String, required: true, index: true },
        symbol: { type: String, required: true, uppercase: true, trim: true },
        targetPrice: { type: Number, required: true },
        condition: { type: String, enum: ALERT_CONDITIONS, required: true },
        // Mixed rather than a nested schema: the second number differs by rule, and an old row
        // without it must keep working untouched.
        params: { type: Schema.Types.Mixed, default: {} },
        // Mixed: a rule's params differ by condition, and the gate is lib/alerts on the way in.
        rules: { type: [AlertRuleSchema], default: [] },
        join: { type: String, enum: ['and', 'or'], default: 'and' },
        active: { type: Boolean, default: true },
        triggered: { type: Boolean, default: false },
        lastPrice: { type: Number, default: null },
        // Mixed: a drawing snapshot is the same object the chart hands over, validated by
        // lib/drawing-alert on the way in and on the way out.
        anchor: { type: Schema.Types.Mixed, default: null },
        lastGap: { type: Number, default: null },
        triggeredAt: { type: Date, default: null },
        triggeredPrice: { type: Number, default: null },
        seen: { type: Boolean, default: false },
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
        },
        createdAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// The checker's query: live, unfired, unexpired rules, always for one user.
AlertSchema.index({ userId: 1, active: 1, triggered: 1, expiresAt: 1 });

export const Alert: Model<IAlert> = (models?.Alert as Model<IAlert>) || model<IAlert>('Alert', AlertSchema);

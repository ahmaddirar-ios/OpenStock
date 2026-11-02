import { Schema, model, models, type Document, type Model } from 'mongoose';
import { ALERT_CONDITIONS, type AlertCondition, type AlertParams } from '@/lib/alerts';

export interface IAlert extends Document {
    userId: string;
    symbol: string;
    targetPrice: number;
    condition: AlertCondition;
    /** The second number some rules carry: an RSI period or a volume window. */
    params: AlertParams;
    active: boolean;
    triggered: boolean;
    /** The value seen on the previous check: a price, or what a series rule measured. */
    lastPrice: number | null;
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
        active: { type: Boolean, default: true },
        triggered: { type: Boolean, default: false },
        lastPrice: { type: Number, default: null },
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

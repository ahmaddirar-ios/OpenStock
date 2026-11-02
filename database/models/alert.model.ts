import { Schema, model, models, type Document, type Model } from 'mongoose';

/** The six rules the alert engine knows. `CHANGE_*` targets are percentages, the rest are prices. */
export const ALERT_CONDITIONS = ['ABOVE', 'BELOW', 'CROSS_UP', 'CROSS_DOWN', 'CHANGE_UP', 'CHANGE_DOWN'] as const;

export interface IAlert extends Document {
    userId: string;
    symbol: string;
    targetPrice: number;
    condition: (typeof ALERT_CONDITIONS)[number];
    active: boolean;
    triggered: boolean;
    /** The price seen on the previous check; the cross rules compare against it. */
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

// The checker's query: live, unfired, unexpired rules.
AlertSchema.index({ active: 1, triggered: 1, expiresAt: 1 });

export const Alert: Model<IAlert> = (models?.Alert as Model<IAlert>) || model<IAlert>('Alert', AlertSchema);

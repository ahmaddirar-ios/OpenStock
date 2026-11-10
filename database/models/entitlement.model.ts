import { Schema, model, models, type Document, type Model } from 'mongoose';

// What one account may use: its plan and the exceptions on top of it. A missing row means the free
// plan with no exceptions, so a brand-new account needs no write at sign-up.
export interface EntitlementRow extends Document {
    userId: string;
    plan: string;
    /** Features granted on top of the plan. */
    allow: string[];
    /** Features taken away from the plan. Deny wins over allow. */
    deny: string[];
    /** Who last changed it, for the audit trail the admin panel shows. */
    updatedBy?: string;
    updatedAt: Date;
}

const EntitlementSchema = new Schema<EntitlementRow>(
    {
        userId: { type: String, required: true, unique: true, index: true, trim: true },
        plan: { type: String, enum: ['free', 'pro', 'premium'], default: 'free' },
        allow: { type: [String], default: [] },
        deny: { type: [String], default: [] },
        updatedBy: { type: String, default: '' },
    },
    { timestamps: true },
);

export const Entitlement: Model<EntitlementRow> =
    (models?.Entitlement as Model<EntitlementRow>) ||
    model<EntitlementRow>('Entitlement', EntitlementSchema);

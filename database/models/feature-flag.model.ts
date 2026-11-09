import { Schema, model, models, type Document, type Model } from 'mongoose';

// A switch the product reads at render time. The key is the identity; a missing row means the
// caller's fallback, so a flag that was never created behaves like the code's default.
export interface FeatureFlagRow extends Document {
    key: string;
    enabled: boolean;
    description: string;
    updatedAt: Date;
}

const FeatureFlagSchema = new Schema<FeatureFlagRow>(
    {
        key: { type: String, required: true, unique: true, index: true, trim: true },
        enabled: { type: Boolean, default: false },
        description: { type: String, default: '', maxlength: 280 },
    },
    { timestamps: true },
);

export const FeatureFlag: Model<FeatureFlagRow> =
    (models?.FeatureFlag as Model<FeatureFlagRow>) ||
    model<FeatureFlagRow>('FeatureFlag', FeatureFlagSchema);

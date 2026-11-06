import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';

/**
 * One row per user holding the custom strategies they saved. The strategy is a structured object
 * whose shape `lib/custom-strategy.ts` owns, so it is stored as a mixed value rather than duplicated
 * as a second schema — there is exactly one place the format can change.
 */
export interface StrategyItem {
    id: string;
    name: string;
    strategy: Record<string, unknown>;
    /** Milliseconds since the epoch, so two devices can keep the newest copy of one strategy. */
    updatedAt: number;
}

export interface StrategyDocument extends Document<Types.ObjectId> {
    userId: string;
    items: StrategyItem[];
    updatedAt: Date;
    createdAt: Date;
}

const StrategyItemSchema = new Schema<StrategyItem>(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        strategy: { type: Schema.Types.Mixed, required: true },
        updatedAt: { type: Number, default: 0 },
    },
    { _id: false },
);

const StrategySchema = new Schema<StrategyDocument>(
    {
        userId: { type: String, required: true, unique: true, index: true },
        items: { type: [StrategyItemSchema], default: [] },
    },
    { timestamps: true },
);

export const StrategyModel: Model<StrategyDocument> =
    (models.CustomStrategy as Model<StrategyDocument>) || model<StrategyDocument>('CustomStrategy', StrategySchema);

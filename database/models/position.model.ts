import { Schema, model, models, type Document, type Model } from 'mongoose';

export interface IPosition extends Document {
    userId: string;
    symbol: string;
    company: string;
    quantity: number;
    /** The average price paid per share, in the quote's own currency. */
    averageCost: number;
    createdAt: Date;
    updatedAt: Date;
}

const PositionSchema = new Schema<IPosition>(
    {
        userId: { type: String, required: true, index: true },
        symbol: { type: String, required: true, uppercase: true, trim: true },
        company: { type: String, required: true, trim: true },
        quantity: { type: Number, required: true, min: 0 },
        averageCost: { type: Number, required: true, min: 0 },
    },
    { timestamps: true }
);

// One position per symbol per user: editing a holding replaces it rather than stacking rows.
PositionSchema.index({ userId: 1, symbol: 1 }, { unique: true });

export const Position: Model<IPosition> =
    (models?.Position as Model<IPosition>) || model<IPosition>('Position', PositionSchema);

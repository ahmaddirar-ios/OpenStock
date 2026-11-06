import { Schema, model, models, type Document, type Model } from 'mongoose';

/**
 * One row per user holding the formulas they have saved. Before this, a shelf lived only in one
 * browser's localStorage — a new device, a new browser, or a cleared site meant the work was gone.
 *
 * The entries are stored as they travel rather than as a second schema: `lib/formula-library.ts` is
 * the gate every entry passes on the way in and on the way out, and a duplicated mongoose schema
 * would only be a second place for the format to drift.
 */
export interface FormulaItem {
    id: string;
    name: string;
    expression: string;
    /** Milliseconds since the epoch, so two devices can keep the newest copy of one formula. */
    updatedAt: number;
}

export interface FormulaDocument extends Document {
    userId: string;
    items: FormulaItem[];
    updatedAt: Date;
    createdAt: Date;
}

const FormulaItemSchema = new Schema<FormulaItem>(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        expression: { type: String, required: true },
        updatedAt: { type: Number, default: 0 },
    },
    { _id: false },
);

const FormulaSchema = new Schema<FormulaDocument>(
    {
        userId: { type: String, required: true, unique: true, index: true },
        items: { type: [FormulaItemSchema], default: [] },
    },
    { timestamps: true },
);

export const FormulaModel: Model<FormulaDocument> =
    (models.Formula as Model<FormulaDocument>) || model<FormulaDocument>('Formula', FormulaSchema);

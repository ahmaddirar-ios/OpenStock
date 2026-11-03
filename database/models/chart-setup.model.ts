import { Schema, model, models, type Document, type Model } from 'mongoose';

/**
 * One row per (user, symbol): the drawings and the studies that user has on that chart. Until this
 * existed, a chart setup lived only in one browser's localStorage — a new device, a new browser, or a
 * cleared site meant the work was gone.
 *
 * The two lists are stored as they travel (Mixed) rather than as a second schema: `lib/chart-setup.ts`
 * and `lib/chart-drawings.ts` are the single gate every entry passes, both on the way in and on the way
 * out, and a duplicated mongoose schema would only be a second place for the format to drift.
 */
export interface ChartSetupDocument extends Document {
    userId: string;
    symbol: string;
    /** The payload format version; a row written by an older format is re-pushed by the client. */
    v: number;
    drawings: unknown[];
    studies: unknown[];
    updatedAt: Date;
    createdAt: Date;
}

const ChartSetupSchema = new Schema<ChartSetupDocument>(
    {
        userId: { type: String, required: true, index: true },
        symbol: { type: String, required: true, uppercase: true, trim: true },
        v: { type: Number, required: true },
        drawings: { type: [Schema.Types.Mixed], default: [] },
        studies: { type: [Schema.Types.Mixed], default: [] },
    },
    { timestamps: true },
);

// One setup per symbol per user: the upsert on save relies on it.
ChartSetupSchema.index({ userId: 1, symbol: 1 }, { unique: true });

export const ChartSetupModel: Model<ChartSetupDocument> =
    (models?.ChartSetup as Model<ChartSetupDocument>) || model<ChartSetupDocument>('ChartSetup', ChartSetupSchema);

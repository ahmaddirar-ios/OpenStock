import { Schema, model, models, type Document, type Model } from 'mongoose';

// The last board the scanner gave us, whatever board it was: the key decides which one. `sa` is the
// Saudi market and `world` is the sections board, and they share this collection so there is one
// place that knows how a snapshot is written and read. One row per key, overwritten on every
// successful read, so a page can
// still show the market when the feed refuses (the Yahoo quota ran out once today; the scanner can
// do the same). Stale beats blank for a market page — as long as it says how old it is.
export interface SaudiBoardSnapshot extends Document {
    key: string;
    payload: unknown;
    updatedAt: Date;
}

const SaudiBoardSchema = new Schema<SaudiBoardSnapshot>(
    {
        key: { type: String, required: true, unique: true },
        payload: { type: Schema.Types.Mixed, required: true },
        updatedAt: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

export const SaudiBoardSnapshotModel: Model<SaudiBoardSnapshot> =
    (models?.SaudiBoardSnapshot as Model<SaudiBoardSnapshot>) ||
    model<SaudiBoardSnapshot>('SaudiBoardSnapshot', SaudiBoardSchema);

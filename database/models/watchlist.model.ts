import { Schema, model, models, type Document, type Model } from 'mongoose';

export interface WatchlistItem extends Document {
    userId: string;
    symbol: string;
    company: string;
    /** A user-named list ("Dividends", "Watch for entry"). Blank reads as the default group. */
    group: string;
    /** A free-text note shown under the symbol. */
    note: string;
    /** Lower-case labels for filtering. */
    tags: string[];
    addedAt: Date;
}

const WatchlistSchema = new Schema<WatchlistItem>(
    {
        userId: { type: String, required: true, index: true },
        symbol: { type: String, required: true, uppercase: true, trim: true },
        company: { type: String, required: true, trim: true },
        group: { type: String, trim: true, default: 'General', maxlength: 40 },
        note: { type: String, trim: true, default: '', maxlength: 280 },
        tags: { type: [String], default: [] },
        addedAt: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

// Prevent duplicate symbols per user
WatchlistSchema.index({ userId: 1, symbol: 1 }, { unique: true });
// The table filters by group, so the list is read in that order.
WatchlistSchema.index({ userId: 1, group: 1, addedAt: -1 });

export const Watchlist: Model<WatchlistItem> =
    (models?.Watchlist as Model<WatchlistItem>) || model<WatchlistItem>('Watchlist', WatchlistSchema);
